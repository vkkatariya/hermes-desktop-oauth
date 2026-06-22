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

## Phase 2: Apply (port + extend) ✅ (with gaps)

> **Channel naming constraint (discovered in audit):** `tests/preload-api-surface.test.ts:233,243` enforces `/^[a-z][a-z0-9-]*$/`. **NO COLONS allowed.** Use kebab-case: `oauth-dashboard-login`, `oauth-dashboard-status`, `oauth-dashboard-logout`. Also: `oauth-login*` namespace is already taken by provider sign-in (`src/main/ipc/register.ts:283-312`), so dashboard OAuth must use `oauth-dashboard-*` prefix.

> **Branch name divergence:** todo.md originally specified `feat/oauth-ticket-flow` (lines 39, 58, 59, 74). The branch actually shipped is `feat/dashboard-oauth`. Either rename the branch, or update this todo (default: keep `feat/dashboard-oauth` — better matches the actual scope of "dashboard OAuth" not just "ticket flow").

> **Audit trail:**
> - [`tasks/audits/phase-2-audit.md`](audits/phase-2-audit.md) — post-Claude completion audit
> - [`tasks/audits/phase-2-test-rerun.md`](audits/phase-2-test-rerun.md) — Electron install repair + test re-run
> - PR #1 merged to `dev`: https://github.com/vkkatariya/hermes-desktop-oauth/pull/1 (merge commit `76e605b`)

- [x] **2.1** Create branch off `dev` ✅ as `feat/dashboard-oauth` (name diverges from `feat/oauth-ticket-flow` — see note above)
- [x] **2.2** Apply agent ported Nous's `electron/main.cjs:3940–4220` into:
  - [x] `src/main/oauth.ts` (new, 300 lines) — `oauthDashboardLogin`, `mintGatewayWsTicket`, `freshGatewayWsUrl`, `clearOAuthSession`, `getOAuthPartition`, `hasOAuthSessionCookies`
  - [x] `src/main/config.ts` — `ConnectionConfig` gains `authMode: "token" | "oauth"` + `oauth: { partitionName, lastLoginAt, lastLoginEmail, cookiesReady }`; `PublicConnectionConfig` strips `partitionName`; backward-compatible defaults
  - [x] `src/main/dashboard.ts` — replaced hard-coded "OAuth not wired" error (lines 379–391) with `freshGatewayWsUrl` + WebSocket probe branch for both `remote` and `ssh` modes
  - [ ] **`src/main/remote-sessions.ts`** — **GAP: deferred** per Phase 1 audit's "may defer to follow-up". `RemoteSessionConfig` still token-only. Renderer-side dashboard session flows work via `dashboard.ts`, but direct `remote-sessions.ts`/`remote-models.ts`/`remote-metadata.ts` callers don't yet support OAuth. Tracked as follow-up below.
  - [x] `src/main/ipc/register.ts` — 3 new channels: `oauth-dashboard-login`, `oauth-dashboard-status`, `oauth-dashboard-logout`. `set-connection-config` takes optional 4th `authMode` arg.
  - [x] `src/preload/index.ts` + `index.d.ts` — 3 new hermesAPI methods (`oauthDashboardLogin`, `oauthDashboardStatus`, `oauthDashboardLogout`), updated `getConnectionConfig` / `setConnectionConfig` / `onConnectionConfigChanged` types
  - [x] `src/renderer/src/screens/Settings/Settings.tsx` — auth-mode radio (Token / OAuth), conditional credential field, OAuth status panel, sign-in / sign-out buttons
  - [x] `src/shared/i18n/locales/en/settings.ts` — 12 new keys (`authModeLabel`, `authModeToken`, `authModeOAuth`, `authModeHint`, `oauthLoginButton`, `oauthLogoutButton`, `oauthLoggedInAs`, `oauthStatusReady`, `oauthStatusNeedsLogin`, `oauthStatusConnecting`, `oauthErrorBrowser`, `oauthErrorCallback`)
  - [x] `src/shared/i18n/locales/en/welcome.ts` — 4 new keys (`authModeLabel`, `authModeToken`, `authModeOAuth`, `oauthLoginButton`)
  - [x] `src/shared/i18n/locales/{es,he,id,ja,pl,pt-BR,pt-PT,tr,zh-CN,zh-TW}/` — mirrored as TODO placeholders for translators
- [x] **2.3** Tests (vitest, in `tests/` per upstream convention):
  - [x] OAuth login window opens expected URL (`tests/oauth-dashboard.test.ts:oauthDashboardLogin`)
  - [x] `mintGatewayWsTicket` returns ticket string on 200 (`oauth-dashboard.test.ts`)
  - [x] `mintGatewayWsTicket` throws on 401 (`oauth-dashboard.test.ts`)
  - [x] `freshGatewayWsUrl` mints per call when in OAuth mode (no caching) (`oauth-dashboard.test.ts`)
  - [ ] **`getRemoteDashboardStatusForConfig` reports `needs_oauth_login` correctly when no cookies** — **GAP: not literal**. Claude chose return shape `{ supported, running, error }` instead of a `needs_oauth_login` boolean. The "no cookies" case is implicitly represented as `{ supported: true, running: false, error: "Dashboard requires OAuth sign-in…" }`. Functionally covered by tests, but doesn't match todo.md's literal wording. Either change return shape or update todo.
  - All 12 tests pass (`oauth-dashboard.test.ts`: 7, `connection-config-oauth.test.ts`: 5)
- [x] **2.4** lat.md knowledge graph:
  - 3 new files: `lat.md/oauth-login.md`, `lat.md/ws-ticket-minting.md`, `lat.md/gated-dashboard-auth.md` (all registered in `lat.md/lat.md` index)
  - Subsections added to `gated-dashboard-auth.md` to match test `@lat` refs (11/11 resolve, `npx lat check` passes)
  - Note: existing `lat.md/main-process.md` and `lat.md/window-chrome.md` were **not modified** per Phase 1 audit's "only ADD new files" rule.
- [x] **2.5** Verification on athena:
  - [x] `npx tsc --noEmit` → pass (typecheck:node + typecheck:web both clean)
  - [x] `npx vitest run tests/oauth-dashboard.test.ts tests/connection-config-oauth.test.ts` → 12/12 pass
  - [ ] **`npm run build` (full electron-vite build)** — **GAP: not run**. typecheck + tests pass but the full build (`npm run typecheck && electron-vite build`) was not exercised. Worth running before Phase 3 e2e on Mac.
  - Full pre-existing test suite (excluding Electron-dependent `src/main/**`): 1366 pass / 3 skip / 4 fail. **The 4 failures are pre-existing** (`src/renderer/src/screens/Agents/Agents.test.tsx` — `useProfileModal` Provider missing, unrelated to OAuth). Confirmed via stash-and-rerun.
- [x] **2.6** `npm run lint` → 0 new errors introduced (2 pre-existing errors in `src/main/ssh-remote.ts:1984`, untouched by this branch). 244 prettier warnings, auto-fixable, not blocking.
- [x] **2.7** Commit + push ✅ as `feat/dashboard-oauth` (not `feat/oauth-ticket-flow` — see branch name divergence note above)
  - 7 atomic commits: `890c304`, `c59236a`, `5149948`, `c446dda`, `78ca549`, `46624dc`, `3bc68bf`
- [x] **2.8** PR opened and merged to `dev` ✅
  - PR #1: https://github.com/vkkatariya/hermes-desktop-oauth/pull/1
  - Review comment posted
  - Merged commit: `76e605b Merge pull request #1 from vkkatariya/feat/dashboard-oauth`

### Phase 2 gaps → follow-up before Phase 4 (upstream PR)

1. ✅ **`src/main/remote-sessions.ts` OAuth support** — `RemoteSessionConfig` now has optional `authMode` and `oauthProfile`. When `authMode === "oauth"`, `remoteRequestJson` mints a single-use ticket per call (via `oauth.ts mintGatewayWsTicket`) and passes it as `?ticket=` query param. Token mode unchanged. `oauthProfile` falls back to `"default"`. Raw HTTP transport extracted into private `rawRemoteRequestJson` helper. Test: `tests/remote-sessions-oauth.test.ts` (3 tests, all pass). Committed `77ac0f9`.
2. ✅ **`needs_oauth_login` return shape** — `DashboardStatus` gained optional `needs_oauth_login: boolean`. Set in both OAuth return paths inside `getRemoteDashboardStatusForConfig`. Type mirrored in preload/index.{ts,d.ts}. Test: `tests/dashboard-needs-oauth-login.test.ts` (2 tests, all pass). Committed `77ac0f9`.
3. **`npm run build` (full)** — typecheck passes, tests pass, but `electron-vite build` was not exercised in this sandbox. Run on Mac during Phase 3 setup (3.2).
4. **Branch name** — todo.md still says `feat/oauth-ticket-flow` in 3 places. Decide: rename `feat/dashboard-oauth` → `feat/oauth-ticket-flow` (cosmetic, clean), or accept the divergence and update todo (default).

> **Gap closures verified:** 17/17 OAuth-related tests pass (`tests/oauth-dashboard.test.ts` × 7, `tests/connection-config-oauth.test.ts` × 5, `tests/dashboard-needs-oauth-login.test.ts` × 2, `tests/remote-sessions-oauth.test.ts` × 3). Existing `tests/remote-sessions.test.ts` (11 tests) and `tests/dashboard-remote.test.ts` pass with no regressions. Typecheck clean.

## Phase 3: End-to-end verify (Mac)

> **Pre-flight verification (athena, 2026-06-22 23:30):**
> - `npm ci` clean install: ✅ passes
> - `electron-builder install-app-deps`: ✅ rebuilt `better-sqlite3` for arm64
> - `npm run build` (typecheck + electron-vite build): ✅ passes
> - One pre-existing build blocker fixed in this session: duplicate `apiGenerated` keys in `he/` and `tr/` locales from Phase 2 i18n mirror (TS1117). Committed `019506c`.
> - Dashboard backend on athena is live and OAuth-gated: `/api/status` returns `auth_required: true`, `auth_providers: ["nous"]`. `POST /api/auth/ws-ticket` responds with proper `401 no_cookie` shape.
> - DNS for `auxois-wyrm.ts.net` only resolves from Tailscale clients (not from athena sandbox), so e2e must run from your Mac over Tailscale.

- [ ] **3.1** User (Vishal) clones fork on Mac — `git clone git@github.com:vkkatariya/hermes-desktop-oauth.git && cd hermes-desktop-oauth && git checkout dev`
- [ ] **3.2** `npm ci && npm run build:mac` → signed/notarized `.dmg` (or local-dev build if signing not set up)
  - **Tip:** the Mac build is `electron-builder --mac`. `publish:` in `electron-builder.yml` is set to `fathah/` (upstream) — leave alone unless you want to change distribution target.
- [ ] **3.3** Install `.dmg`, launch Hermes.app
- [ ] **3.4** Settings → Connect to Remote Hermes → URL = `http://auxois-wyrm.ts.net:9119` → Auth = **OAuth**
  - The Settings UI now has the auth-mode radio. The credential field should hide when OAuth is selected.
- [ ] **3.5** Click "Sign in with browser" → BrowserWindow opens → Portal OAuth round-trip → cookies set → return to Settings → "Connected"
- [ ] **3.6** Open chat tab → WebSocket connects with fresh `?ticket=` → full dashboard features (model picker, slash commands, session sync) work
- [ ] **3.7** Quit + relaunch Hermes.app → cookies persist (persistent partition) → auto-reconnect, no re-login needed
- [ ] **3.8** Verify 24h refresh-token rotation by waiting >15min (manual) — gateway should rotate AT cookie transparently

### Quick triage if something fails

| Symptom | Likely cause |
|---|---|
| Build fails on Mac | Run `npm rebuild` or check `node_modules/electron/path.txt` exists (Electron postinstall footgun, see `tasks/audits/phase-2-test-rerun.md`) |
| "OAuth not wired" error still appears | Old `feat/dashboard-oauth` checkout — pull latest `dev` |
| BrowserWindow opens but cookies don't persist | Check Electron session partition name matches between login and status probe |
| WebSocket 401 immediately after login | `/api/auth/ws-ticket` returning ticket rejected — check dashboard logs for ticket mint failures |
| `needs_oauth_login` not showing in UI | Renderer not reading the field — check Settings.tsx consumes `DashboardStatus.needs_oauth_login` (we only added the type; UI consumption is follow-up if needed) |

## Phase 4: PR upstream

- [ ] **4.1** Open PR `vkkatariya/hermes-desktop-oauth:feat/dashboard-oauth` (or `feat/oauth-ticket-flow` if renamed — see Phase 2 gap #4) → `fathah/hermes-desktop:main`
- [ ] **4.2** PR body: problem statement, screenshots/recording of working flow, port mapping (which lines from `NousResearch/hermes-agent/apps/desktop/electron/main.cjs:3940–4220` go where), test results, `lat.md` updates
- [ ] **4.3** Address reviewer feedback, re-verify
- [ ] **4.4** Merge → upstream `fathah/hermes-desktop@main`
- [ ] **4.5** DEVLOG final entry: shipped upstream, link to PR

## Stretch (out of scope, parked)

- SSH-tunnel support for OAuth (currently community app has token+SSH; OAuth+SSH is more complex)
- Multi-profile OAuth (cookie jar per profile)
- Auto-detect gated vs non-gated mode without user toggle (infer from `/api/status` response shape)
