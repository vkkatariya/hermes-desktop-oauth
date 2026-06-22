import http from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Electron mock — session.fromPartition (needed by oauth.ts mintGatewayWsTicket)
// ---------------------------------------------------------------------------

type CookieFilter = { url?: string; domain?: string };
type Cookie = { name: string; value: string; secure?: boolean; domain?: string; path?: string };

const h = vi.hoisted(() => ({
  cookies: [] as Cookie[],
  ticketRequests: [] as Array<{ url: string; partition: string }>,
}));

vi.mock("electron", () => ({
  session: {
    fromPartition(partition: string) {
      return {
        cookies: {
          get(_filter: CookieFilter): Promise<Cookie[]> {
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
    request(opts: { url: string; partition?: string }) {
      h.ticketRequests.push({ url: opts.url, partition: opts.partition ?? "" });
      // Each call returns a unique ticket so we can verify per-call freshness
      const ticket = `ticket-${h.ticketRequests.length}`;
      const responseListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
      const requestListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

      return {
        setHeader(): void {},
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
            const dataListeners = responseListeners["data"] ?? [];
            const endListeners = responseListeners["end"] ?? [];
            dataListeners.forEach((cb) => cb(Buffer.from(JSON.stringify({ ticket }))));
            endListeners.forEach((cb) => cb());
          }, 0);
        },
        on(event: string, cb: (...args: unknown[]) => void): void {
          if (!requestListeners[event]) requestListeners[event] = [];
          requestListeners[event].push(cb);
        },
        abort(): void {},
      };
    },
  },
}));

interface RecordedRequest {
  method: string;
  url: string;
  ticket: string;
  token: string;
}

describe("remoteRequestJson — OAuth mode", () => {
  let server: http.Server;
  let baseUrl = "";
  const requests: RecordedRequest[] = [];

  beforeEach(async () => {
    h.cookies = [];
    h.ticketRequests.length = 0;
    requests.length = 0;

    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      requests.push({
        method: req.method || "GET",
        url: url.pathname + url.search,
        ticket: url.searchParams.get("ticket") || "",
        token: String(req.headers["x-hermes-session-token"] || ""),
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end("{}");
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
    await new Promise<void>((done) => server.close(() => done()));
  });

  it("mints a fresh ticket per call when authMode is oauth", async () => {
    const { remoteRequestJson } = await import("../src/main/remote-sessions");
    const config = {
      remoteUrl: baseUrl,
      apiKey: "",
      authMode: "oauth" as const,
      oauthProfile: "default",
    };

    await remoteRequestJson(config, "/api/sessions?limit=1");
    await remoteRequestJson(config, "/api/model/library");
    await remoteRequestJson(config, "/api/sessions?limit=5");

    // 3 mint attempts captured by the electron.net mock
    expect(h.ticketRequests.length).toBe(3);
    // 3 outbound data requests
    expect(requests.length).toBe(3);

    // Each data call carried a unique ticket (per-call freshness)
    const tickets = requests.map((r) => r.ticket);
    expect(new Set(tickets).size).toBe(3); // all different

    // OAuth mode does NOT send token header
    expect(requests.every((r) => r.token === "")).toBe(true);
  });

  it("token mode is unchanged (header, no ticket)", async () => {
    const { remoteRequestJson } = await import("../src/main/remote-sessions");
    const config = {
      remoteUrl: baseUrl,
      apiKey: "test-token",
      authMode: "token" as const,
    };

    await remoteRequestJson(config, "/api/sessions?limit=1");

    // No ticket mints in token mode
    expect(h.ticketRequests.length).toBe(0);
    // Single data request with token in header
    expect(requests.length).toBe(1);
    expect(requests[0].token).toBe("test-token");
    expect(requests[0].ticket).toBe("");
  });

  it("falls back to default profile when oauthProfile is omitted", async () => {
    const { remoteRequestJson } = await import("../src/main/remote-sessions");
    const config = {
      remoteUrl: baseUrl,
      apiKey: "",
      authMode: "oauth" as const,
    };

    await remoteRequestJson(config, "/api/sessions?limit=1");
    expect(h.ticketRequests.length).toBe(1);
  });
});
