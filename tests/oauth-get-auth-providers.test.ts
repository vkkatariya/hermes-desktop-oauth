import http from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("getAuthProviders", () => {
  let server: http.Server;
  let baseUrl = "";

  beforeEach(async () => {
    server = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ auth_required: true, auth_providers: ["nous"] }));
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

  it("returns the providers list from the default fetcher (real /api/status)", async () => {
    const { getAuthProviders } = await import("../src/main/oauth");
    const providers = await getAuthProviders(baseUrl);
    expect(providers).toEqual(["nous"]);
  });

  it("strips trailing slash from baseUrl before composing /api/status", async () => {
    const requests: string[] = [];
    const trackingFetcher = async (url: string) => {
      // Capture what URL was composed
      const u = new URL("/api/status", url.endsWith("/") ? url : url + "/");
      requests.push(`${u.protocol}//${u.host}${u.pathname}`);
      // Return default
      return ["nous"];
    };
    const { getAuthProviders } = await import("../src/main/oauth");
    await getAuthProviders(`${baseUrl}/`, trackingFetcher);
    // Should be a clean URL with no double slash in the path
    expect(requests[0]).not.toContain("//api");
  });

  it("filters out non-string and empty entries from the providers list", async () => {
    const { getAuthProviders } = await import("../src/main/oauth");
    const fetcher = async () => ["nous", 123 as unknown as string, "", "github"];
    const providers = await getAuthProviders(baseUrl, fetcher);
    expect(providers).toEqual(["nous", "github"]);
  });

  it("returns the providers when only one provider exists", async () => {
    const { getAuthProviders } = await import("../src/main/oauth");
    const fetcher = async () => ["nous"];
    expect(await getAuthProviders(baseUrl, fetcher)).toEqual(["nous"]);
  });

  it("returns the providers when multiple providers exist", async () => {
    const { getAuthProviders } = await import("../src/main/oauth");
    const fetcher = async () => ["nous", "github", "google"];
    expect(await getAuthProviders(baseUrl, fetcher)).toEqual(["nous", "github", "google"]);
  });

  it("falls back to ['nous'] when fetcher throws", async () => {
    const { getAuthProviders } = await import("../src/main/oauth");
    const failingFetcher = async () => {
      throw new Error("network unreachable");
    };
    expect(await getAuthProviders(baseUrl, failingFetcher)).toEqual(["nous"]);
  });

  it("falls back to ['nous'] when fetcher returns an empty list", async () => {
    const { getAuthProviders } = await import("../src/main/oauth");
    const fetcher = async () => [];
    expect(await getAuthProviders(baseUrl, fetcher)).toEqual(["nous"]);
  });

  it("falls back to ['nous'] when given a malformed URL (real fetcher)", async () => {
    const { getAuthProviders } = await import("../src/main/oauth");
    expect(await getAuthProviders("not a url")).toEqual(["nous"]);
  });

  it("falls back to ['nous'] when dashboard is unreachable (real fetcher)", async () => {
    const { getAuthProviders } = await import("../src/main/oauth");
    expect(await getAuthProviders("http://127.0.0.1:1")).toEqual(["nous"]);
  });
});
