import http from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let testHome: string;

async function loadDashboardModule() {
  vi.resetModules();
  vi.stubEnv("HERMES_HOME", testHome);
  return await import("../src/main/dashboard");
}

let oauthServer: http.Server | null = null;
let oauthPort = 0;

function startOAuthGatedServer(): Promise<void> {
  return new Promise((resolve) => {
    oauthServer = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      // auth_required: true signals gated dashboard mode
      res.end(JSON.stringify({ auth_required: true }));
    });
    oauthServer.listen(0, "127.0.0.1", () => {
      const addr = oauthServer!.address();
      if (addr && typeof addr !== "string") oauthPort = addr.port;
      resolve();
    });
  });
}

afterEach(async () => {
  vi.unstubAllEnvs();
  if (oauthServer) {
    await new Promise<void>((done) => oauthServer!.close(() => done()));
    oauthServer = null;
  }
  if (testHome) {
    rmSync(testHome, { recursive: true, force: true });
  }
});

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "hermes-dash-oauth-"));
});

describe("dashboard status — needs_oauth_login", () => {
  it("reports needs_oauth_login=true when dashboard is gated and no cookies are available", async () => {
    await startOAuthGatedServer();
    const baseUrl = `http://127.0.0.1:${oauthPort}`;
    const dashboard = await loadDashboardModule();

    // Seed the config with authMode: "oauth" but cookiesReady: false
    // (i.e. user hasn't signed in yet). Save directly to desktop.json.
    const { writeFileSync } = await import("fs");
    writeFileSync(
      join(testHome, "desktop.json"),
      JSON.stringify({
        connectionMode: "remote",
        remoteUrl: baseUrl,
        authMode: "oauth",
        oauth: { cookiesReady: false, partitionName: "persist:test" },
      }),
    );

    const status = await dashboard.getDashboardStatus("default");

    expect(status.supported).toBe(true);
    expect(status.running).toBe(false);
    expect(status.needs_oauth_login).toBe(true);
    expect(status.error).toMatch(/OAuth sign-in/i);
  });

  it("does not set needs_oauth_login for non-gated dashboards", async () => {
    const plainServer = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ auth_required: false }));
    });
    await new Promise<void>((resolve) => {
      plainServer.listen(0, "127.0.0.1", () => {
        const addr = plainServer.address();
        if (addr && typeof addr !== "string") oauthPort = addr.port;
        resolve();
      });
    });
    oauthServer = plainServer;
    const baseUrl = `http://127.0.0.1:${oauthPort}`;
    const dashboard = await loadDashboardModule();

    // Seed token mode — should not surface needs_oauth_login even on gated status
    const { writeFileSync } = await import("fs");
    writeFileSync(
      join(testHome, "desktop.json"),
      JSON.stringify({
        connectionMode: "remote",
        remoteUrl: baseUrl,
        remoteApiKey: "tok",
        authMode: "token",
      }),
    );

    const status = await dashboard.getDashboardStatus("default");
    expect(status.needs_oauth_login).toBeUndefined();
  });
});