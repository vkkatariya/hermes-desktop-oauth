# hermes-desktop-oauth — Tasks

## Phase 0: Setup ✅

- [x] Fork `fathah/hermes-desktop` → `vkkatariya/hermes-desktop-oauth`
- [x] Clone fork to `~/dev-shared/projects/hermes-desktop-oauth/`
- [x] Verify `git remote -v` shows both `origin` (fork) and `upstream` (fathah)
- [x] Add `CONTEXT.md`, `tasks/{DEVLOG,todo,lessons}.md`
- [x] Decide "partial setup" path (preserve upstream's AGENTS.md / CLAUDE.md / CI / electron-builder.yml)
- [x] Patch `README.md` URLs `fathah/` → `vkkatariya/hermes-desktop-oauth`
- [x] Push `main` branch (initial commit)
- [x] Create and push `dev` branch

## Phase 1: Audit (research-only) ✅

> **Full audit report:** [`tasks/audits/phase-1-audit.md`](audits/phase-1-audit.md) (345 lines, 7 sections, 17 files characterized).
> **Summary:** [`tasks/audits/phase-1-audit-summary.md`](audits/phase-1-audit-summary.md) (apply-agent quick-ref).

- [x] **1.1** Dispatched research subagent (opencode) to inventory every auth-related file in upstream
- [x] **1.2** Agent returned structured 7-section report (A: Inventory, B: IPC conventions, C: i18n, D: dashboard flow gap with code quotes, E: test patterns, F: lat.md integration, G: risks/gotchas)
- [x] **1.3** Parent verified critical claims (channel regex, namespace collision, line numbers) — all confirmed
- [x] **1.4** Audit saved to `tasks/audits/phase-1-audit.md`; summary in `phase-1-audit-summary.md`
- [x] **1.5** todo.md updated to reflect audit findings (colons → kebab-case, `oauth-dashboard-*` prefix, file list expanded)

**Key audit findings that shape Phase 2:**
- Primary integration point: `src/main/dashboard.ts:379-391` (the hard-coded "OAuth not wired" error)
- Channel naming MUST be kebab-case (`oauth-dashboard-*`); colons illegal
- `ConnectionConfig` ripples through 7+ files; update in lockstep
- Settings UI is tightly coupled to token path; need careful `getConnectionApiKeyForSave()` handling
- Clean slate — no abandoned OAuth attempts
- lat.md integration is wide open — we'll be the first to add dashboard-auth entries

**Next:** Phase 2 — write apply kickoff referencing the audit + port spec from official `main.cjs:3940-4220`, then dispatch coding agent.

## Phase 2: Apply (port + extend)

> **Channel naming constraint (discovered in audit):** `tests/preload-api-surface.test.ts:233,243` enforces `/^[a-z][a-z0-9-]*$/`. **NO COLONS allowed.** Use kebab-case: `oauth-dashboard-login`, `oauth-dashboard-status`, `oauth-dashboard-logout`. Also: `oauth-login*` namespace is already taken by provider sign-in (`src/main/ipc/register.ts:283-312`), so dashboard OAuth must use `oauth-dashboard-*` prefix.

- [ ] **2.1** Create `feat/oauth-ticket-flow` branch off `dev`
- [ ] **2.2** Apply agent ports Nous's `electron/main.cjs:3940–4220` into:
  - `src/main/oauth.ts` (new) — `oauthLoginConnectionConfig`, `freshGatewayWsUrl`, `mintGatewayWsTicket`
  - `src/main/config.ts` — extend `ConnectionConfig` with `authMode: "token" | "oauth"` and `oauth: { lastLoginAt, cookiesReady, partition }`; mirror in `PublicConnectionConfig`
  - `src/main/dashboard.ts` — switch `getRemoteDashboardStatusForConfig` + WS URL building to OAuth path when `authMode === "oauth"` (replace lines 379-391's hard-coded error)
  - `src/main/remote-sessions.ts` — extend `RemoteSessionConfig` to accept OAuth partition (Phase 2 may defer this to follow-up)
  - `src/main/ipc/register.ts` — register new channels: `oauth-dashboard-login`, `oauth-dashboard-status`, `oauth-dashboard-logout`
  - `src/preload/index.ts` + `index.d.ts` — expose `oauthDashboardLogin(url)`, `oauthDashboardStatus()`, `oauthDashboardLogout()`
  - `src/renderer/src/screens/Settings/Settings.tsx` — "Connect to Remote Hermes" remote tab gets `Auth: Token / OAuth` radio + "Sign in with Nous" button + status display
  - `src/shared/i18n/locales/en/settings.ts` + `welcome.ts` — add `authMode*`, `oauth*` keys (full list in `tasks/audits/phase-1-audit.md` Section C)
- [ ] **2.3** Tests (vitest, in `tests/` per upstream convention):
  - OAuth login window opens expected URL
  - `mintGatewayWsTicket` returns ticket string on 200
  - `mintGatewayWsTicket` throws "needs re-login" on 401
  - `freshGatewayWsUrl` mints per call when in OAuth mode (no caching of stale tickets)
  - `getRemoteDashboardStatusForConfig` reports `needs_oauth_login` correctly when no cookies
- [ ] **2.4** Update `lat.md/main-process.md` and/or `lat.md/window-chrome.md` with `@lat:` refs for the new OAuth module
- [ ] **2.5** Run `npm run typecheck && npm test && npm run build` locally on athena
- [ ] **2.6** `npm run lint` (informational)
- [ ] **2.7** Commit + push `feat/oauth-ticket-flow`
- [ ] **2.8** Parent verifies via `git diff --stat`, opens `feat/oauth-ticket-flow → dev` PR review

## Phase 3: End-to-end verify (Mac)

- [ ] **3.1** User (Vishal) clones fork on Mac
- [ ] **3.2** `npm ci && npm run build:mac` → signed/notarized `.dmg` (or local-dev build if signing not set up)
- [ ] **3.3** Install `.dmg`, launch Hermes.app
- [ ] **3.4** Settings → Connect to Remote Hermes → URL = `https://<athena-tailnet>/dashboard` → Auth = OAuth
- [ ] **3.5** Click "Sign in with Nous" → BrowserWindow opens → Portal OAuth round-trip → cookies set → return to Settings → "Connected"
- [ ] **3.6** Open chat tab → WebSocket connects with fresh `?ticket=` → full dashboard features (model picker, slash commands, session sync) work
- [ ] **3.7** Quit + relaunch Hermes.app → cookies persist (persistent partition) → auto-reconnect, no re-login needed
- [ ] **3.8** Verify 24h refresh-token rotation by waiting >15min (manual) — gateway should rotate AT cookie transparently

## Phase 4: PR upstream

- [ ] **4.1** Open PR `vkkatariya/hermes-desktop-oauth:feat/oauth-ticket-flow` → `fathah/hermes-desktop:main`
- [ ] **4.2** PR body: problem statement, screenshots/recording of working flow, port mapping (which lines from `NousResearch/hermes-agent/apps/desktop/electron/main.cjs:3940–4220` go where), test results, `lat.md` updates
- [ ] **4.3** Address reviewer feedback, re-verify
- [ ] **4.4** Merge → upstream `fathah/hermes-desktop@main`
- [ ] **4.5** DEVLOG final entry: shipped upstream, link to PR

## Stretch (out of scope, parked)

- SSH-tunnel support for OAuth (currently community app has token+SSH; OAuth+SSH is more complex)
- Multi-profile OAuth (cookie jar per profile)
- Auto-detect gated vs non-gated mode without user toggle (infer from `/api/status` response shape)
