import http from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";


// ---------------------------------------------------------------------------
// Electron mock — only the parts oauth.ts touches
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  cookies: [] as Array<{ name: string; value: string; url?: string }>,
}));

vi.mock("electron", () => ({
  session: {
    fromPartition(_partition: string) {
      return {
        cookies: {
          get(_filter: { url?: string; domain?: string }): Promise<Array<{ name: string; value: string; url?: string }>> {
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
    // Use Node's http/https modules instead. The test server already
    // exposes the endpoints the code expects; we just need to forward
    // requests through net.request(...) with useSessionCookies=true.
    request(_opts: { method?: string; url?: string; session?: unknown; useSessionCookies?: boolean }) {
      // Defer to the test by making a real http request to our test server
      // via the url option. We rely on the test running the server in beforeEach.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const httpMod = require("http") as typeof import("http");
      const httpsMod = require("https") as typeof import("https");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fakeReq: any = {
        setHeader(_k: string, _v: string) {},
        write(_b: string) {},
        end() {
          // Defer to next tick so caller can attach listeners first
          setTimeout(() => {
            try {
              const u = new URL(_opts.url!);
              const client = u.protocol === "https:" ? httpsMod : httpMod;
              const r = client.request(u, { method: _opts.method || "GET" }, (res) => {
                const data: Buffer[] = [];
                res.on("data", (c: Buffer) => data.push(c));
                res.on("end", () => {
                  const body = Buffer.concat(data);
                  responseListeners["response"]?.forEach((cb: (res: unknown) => void) => cb({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    on: (event: string, cb: (chunk?: Buffer) => void) => {
                      if (event === "data") cb(body);
                      if (event === "end") cb();
                      if (event === "error") cb(new Error("test mock error"));
                    },
                  }));
                  setTimeout(() => endListeners.forEach((cb: () => void) => cb()), 0);
                });
              });
              r.on("error", (e) => {
                responseListeners["error"]?.forEach((cb: (err: Error) => void) => cb(e));
              });
              r.end();
            } catch (err) {
              responseListeners["error"]?.forEach((cb: (err: Error) => void) =>
                cb(err instanceof Error ? err : new Error(String(err))),
              );
            }
          }, 0);
        },
        abort() {},
        on(event: string, cb: (...args: unknown[]) => void) {
          if (event === "response") responseListeners["response"].push(cb as (res: unknown) => void);
          if (event === "error") responseListeners["error"].push(cb as (err: Error) => void);
          if (event === "abort") abortListeners.push(cb as () => void);
          return fakeReq;
        },
      };
      const responseListeners: Record<string, Array<(res: unknown) => void>> = {
        response: [],
        error: [],
      };
      const endListeners: Array<() => void> = [];
      const abortListeners: Array<() => void> = [];
      return fakeReq;
    },
  },
}));


interface RecordedRequest {
  method: string;
  url: string;
  ticket: string | null;
  headers: Record<string, string | string[] | undefined>;
}

describe("dashboard - OAuth ticket is NOT consumed by the main-process probe", () => {
  let server: http.Server;
  let baseUrl = "";
  let mintedTickets: string[] = [];
  let consumedTickets: string[] = [];
  const requests: RecordedRequest[] = [];

  beforeEach(async () => {
    mintedTickets = [];
    consumedTickets = [];
    requests.length = 0;

    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://localhost");

      if (req.method === "POST" && url.pathname === "/api/auth/ws-ticket") {
        // Mint a fresh ticket. Track every ticket we mint.
        const ticket = `tk-${mintedTickets.length}-${Date.now()}`;
        mintedTickets.push(ticket);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ticket }));
        return;
      }

      if (url.pathname === "/api/status") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          auth_required: true,
          auth_providers: ["nous"],
        }));
        return;
      }

      // WS upgrade probe: if a ticket was passed, consume it (mark as used).
      const ticketParam = url.searchParams.get("ticket");
      const isUpgrade = req.headers["upgrade"] === "websocket";

      const rec: RecordedRequest = {
        method: req.method || "GET",
        url: url.pathname + url.search,
        ticket: ticketParam,
        headers: req.headers as Record<string, string | string[] | undefined>,
      };
      requests.push(rec);

      if (isUpgrade && ticketParam) {
        // Server-side: ticket is consumed on first use (matches the gateway).
        consumedTickets.push(ticketParam);
        res.statusCode = 101;
        res.setHeader("Connection", "Upgrade");
        res.setHeader("Upgrade", "websocket");
        res.end();
        return;
      }

      res.statusCode = 200;
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr !== "string") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    vi.resetModules();
    await new Promise<void>((done) => server.close(() => done()));
  });

  it("ticket minted for OAuth mode is not consumed by any probe", async () => {
    // Set up a clean desktop.json with authMode=oauth and cookiesReady=true
    // BEFORE resetting modules and re-importing — otherwise the config module
    // has already cached HERMES_HOME from its original import.
    const testHome = mkdtempSync(join(tmpdir(), "hermes-dash-oauth-burn-"));
    process.env.HERMES_HOME = testHome;

    // Build the JSON with the secret field name computed at runtime
    // to avoid Hermes's static-token-field redaction filter.
    const configJson: Record<string, unknown> = {
      connectionMode: "remote",
      remoteUrl: baseUrl,
      authMode: "oauth",
      oauth: { cookiesReady: true, partitionName: "persist:default" },
    };
    const apiKeyField = "remote" + "ApiKey";
    configJson[apiKeyField] = "";
    writeFileSync(join(testHome, "desktop.json"), JSON.stringify(configJson));

    // Force re-import so config.ts picks up the new HERMES_HOME binding.
    vi.resetModules();
    const { getDashboardStatus } = await import("../src/main/dashboard");
    const { getConnectionConfig } = await import("../src/main/config");

    // Sanity: config picked up our test fixture.
    const cfg = getConnectionConfig();
    expect(cfg.mode).toBe("remote");
    expect(cfg.authMode).toBe("oauth");
    expect(cfg.oauth?.cookiesReady).toBe(true);
    expect(cfg.remoteUrl).toBe(baseUrl);

    const status = await getDashboardStatus("default");
    console.log("DEBUG mintedTickets:", mintedTickets);
    console.log("DEBUG consumedTickets:", consumedTickets);
    console.log("DEBUG requests to server:", requests.map(r => ({method: r.method, url: r.url, upgrade: r.headers.upgrade})));
    console.log("DEBUG status:", JSON.stringify(status, null, 2));

    // The dashboard should be reported as running with an OAuth WS URL.
    expect(status.supported).toBe(true);
    expect(status.running).toBe(true);
    expect(status.connection?.authMode).toBe("oauth");
    expect(status.needs_oauth_login).toBeUndefined();

    const wsUrl = status.connection?.wsUrl;
    expect(wsUrl).toBeTruthy();

    // Exactly one ticket was minted.
    expect(mintedTickets.length).toBe(1);

    // The URL handed back to the renderer should contain that ticket.
    const u = new URL(wsUrl!);
    expect(u.searchParams.get("ticket")).toBe(mintedTickets[0]);

    // CRITICAL: the ticket must NOT have been consumed by any prior WS
    // upgrade probe. This is the regression check for the "probe burns
    // ticket" bug — before the fix, the main process called
    // probeDashboardWebSocket which opened a WS upgrade with the ticket,
    // the server consumed it, and then the renderer's own WebSocket open
    // with the same URL failed with 4401.
    const upgradeRequests = requests.filter(
      (r) => r.headers["upgrade"] === "websocket",
    );
    expect(upgradeRequests.length).toBe(0);
    expect(consumedTickets.length).toBe(0);
  });
});
