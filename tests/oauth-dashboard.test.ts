import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Electron mock — BrowserWindow, net, session
// ---------------------------------------------------------------------------

type CookieFilter = { url?: string; domain?: string };
type Cookie = { name: string; value: string; secure?: boolean; domain?: string; path?: string };

const h = vi.hoisted(() => ({
  cookies: [] as Cookie[],
  requestHandlers: new Map<
    string,
    { statusCode: number; body: string | null }
  >(),
  winEvents: {} as Record<string, ((...args: unknown[]) => void)[]>,
  webContentsEvents: {} as Record<string, ((...args: unknown[]) => void)[]>,
  winDestroyed: false,
  winClosedHandled: false,
  loadUrlCalled: null as string | null,
}));

function fireWinEvent(event: string, ...args: unknown[]): void {
  (h.winEvents[event] ?? []).forEach((cb) => cb(...args));
}
function fireWebContentsEvent(event: string, ...args: unknown[]): void {
  (h.webContentsEvents[event] ?? []).forEach((cb) => cb(...args));
}

vi.mock("electron", () => ({
  BrowserWindow: class {
    webContents = {
      on(event: string, cb: (...args: unknown[]) => void): void {
        if (!h.webContentsEvents[event]) h.webContentsEvents[event] = [];
        h.webContentsEvents[event].push(cb);
      },
    };
    on(event: string, cb: (...args: unknown[]) => void): void {
      if (!h.winEvents[event]) h.winEvents[event] = [];
      h.winEvents[event].push(cb);
    }
    loadURL(url: string): Promise<void> {
      h.loadUrlCalled = url;
      return Promise.resolve();
    }
    isDestroyed(): boolean {
      return h.winDestroyed;
    }
    destroy(): void {
      h.winDestroyed = true;
    }
  },
  session: {
    fromPartition(_partition: string) {
      return {
        cookies: {
          get(filter: CookieFilter): Promise<Cookie[]> {
            const url = filter.url ?? "";
            const domain = filter.domain ?? "";
            if (url || domain) {
              return Promise.resolve([...h.cookies]);
            }
            return Promise.resolve([...h.cookies]);
          },
          remove(_url: string, _name: string): Promise<void> {
            return Promise.resolve();
          },
        },
      };
    },
  },
  net: {
    request(opts: { url: string }) {
      const handler = h.requestHandlers.get(opts.url);
      const responseListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
      const requestListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

      return {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        setHeader(): void {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        write(): void {},
        end(): void {
          const res = handler ?? { statusCode: 200, body: '{"ticket":"test-ticket"}' };
          const resObj = {
            statusCode: res.statusCode,
            headers: { "content-type": "application/json" },
            on(event: string, cb: (...args: unknown[]) => void): void {
              if (!responseListeners[event]) responseListeners[event] = [];
              responseListeners[event].push(cb);
            },
          };
          (requestListeners["response"] ?? []).forEach((cb) => cb(resObj));
          setTimeout(() => {
            const dataListeners = responseListeners["data"] ?? [];
            const endListeners = responseListeners["end"] ?? [];
            if (res.body) {
              dataListeners.forEach((cb) => cb(Buffer.from(res.body ?? "")));
            }
            endListeners.forEach((cb) => cb());
          }, 0);
        },
        on(event: string, cb: (...args: unknown[]) => void): void {
          if (!requestListeners[event]) requestListeners[event] = [];
          requestListeners[event].push(cb);
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        abort(): void {},
      };
    },
  },
}));

async function loadOAuth(): Promise<typeof import("../src/main/oauth")> {
  vi.resetModules();
  return import("../src/main/oauth");
}

// ---------------------------------------------------------------------------

describe("oauthDashboardLogin", () => {
  beforeEach(() => {
    h.cookies = [];
    h.requestHandlers.clear();
    h.winEvents = {};
    h.webContentsEvents = {};
    h.winDestroyed = false;
    h.loadUrlCalled = null;
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // @lat: [[lat.md/oauth-login#Browser login flow]]
  it("resolves ok when session cookies appear after navigation to /auth/callback", async () => {
    const { oauthDashboardLogin } = await loadOAuth();

    const loginPromise = oauthDashboardLogin("http://hermes.local", "default");

    // Wait for the BrowserWindow to be created
    await new Promise((r) => setTimeout(r, 10));

    h.cookies = [
      { name: "hermes_session_at", value: "tok1" },
      { name: "hermes_session_rt", value: "tok2" },
    ];

    // Simulate navigation to callback
    fireWebContentsEvent("did-navigate", null, "http://hermes.local/auth/callback?email=alice@example.com");

    const result = await loginPromise;
    expect(result.ok).toBe(true);
  });

  // @lat: [[lat.md/oauth-login#Browser login flow]]
  it("resolves with error when window is closed before cookies arrive", async () => {
    const { oauthDashboardLogin } = await loadOAuth();

    // 127.0.0.1:1 fails fast with ECONNREFUSED, so getAuthProviders resolves
    // immediately with the ["nous"] fallback
    const loginPromise = oauthDashboardLogin("http://127.0.0.1:1", "default");
    await new Promise((r) => setTimeout(r, 10));

    fireWinEvent("closed");

    const result = await loginPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/closed/i);
  }, 10000);
});

describe("mintGatewayWsTicket", () => {
  beforeEach(() => {
    h.requestHandlers.clear();
  });

  // @lat: [[lat.md/ws-ticket-minting#Ticket minting]]
  it("returns ticket string on 200 response", async () => {
    h.requestHandlers.set("http://hermes.local/api/auth/ws-ticket", {
      statusCode: 200,
      body: JSON.stringify({ ticket: "abc123" }),
    });
    const { mintGatewayWsTicket } = await loadOAuth();
    const ticket = await mintGatewayWsTicket("http://hermes.local", "default");
    expect(ticket).toBe("abc123");
  });

  // @lat: [[lat.md/ws-ticket-minting#Ticket minting]]
  it("throws with NEEDS_RELOGIN code on 401 response", async () => {
    h.requestHandlers.set("http://hermes.local/api/auth/ws-ticket", {
      statusCode: 401,
      body: "Unauthorized",
    });
    const { mintGatewayWsTicket } = await loadOAuth();
    await expect(mintGatewayWsTicket("http://hermes.local", "default")).rejects.toMatchObject({
      code: "NEEDS_RELOGIN",
    });
  });
});

describe("freshGatewayWsUrl", () => {
  beforeEach(() => {
    h.requestHandlers.clear();
  });

  // @lat: [[lat.md/ws-ticket-minting#Fresh WS URL]]
  it("mints a new ticket on every call (no caching)", async () => {
    let callCount = 0;
    const tickets = ["ticket-a", "ticket-b"];
    const origRequest = (await import("electron")).net.request;
    // Override to return distinct tickets per call
    vi.spyOn((await import("electron")).net, "request").mockImplementation((opts: { url: string }) => {
      if (typeof opts.url === "string" && opts.url.includes("/api/auth/ws-ticket")) {
        const body = JSON.stringify({ ticket: tickets[callCount++ % tickets.length] });
        const responseListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
        const requestListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
        return {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          setHeader(): void {},
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          write(): void {},
          end(): void {
            const resObj = {
              statusCode: 200,
              headers: { "content-type": "application/json" },
              on(event: string, cb: (...args: unknown[]) => void): void {
                if (!responseListeners[event]) responseListeners[event] = [];
                responseListeners[event].push(cb);
              },
            };
            (requestListeners["response"] ?? []).forEach((cb) => cb(resObj));
            setTimeout(() => {
              (responseListeners["data"] ?? []).forEach((cb) => cb(Buffer.from(body)));
              (responseListeners["end"] ?? []).forEach((cb) => cb());
            }, 0);
          },
          on(event: string, cb: (...args: unknown[]) => void): void {
            if (!requestListeners[event]) requestListeners[event] = [];
            requestListeners[event].push(cb);
          },
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          abort(): void {},
        } as ReturnType<typeof origRequest>;
      }
      return origRequest(opts);
    });

    const { freshGatewayWsUrl } = await loadOAuth();
    const url1 = await freshGatewayWsUrl("http://hermes.local", "default");
    const url2 = await freshGatewayWsUrl("http://hermes.local", "default");
    expect(url1).not.toBe(url2);
    expect(url1).toContain("ticket=ticket-a");
    expect(url2).toContain("ticket=ticket-b");
    vi.restoreAllMocks();
  });
});

describe("hasOAuthSessionCookies", () => {
  beforeEach(() => {
    h.cookies = [];
  });

  // @lat: [[lat.md/oauth-login#Session cookie detection]]
  it("returns true when both session cookies are present", async () => {
    h.cookies = [
      { name: "hermes_session_at", value: "access" },
      { name: "hermes_session_rt", value: "refresh" },
    ];
    const { hasOAuthSessionCookies } = await loadOAuth();
    expect(await hasOAuthSessionCookies("http://hermes.local", "default")).toBe(true);
  });

  // @lat: [[lat.md/oauth-login#Session cookie detection]]
  it("returns false when only one session cookie is present", async () => {
    h.cookies = [{ name: "hermes_session_at", value: "access" }];
    const { hasOAuthSessionCookies } = await loadOAuth();
    expect(await hasOAuthSessionCookies("http://hermes.local", "default")).toBe(false);
  });
});
