# Phase 1 Audit Report
> Audit-only research, no code changes. Branch: dev. Date: 2026-06-22.
> See tasks/audits/phase-1-audit.md for the full report (saved on disk).

**Summary for the apply agent:**

## Key findings to act on

1. **Channel naming MUST be kebab-case** — `tests/preload-api-surface.test.ts:233,243` enforces `/^[a-z][a-z0-9-]*$/`. Colons are illegal. Update todo.md suggestion: use `oauth-dashboard-login`, `oauth-dashboard-status`, `oauth-dashboard-logout` (NOT `oauth:login` etc).

2. **`oauth-login*` namespace is TAKEN** by provider sign-in (`src/main/ipc/register.ts:283-312`, `src/main/hermes-auth.ts`). The dashboard OAuth flow must use `oauth-dashboard-*` to avoid breaking provider sign-in.

3. **Primary integration point: `src/main/dashboard.ts`** — the OAuth-gated error path at lines 379-391 is where we need to branch into the OAuth flow instead of erroring out.

4. **`ConnectionConfig` ripples through 7+ files** — every public/serialized form must be updated: `config.ts`, `dashboard.ts`, `remote-sessions.ts`, `remote-models.ts`, `remote-metadata.ts`, `ipc/register.ts`, `preload/index.ts` + `index.d.ts`, `Settings.tsx`, plus tests.

5. **Settings UI is tightly coupled to token path** — adding auth-mode radio needs careful `getConnectionApiKeyForSave()` handling so switching modes doesn't wipe saved token.

6. **Cookie partition management doesn't exist yet** — Nous's `persist:oauth` pattern is new territory for this codebase.

7. **`tests/ipc-handlers.test.ts` and `tests/preload-api-surface.test.ts` auto-enforce** new IPC + preload additions — if we add channels/methods correctly, tests pass; if we miss one, tests fail with clear errors.

8. **lat.md integration is wide open** — no existing dashboard-auth entry. Our patch will be the first.

## Files we'll touch (target list)

- `src/main/oauth.ts` — NEW — port of Nous's `oauthLoginConnectionConfig` + `freshGatewayWsUrl` + `mintGatewayWsTicket`
- `src/main/dashboard.ts` — extend `getRemoteDashboardStatusForConfig` to handle OAuth branch
- `src/main/config.ts` — add `authMode` + `oauth` sub-object to `ConnectionConfig` + `PublicConnectionConfig`
- `src/main/remote-sessions.ts` — update `RemoteSessionConfig` to accept OAuth partition
- `src/main/ipc/register.ts` — register `oauth-dashboard-*` channels
- `src/preload/index.ts` + `index.d.ts` — expose new methods
- `src/renderer/src/screens/Settings/Settings.tsx` — auth-mode radio + OAuth button + status display
- `src/shared/i18n/locales/en/settings.ts` + `welcome.ts` — new keys (8+ per audit Section C)
- `tests/oauth-dashboard.test.ts` — NEW
- `tests/connection-config-oauth.test.ts` — NEW
- `lat.md/oauth-login.md` — NEW
- `lat.md/ws-ticket-minting.md` — NEW
- `lat.md/gated-dashboard-auth.md` — NEW
