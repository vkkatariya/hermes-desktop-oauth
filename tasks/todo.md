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

## Phase 1: Audit (research-only)

- [ ] **1.1** Dispatch research subagent to inventory every auth-related file in upstream:
  - `src/main/hermes-auth.ts` (provider OAuth flows for *LLM providers*)
  - `src/main/dashboard.ts` (the dashboard transport — the one missing OAuth)
  - `src/main/ipc/register.ts` (IPC channels)
  - `src/preload/index.ts` (preload bridge)
  - `src/renderer/src/screens/Settings/Settings.tsx` (UI)
  - `src/shared/i18n/locales/en/welcome.ts` + `settings.ts` (strings)
  - `src/main/connection-config.cjs` equivalents (if any)
  - `src/main/ssh-remote.ts` (token transport via SSH — read-only context)
  - `src/main/remote-sessions.ts`, `remote-models.ts`, `remote-metadata.ts`
- [ ] **1.2** Agent returns structured report with:
  - File-by-file "what currently handles auth"
  - Exact insertion points for OAuth login + ticket-mint + reconnect logic
  - IPC channel naming convention (so we register ours consistently)
  - i18n key naming convention
  - Existing test coverage map (`tests/` directory)
- [ ] **1.3** Parent reviews audit, asks user any open questions, writes Phase 2 kickoff

## Phase 2: Apply (port + extend)

- [ ] **2.1** Create `feat/oauth-ticket-flow` branch off `dev`
- [ ] **2.2** Apply agent ports Nous's `electron/main.cjs:3940–4220` into:
  - `src/main/oauth.ts` (new) — `oauthLoginConnectionConfig`, `freshGatewayWsUrl`, `mintGatewayWsTicket`
  - `src/main/connection-config.ts` — extend `ConnectionConfig` with `authMode: "token" | "oauth"` and `oauth: { lastLoginAt, cookiesReady }`
  - `src/main/dashboard.ts` — switch `getRemoteDashboardStatusForConfig` + `requestDashboardConnection` to OAuth path when `authMode === "oauth"`
  - `src/main/ipc/register.ts` — register new channels: `oauth:login`, `oauth:status`, `oauth:logout`, `ws-ticket:mint`
  - `src/preload/index.ts` — expose new IPC to renderer
  - `src/renderer/src/screens/Settings/Settings.tsx` — "Connect to Remote Hermes" dialog gets `Auth: Token / OAuth` radio
  - `src/shared/i18n/locales/en/{welcome,settings}.ts` — new strings: `authModeOAuth`, `oauthLoginButton`, etc.
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
