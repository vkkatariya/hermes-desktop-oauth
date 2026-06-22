import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let testHome: string;

async function loadModule(): Promise<typeof import("../src/main/config")> {
  vi.resetModules();
  vi.stubEnv("HERMES_HOME", testHome);
  return await import("../src/main/config");
}

describe("connection config OAuth fields", () => {
  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), "hermes-config-oauth-"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(testHome, { recursive: true, force: true });
  });

  // @lat: [[lat.md/gated-dashboard-auth#ConnectionConfig OAuth fields#Default authMode]]
  it("defaults authMode to token when no config file exists", async () => {
    const { getConnectionConfig } = await loadModule();
    const config = getConnectionConfig();
    expect(config.authMode).toBe("token");
    expect(config.oauth?.cookiesReady).toBe(false);
  });

  // @lat: [[lat.md/gated-dashboard-auth#ConnectionConfig OAuth fields#authMode persistence]]
  it("persists authMode oauth across setConnectionConfig/getConnectionConfig", async () => {
    const { getConnectionConfig, setConnectionConfig } = await loadModule();
    const base = getConnectionConfig();
    setConnectionConfig({ ...base, authMode: "oauth" });
    const updated = getConnectionConfig();
    expect(updated.authMode).toBe("oauth");
  });

  // @lat: [[lat.md/gated-dashboard-auth#ConnectionConfig OAuth fields#Switching authMode preserves other fields]]
  it("switching authMode does not wipe oauth sub-fields", async () => {
    const { getConnectionConfig, setConnectionConfig } = await loadModule();
    const base = getConnectionConfig();
    setConnectionConfig({
      ...base,
      authMode: "oauth",
      oauth: { cookiesReady: true, lastLoginEmail: "user@example.com", lastLoginAt: 1_000 },
    });
    setConnectionConfig({ ...getConnectionConfig(), authMode: "token" });
    const after = getConnectionConfig();
    expect(after.authMode).toBe("token");
    expect(after.oauth?.lastLoginEmail).toBe("user@example.com");
  });

  // @lat: [[lat.md/gated-dashboard-auth#ConnectionConfig OAuth fields#PublicConnectionConfig no partitionName]]
  it("getPublicConnectionConfig omits partitionName from oauth object", async () => {
    const { getConnectionConfig, getPublicConnectionConfig, setConnectionConfig } =
      await loadModule();
    const base = getConnectionConfig();
    setConnectionConfig({
      ...base,
      authMode: "oauth",
      oauth: {
        cookiesReady: true,
        partitionName: "persist:hermes-oauth-default",
        lastLoginEmail: "user@example.com",
      },
    });
    const pub = getPublicConnectionConfig();
    expect((pub.oauth as Record<string, unknown> | undefined)?.partitionName).toBeUndefined();
    expect(pub.oauth?.cookiesReady).toBe(true);
    expect(pub.oauth?.lastLoginEmail).toBe("user@example.com");
  });

  // @lat: [[lat.md/gated-dashboard-auth#ConnectionConfig OAuth fields#Migration from no-authMode JSON]]
  it("migrates existing JSON without authMode to token defaults", async () => {
    const { writeFileSync } = await import("fs");
    const { join: pathJoin } = await import("path");
    writeFileSync(
      pathJoin(testHome, "connection.json"),
      JSON.stringify({ mode: "remote", remoteUrl: "http://example.com", apiKey: "tok" }),
    );
    const { getConnectionConfig } = await loadModule();
    const config = getConnectionConfig();
    expect(config.authMode).toBe("token");
    expect(config.oauth?.cookiesReady).toBe(false);
    expect(config.remoteUrl).toBe("http://example.com");
  });
});
