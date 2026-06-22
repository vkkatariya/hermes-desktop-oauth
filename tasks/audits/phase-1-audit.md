# Phase 1 Audit Report — hermes-desktop-oauth

> **Audit-only, no code changes.** Date: 2026-06-22. Branch: `dev`.
> Goal: map every auth-related file in `fathah/hermes-desktop` so we can port Nous's OAuth + single-use WS-ticket flow into the community app.
> Tool: `opencode` (free, narrow-scope default for audit work). Duration: ~134s.

---

## Section A — Inventory

### 1. CONTEXT.md
- **Path:** `/home/radxa/dev-shared/projects/hermes-desktop-oauth/CONTEXT.md`
- **Current responsibility:** Project-level context document for the fork.
- **Auth surface:** No code. Mentions `src/main/hermes-auth.ts` and `src/main/dashboard.ts` (lines 47-49).
- **Touch?** No.

### 2. tasks/todo.md
- **Path:** `tasks/todo.md`
- **Current responsibility:** Phased plan.
- **Auth surface:** No code. Proposes new `src/main/oauth.ts`, `ConnectionConfig.authMode`, IPC channels (lines 36-44).
- **Touch?** No (planning only).

### 3. AGENTS.md / CLAUDE.md
- **Path:** `AGENTS.md`
- **Current responsibility:** lat.md workflow instructions.
- **Auth surface:** None.
- **Touch?** No.

### 4. src/main/hermes-auth.ts
- **Path:** `src/main/hermes-auth.ts`
- **Current responsibility:** **LLM-provider OAuth, NOT dashboard OAuth.** Supervises `hermes auth add <provider> --type oauth` CLI subprocesses for providers (OpenAI Codex, xAI Grok, Qwen, Gemini, MiniMax, Nous Portal). Lines 24-31.
- **Auth surface:**
  - `OAUTH_LOGIN_PROVIDERS` / `OAuthLoginProvider` / `isOAuthLoginProvider` (lines 24-39)
  - `OAuthLoginResult` (lines 41-44)
  - `detectDeviceCode` (lines 56-70)
  - `runHermesAuthLogin(provider, emit, profile?)` (lines 86-163)
  - `cancelHermesAuthLogin()` (lines 169-173)
- **Touch?** No direct touch, but **must not collide** with `oauth-login*` IPC channels (register.ts:283-312).

### 5. src/main/dashboard.ts (PRIMARY TARGET)
- **Path:** `src/main/dashboard.ts`
- **Current responsibility:** Dashboard transport lifecycle. Builds `DashboardConnection` for local/remote/SSH modes; probes HTTP and WS.
- **Auth surface:**
  - `DashboardConnection` interface (lines 36-46) — currently carries `token: string`
  - `dashboardWsUrl(baseUrl, token)` (lines 71-76) — appends `?token=<token>`
  - `remoteDashboardConnectionFromConfig` (lines 95-110) — requires `apiKey`
  - `requestJson(url, token)` (lines 210-268) — sends `X-Hermes-Session-Token`
  - `probeDashboardWebSocket(connection)` (lines 270-325) — uses `wsUrl` with `?token=`
  - `dashboardStatusRequiresOAuth(status)` (lines 349-355) — **already detects gated mode** via `auth_required: true`
  - `getRemoteDashboardStatusForConfig` (lines 357-411) — **returns hard-coded error when OAuth required** (lines 384-391)
  - Same pattern for SSH (lines 413-483)
- **Touch?** **YES — primary integration point.**

### 6. src/main/ipc/register.ts
- **Path:** `src/main/ipc/register.ts`
- **Current responsibility:** Single registry for all IPC channels.
- **Auth surface (existing):**
  - Provider OAuth: `oauth-login` (line 283), `oauth-login-cancel` (line 312), `oauth-login-progress` (one-way push, line 295)
  - Connection: `get-connection-config`, `set-connection-config`, `set-connection-chat-transports`, `set-ssh-config`, `test-remote-connection`, `test-ssh-connection`, `start-ssh-tunnel`, `stop-ssh-tunnel`
  - API server key: `generate-api-server-key`, `get-api-server-key-status`, `invalidate-secrets-cache`
- **Touch?** **YES.** New dashboard-OAuth handlers go here.

### 7. src/preload/index.ts
- **Path:** `src/preload/index.ts`
- **Current responsibility:** Exposes typed `window.hermesAPI` bridge.
- **Auth surface:**
  - Provider OAuth: `oauthLogin`, `cancelOAuthLogin`, `onOAuthLoginProgress` (lines 149-161)
  - Connection: `getConnectionConfig`, `setConnectionConfig`, etc. (lines 241-367)
  - Dashboard: `dashboardStatus`, `startDashboard`, `stopDashboard` (lines 655-660)
- **Touch?** **YES.** New methods must be added here AND mirrored in `index.d.ts`.

### 8. src/main/config.ts
- **Path:** `src/main/config.ts`
- **Current responsibility:** Reads/writes `~/.hermes/desktop.json`.
- **Auth surface:**
  - `ConnectionConfig` (lines 45-52): `mode`, `remoteUrl`, `apiKey`, `remoteChatTransport`, `sshChatTransport`, `ssh`
  - `PublicConnectionConfig` (lines 54-65): exposes `hasApiKey`, `apiKeyLength` but never the key
  - `getConnectionConfig()` (lines 96-114), `getPublicConnectionConfig()` (lines 116-127), `setConnectionConfig()` (lines 129-146)
  - `resolveConnectionApiKeyUpdate(existing, mode, remoteUrl, apiKey?)` (lines 148-159) — preserves stored key when URL matches
- **Touch?** **YES.** Add `authMode: "token" | "oauth"` and `oauth` sub-object.

### 9. src/renderer/src/screens/Settings/Settings.tsx
- **Path:** `src/renderer/src/screens/Settings/Settings.tsx`
- **Current responsibility:** Settings UI — Local/Remote/SSH tabs, API-key input, Chat transport, test/save.
- **Auth surface:**
  - State: `connMode`, `connRemoteUrl`, `connApiKey`, `connApiKeyMask`, `connHasApiKey`, `remoteChatTransport`, `sshChatTransport`, `transportProbe` (lines 163-187)
  - `getConnectionApiKeyForSave()` (lines 371-382) — mask-preservation
  - `handleSaveConnection()` (lines 462-492) — calls `setConnectionConfig(mode, remoteUrl, apiKey)`
  - `handleTestConnection()` (lines 511-549) — calls `testRemoteConnection(url, apiKey)`
  - `handleChatTransportChange()` (lines 494-509)
  - Remote-mode UI (lines 982-1073)
- **Touch?** **YES.** Add Auth-mode radio (Token/OAuth), conditional API-key field, "Sign in with Nous" button, OAuth status display.

### 10. src/shared/i18n/locales/en/settings.ts
- **Path:** `src/shared/i18n/locales/en/settings.ts`
- **Current responsibility:** English strings for Settings. Namespace `settings`. camelCase.
- **Touch?** **YES** — see Section C for new keys.

### 11. src/shared/i18n/locales/en/welcome.ts
- **Path:** `src/shared/i18n/locales/en/welcome.ts`
- **Current responsibility:** English strings for Welcome/remote-connect dialog.
- **Touch?** Maybe — depends on whether the Welcome dialog also gains an auth-mode toggle.

### 12. src/main/remote-sessions.ts
- **Path:** `src/main/remote-sessions.ts`
- **Current responsibility:** CRUD + search for sessions against remote/SSH dashboard.
- **Auth surface:**
  - `RemoteSessionConfig` (lines 18-21): `remoteUrl`, `apiKey`
  - `remoteRequestJson<T>(config, path, options)` (lines 51-118)
- **Touch?** Indirectly YES — update `RemoteSessionConfig` to accept OAuth partition + on-demand ticket.

### 13. src/main/remote-models.ts
- **Path:** `src/main/remote-models.ts`
- **Auth surface:** Consumes `RemoteSessionConfig`.
- **Touch?** Indirectly via remote-sessions.ts.

### 14. src/main/remote-metadata.ts
- **Path:** `src/main/remote-metadata.ts`
- **Auth surface:** `remoteStatus(config)` (lines 28-69) — sends `X-Hermes-Session-Token` only if `apiKey` non-empty.
- **Touch?** Indirectly YES.

### 15. tests/ directory
- **Path:** `tests/`
- **~97 .test.ts files. Vitest runner.**
- **Relevant existing tests:**
  - `tests/hermes-auth.test.ts` — mocks child_process for provider OAuth
  - `tests/dashboard-remote.test.ts` — tests dashboard URL/token building
  - `tests/ipc-handlers.test.ts` — asserts every `ipcMain.handle` has matching `ipcRenderer.invoke`
  - `tests/preload-api-surface.test.ts` — asserts preload method/type coverage, **kebab-case channel enforcement**
  - `tests/connection-config-security.test.ts` — verifies API key never exposed
  - `tests/oauth-model-discovery.test.ts` — EXISTS, may have reusable helper (worth inspecting)

### 16. lat.md/main-process.md
- **Path:** `lat.md/main-process.md`
- **Mentions wallet/token handlers (lines 37-43).** No dashboard-auth entry.
- **Touch?** No for audit; new entries expected in Phase 2.

### 17. lat.md/window-chrome.md
- **Path:** `lat.md/window-chrome.md`
- **Touch?** No.

---

## Section B — IPC channel naming convention

- **kebab-case, NO colons.** Examples: `oauth-login`, `dashboard-status`, `start-ssh-tunnel`.
- **Regex enforced by `tests/preload-api-surface.test.ts:233,243`:**
  ```ts
  expect(ch).toMatch(/^[a-z][a-z0-9-]*$/);
  ```
- **Types** live in two places:
  1. Main: inline typed signatures in `src/main/ipc/register.ts`
  2. Preload: `src/preload/index.ts` typed method + `src/preload/index.d.ts` `HermesAPI` interface
- **New channels register** in `src/main/ipc/register.ts#registerIpcHandlers` (line 145)
- **Expose in preload** by adding to `hermesAPI` object in `src/preload/index.ts` + mirror in `index.d.ts`

---

## Section C — i18n key conventions

- **English paths:** `src/shared/i18n/locales/en/{settings,welcome,common,errors,chat,...}.ts`
- **Style:** camelCase top-level keys, nested objects for groups
- **Namespaces:** match filename (`t("settings.remoteUrl")`, `t("welcome.connectRemote")`)

**New keys needed (settings namespace):**
```ts
authModeLabel: "Authentication",
authModeToken: "API token",
authModeOAuth: "OAuth (Nous Portal)",
oauthLoginButton: "Sign in with Nous",
oauthLogoutButton: "Sign out",
oauthLoggedInAs: "Signed in as {{email}}",
oauthStatusReady: "OAuth session active",
oauthStatusNeedsLogin: "Sign in required",
oauthStatusConnecting: "Connecting to Nous Portal…",
oauthErrorBrowser: "Could not open sign-in window.",
oauthErrorCallback: "Sign-in did not complete. Please try again.",
```

**New keys needed (welcome namespace):** same `authMode*` and `oauthLoginButton` for first-time setup.

---

## Section D — Current dashboard connect flow (the gap)

### Step 1 — URL + token stored
```ts
// src/main/config.ts:96-114
export function getConnectionConfig(): ConnectionConfig {
  const data = readDesktopConfig();
  const ssh = (data.sshConfig as Partial<SshConnectionConfig>) ?? {};
  return {
    mode: (data.connectionMode as "local" | "remote" | "ssh") || "local",
    remoteUrl: (data.remoteUrl as string) || "",
    apiKey: (data.remoteApiKey as string) || "",
    ...
  };
}
```
Renderer receives only `hasApiKey` and `apiKeyLength` via `getPublicConnectionConfig()` for mask display.

### Step 2 — IPC channel invoked
```ts
// src/preload/index.ts:655-660
dashboardStatus: (profile?: string): Promise<DashboardStatus> =>
  ipcRenderer.invoke("dashboard-status", profile),
startDashboard: (profile?: string): Promise<DashboardStatus> =>
  ipcRenderer.invoke("start-dashboard", profile),
```

### Step 3 — `requestJson` adds `?token=` (via `dashboardWsUrl`)
```ts
// src/main/dashboard.ts:71-76
function dashboardWsUrl(baseUrl: string, token: string): string {
  const url = new URL("/api/ws", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}
```
REST probes use header instead:
```ts
// src/main/dashboard.ts:210-268
function requestJson(url: string, token: string, timeoutMs = 2_000): Promise<unknown> {
  ...
  headers: {
    "Content-Type": "application/json",
    "X-Hermes-Session-Token": token,
  },
  ...
}
```

### Step 4 — WS upgrade
```ts
// src/main/dashboard.ts:270-325
export function probeDashboardWebSocket(connection: DashboardConnection, timeoutMs = 2_000): Promise<void> {
  ...
  const req = client.request(parsed, {
    method: "GET",
    headers: {
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
      "Sec-WebSocket-Version": "13",
    },
  });
  ...
  req.on("upgrade", (_res, socket) => { socket.destroy(); finish(); });
}
```

### Step 5 — 401 from /api/status and the fallback-to-legacy gap
```ts
// src/main/dashboard.ts:349-355
function dashboardStatusRequiresOAuth(status: unknown): boolean {
  return (
    typeof status === "object" &&
    status !== null &&
    (status as { auth_required?: unknown }).auth_required === true
  );
}

// src/main/dashboard.ts:379-391
const status = await requestJson(
  `${connection.baseUrl}/api/status`,
  connection.token,
);
if (dashboardStatusRequiresOAuth(status)) {
  return {
    supported: true,
    running: false,
    error:
      "Remote dashboard requires OAuth browser authentication. Token-based remote dashboard is supported now; OAuth ticket flow is not wired in Hermes One yet.",
  };
}

// src/main/dashboard.ts:393-400
// /api/status is intentionally public upstream. Touch an authenticated
// endpoint as well so a legacy API key or stale token fails before the
// renderer opens the WebSocket.
await requestJson(
  `${connection.baseUrl}/api/sessions?limit=1`,
  connection.token,
);
await probeDashboardWebSocket(connection);
```

**The error message literally says "OAuth ticket flow is not wired in Hermes One yet." This is exactly the gap we are closing.**

---

## Section E — Test patterns

- **Location:** `tests/` at repo root. ~97 files. Vitest (`npm test` → `vitest run`).
- **Mocking:**
  - `vi.mock("../src/main/installer", ...)` to stub paths
  - `vi.mock("child_process", () => ({ spawn: spawnSpy }))` for subprocess tests
  - `vi.hoisted` for shared spies
  - `vi.resetModules()` + `vi.stubEnv("HERMES_HOME", testHome)` for config tests
  - `mkdtempSync` for temp dirs
- **Existing tests touching IPC/auth:**
  - `tests/ipc-handlers.test.ts` — bi-directional IPC coverage assertion
  - `tests/preload-api-surface.test.ts` — preload/type coverage + kebab-case regex
  - `tests/hermes-auth.test.ts` — provider OAuth subprocess
  - `tests/dashboard-remote.test.ts` — dashboard URL/token building
- **New test file suggestions:**
  - `tests/oauth-dashboard.test.ts` — mint ticket, build `?ticket=` URL, detect 401, re-login needed
  - `tests/dashboard-oauth-ticket.test.ts` — integrate with dashboard.ts
  - `tests/connection-config-oauth.test.ts` — `authMode` persistence, OAuth state not leaked

---

## Section F — lat.md integration

- **No existing dashboard-auth entry** in `lat.md/`
- **Zero `@lat:` refs** in `src/main/hermes-auth.ts`, `src/main/dashboard.ts`, `src/main/ipc/register.ts`
- **New entries to add:**
  - `lat.md/oauth-login.md` — BrowserWindow with `persist:oauth` partition, `/auth/login` → `/auth/callback`, HttpOnly cookies
  - `lat.md/ws-ticket-minting.md` — `POST /api/auth/ws-ticket`, single-use 30s ticket, `ws://…/api/ws?ticket=`
  - `lat.md/gated-dashboard-auth.md` — how `dashboard.ts` detects `auth_required: true`, switches token↔OAuth, reports `needs_oauth_login`

---

## Section G — Risks / gotchas

1. **Existing provider OAuth IPC channels already occupy `oauth-login-*` namespace** — use `oauth-dashboard-*` prefix to avoid collision.
2. **Preload channel-name regex enforced** — `/^[a-z][a-z0-9-]*$/`. **NO COLONS.** Todo.md suggestion of `oauth:login` etc. is illegal.
3. **Settings UI is tightly coupled to token path** — adding auth-mode radio requires careful `getConnectionApiKeyForSave()` so switching modes doesn't wipe saved token.
4. **`ConnectionConfig` shape change ripples** through 7+ files (config.ts, dashboard.ts, remote-sessions.ts, remote-models.ts, remote-metadata.ts, ipc/register.ts, preload/index.ts + .d.ts, Settings.tsx, plus tests).
5. **No half-implemented OAuth attempts** — clean slate, but no scaffolding to extend.
6. **Cookie persistence requires `persist:oauth` partition** — no existing cookie-partition management in the codebase.
7. **SSH + OAuth is stretch goal, not trivial** — Phase 2 should restrict OAuth to direct remote mode.

---

## Verification checklist (audit side)
- [x] Every file in the list was read or characterized
- [x] Section D includes actual code quotes with file:line refs
- [x] Section C suggests 5+ concrete i18n keys
- [x] Section G has at least one substantive risk/gotcha
- [x] No source files modified
- [x] No tests run
- [x] Branch remains `dev`
- [x] `git status` clean
