import { BrowserWindow, net, session } from "electron";
import https from "https";
import http from "http";

const OAUTH_SESSION_PARTITION_PREFIX="persist:hermes-oauth";


export interface OAuthLoginResult {
  ok: boolean;
  error?: string;
  email?: string;
}

export interface OAuthDashboardStatus {
  cookiesReady: boolean;
  lastLoginAt?: number;
  lastLoginEmail?: string;
}

// @lat: [[lat.md/oauth-login#Persistent OAuth partition]]
export function getOAuthPartition(profile: string): string {
  return `${OAUTH_SESSION_PARTITION_PREFIX}-${profile}`;
}

// @lat: [[lat.md/oauth-login#Session cookie detection]]


/**
 * Discover the auth providers the dashboard advertises via /api/status.
 *
 * Returns the list from `auth_providers` in the status response. If the
 * dashboard is unreachable or the response shape is unexpected, falls back
 * to `["nous"]` for backward compatibility with installs that predate
 * the multi-provider support.
 *
 * Used by oauthDashboardLogin to build the `/auth/login?provider=<name>`
 * URL — every known provider shape requires the query parameter.
 */
export async function getAuthProviders(
  baseUrl: string,
  // Dependency injection for testing. Defaults to a real http(s) GET.
  fetcher: typeof defaultFetcher = defaultFetcher,
): Promise<string[]> {
  return fetcher(baseUrl)
    .then((providers) => {
      const filtered = providers.filter(
        (p) => typeof p === "string" && p.length > 0,
      );
      return filtered.length > 0 ? filtered : ["nous"];
    })
    .catch(() => ["nous"]);
}

type Fetcher = (baseUrl: string) => Promise<string[]>;

const defaultFetcher: Fetcher = (baseUrl: string): Promise<string[]> => {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL("/api/status", baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
    } catch {
      resolve(["nous"]);
      return;
    }
    const client = parsed.protocol === "https:" ? https : http;
    const req = client.request(parsed, { method: "GET", timeout: 4000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          const json = JSON.parse(text) as { auth_providers?: unknown };
          if (Array.isArray(json.auth_providers)) {
            const providers = json.auth_providers.filter(
              (p): p is string => typeof p === "string" && p.length > 0,
            );
            if (providers.length > 0) {
              resolve(providers);
              return;
            }
          }
        } catch {
          // fall through to default
        }
        resolve(["nous"]);
      });
    });
    req.on("error", () => resolve(["nous"]));
    req.on("timeout", () => {
      req.destroy();
      resolve(["nous"]);
    });
    req.end();
  });
}

export async function hasOAuthSessionCookies(
  baseUrl: string,
  profile: string,
): Promise<boolean> {
  const parsed = new URL(baseUrl);
  const partition = getOAuthPartition(profile);
  const sess = session.fromPartition(partition);
  try {
    const cookies = await sess.cookies.get({ url: baseUrl });
    return cookiesHaveSession(cookies);
  } catch {
    try {
      const cookies = await sess.cookies.get({ domain: parsed.hostname });
      return cookiesHaveSession(cookies);
    } catch {
      return false;
    }
  }
}

function cookiesHaveSession(
  cookies: Electron.Cookie[],
): boolean {
  const names = new Set(cookies.map((c) => c.name));
  return names.has("hermes_session_at") && names.has("hermes_session_rt");
}

function parseCallbackEmail(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const email = parsed.searchParams.get("email");
    if (email) return email;
    const account = parsed.searchParams.get("account");
    if (account) return account;
  } catch {
    // ignore
  }
  return undefined;
}

// @lat: [[lat.md/oauth-login#Browser login flow]]
export async function oauthDashboardLogin(
  baseUrl: string,
  profile: string,
): Promise<OAuthLoginResult> {
  const partition = getOAuthPartition(profile);
  const sess = session.fromPartition(partition);
  const normalized = baseUrl.replace(/\/$/, "");
  const providers = await getAuthProviders(normalized);
  const provider = providers[0] ?? "nous";
  const loginUrl = `${normalized}/auth/login?provider=${encodeURIComponent(provider)}`;
  const callbackPrefix = `${normalized}/auth/callback`;

  return new Promise((resolve) => {
    let settled = false;
    let win: BrowserWindow | null = null;
    let pollTimer: NodeJS.Timeout | null = null;

    const finish = (result: OAuthLoginResult): void => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (win && !win.isDestroyed()) {
        try {
          win.destroy();
        } catch {
          // already torn down
        }
      }
      resolve(result);
    };

    const checkCookie = async (): Promise<void> => {
      if (settled) return;
      if (await hasOAuthSessionCookies(baseUrl, profile)) {
        finish({ ok: true, email: parseCallbackEmail(callbackPrefix) });
      }
    };

    try {
      win = new BrowserWindow({
        width: 520,
        height: 720,
        title: "Sign in to Hermes dashboard",
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          session: sess,
          webSecurity: true,
        },
      });
    } catch (err) {
      finish({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    win.webContents.on("did-navigate", (_event, url) => {
      if (url.startsWith(callbackPrefix)) void checkCookie();
    });
    win.webContents.on("did-redirect-navigation", (_event, url) => {
      if (url.startsWith(callbackPrefix)) void checkCookie();
    });
    win.webContents.on("did-frame-navigate", (_event, url) => {
      if (url.startsWith(callbackPrefix)) void checkCookie();
    });

    pollTimer = setInterval(() => void checkCookie(), 750);

    win.on("closed", () => {
      if (!settled) {
        finish({
          ok: false,
          error: "Sign-in window closed before authentication completed.",
        });
      }
    });

    win
      .loadURL(loginUrl)
      .catch((err) =>
        finish({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
  });
}

// @lat: [[lat.md/ws-ticket-minting#REST request with session cookies]]
function requestJsonViaOAuthSession(
  url: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {},
  profile: string,
): Promise<unknown> {
  const partition = getOAuthPartition(profile);
  const sess = session.fromPartition(partition);
  const timeoutMs = options.timeoutMs ?? 8_000;

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      reject(new Error(`Unsupported protocol: ${parsed.protocol}`));
      return;
    }

    const body = options.body ? JSON.stringify(options.body) : null;
    const request = net.request({
      method: options.method || "GET",
      url,
      session: sess,
      useSessionCookies: true,
      redirect: "follow",
    });
    request.setHeader("Content-Type", "application/json");
    request.setHeader("Accept", "application/json");

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        request.abort();
      } catch {
        // already finished
      }
      reject(new Error(`Timed out connecting to Hermes backend after ${timeoutMs}ms`));
    }, timeoutMs);

    request.on("response", (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        if (timedOut) return;
        clearTimeout(timer);
        const text = Buffer.concat(chunks).toString("utf8");
        const statusCode = res.statusCode || 500;
        if (statusCode >= 400) {
          const err = new Error(`${statusCode}: ${text || ""}`);
          if (statusCode === 401) {
            (err as Error & { code?: string }).code = "NEEDS_RELOGIN";
          }
          (err as Error & { statusCode?: number }).statusCode = statusCode;
          reject(err);
          return;
        }
        if (!text) {
          resolve(null);
          return;
        }
        const looksHtml = /^\s*<(?:!doctype|html)/i.test(text);
        const contentType = String(
          res.headers["content-type"] || res.headers["Content-Type"] || "",
        );
        if (looksHtml || contentType.includes("text/html")) {
          reject(
            new Error(`Expected JSON from ${url} but got HTML (status ${statusCode}).`),
          );
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch {
          reject(
            new Error(`Invalid JSON from ${url} (status ${statusCode}): ${text.slice(0, 200)}`),
          );
        }
      });
    });

    request.on("error", (error) => {
      if (timedOut) return;
      clearTimeout(timer);
      reject(error);
    });

    if (body) request.write(body);
    request.end();
  });
}

// @lat: [[lat.md/ws-ticket-minting#Ticket minting]]
export async function mintGatewayWsTicket(
  baseUrl: string,
  profile: string,
): Promise<string> {
  const body = (await requestJsonViaOAuthSession(
    `${baseUrl.replace(/\/$/, "")}/api/auth/ws-ticket`,
    { method: "POST", timeoutMs: 8_000 },
    profile,
  )) as { ticket?: unknown };
  const ticket = body?.ticket;
  if (!ticket || typeof ticket !== "string") {
    throw new Error("Gateway did not return a WS ticket.");
  }
  return ticket;
}

// @lat: [[lat.md/ws-ticket-minting#Fresh WS URL]]
export async function freshGatewayWsUrl(
  baseUrl: string,
  profile: string,
): Promise<string> {
  const ticket = await mintGatewayWsTicket(baseUrl, profile);
  const parsed = new URL(baseUrl);
  const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL("/api/ws", baseUrl);
  url.protocol = protocol;
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

// @lat: [[lat.md/oauth-login#Logout and session clearing]]
export async function clearOAuthSession(
  baseUrl: string,
  profile: string,
): Promise<void> {
  const partition = getOAuthPartition(profile);
  const sess = session.fromPartition(partition);
  try {
    const cookies = await sess.cookies.get(baseUrl ? { url: baseUrl } : {});
    await Promise.all(
      cookies.map(async (c) => {
        const scheme = c.secure ? "https" : "http";
        const domain = (c.domain ?? "").replace(/^\./, "");
        const cookieUrl = `${scheme}://${domain}${c.path || "/"}`;
        try {
          await sess.cookies.remove(cookieUrl, c.name);
        } catch {
          // ignore removal errors
        }
      }),
    );
  } catch {
    // best effort
  }
}
