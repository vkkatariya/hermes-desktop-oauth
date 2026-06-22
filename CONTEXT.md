# hermes-desktop-oauth — Context

> Forked from [fathah/hermes-desktop](https://github.com/fathah/hermes-desktop) for the explicit purpose of adding the OAuth + single-use WS-ticket flow that the upstream Nous Hermes Agent gated dashboard requires. PRs target upstream; this fork exists to author and stage the change.

## What this is

A patch project on top of `fathah/hermes-desktop` (the community Electron desktop app for Hermes Agent) that adds the missing Nous Portal OAuth login + single-use WebSocket ticket-minting flow. Without this patch, the community app's "Dashboard" transport cannot connect to a Hermes dashboard bound to `0.0.0.0` in gated mode — the dashboard rejects `?token=` and the app has no OAuth code path.

## Stack

- **Language:** TypeScript (strict mode, separate `tsconfig.node.json` + `tsconfig.web.json`)
- **Runtime:** Electron (cross-platform desktop)
- **Bundler:** Vite via `electron-vite`
- **UI:** React 18 + Tailwind CSS + Radix UI primitives
- **3D:** Three.js + @react-three/fiber + @react-three/drei (used by the office agent scene; not relevant to OAuth)
- **IPC:** `@electron-toolkit/preload` + `@electron-toolkit/utils` (contextBridge with type-safe channels)
- **DB:** `better-sqlite3` (preload-bundled, native module, rebuilt via `electron-builder install-app-deps`)
- **Tests:** Vitest (`vitest run`)
- **Lint:** ESLint (prettier, line-ending — informational only upstream)
- **Build:** `electron-builder` → `.dmg` (mac), NSIS (win), AppImage/snap/deb/rpm (linux)
- **Hooks:** husky (pre-commit)
- **Knowledge graph:** custom `lat.md/` system (`lat search`, `lat check`, `lat expand`)

## Where it runs

- **Source of truth:** GitHub repo `vkkatariya/hermes-desktop-oauth` (fork of `fathah/hermes-desktop`)
- **Upstream PR target:** `fathah/hermes-desktop@main` (patch is intended to merge upstream)
- **Dev build:** athena (Linux ARM, headless) — `npm run dev` for live-reload with Electron; cross-platform build via `npm run build:linux`
- **Production build:** macOS host (for signed/notarized `.dmg`); Linux/Windows builds work but macOS is canonical
- **End-to-end test target:** the live gated dashboard on `auxois-wyrm.ts.net` (athena-hosted, `0.0.0.0:9119`, OAuth via Nous Portal)

## Directory structure (key paths)

```
hermes-desktop-oauth/
├── AGENTS.md              # UPSTREAM — lat.md knowledge-graph workflow
├── CLAUDE.md              # UPSTREAM — symlink to AGENTS.md
├── CONTRIBUTING.md        # UPSTREAM
├── electron.vite.config.ts
├── electron-builder.yml   # UPSTREAM — keep publish: fathah/
├── package.json
├── tsconfig.node.json     # main + preload
├── tsconfig.web.json      # renderer
├── lat.md/                # UPSTREAM — knowledge graph
├── src/
│   ├── main/              # Electron main process
│   │   ├── hermes-auth.ts       # ★ auth (token-based currently)
│   │   ├── dashboard.ts         # ★ dashboard connection (token-only)
│   │   ├── ipc/register.ts      # ★ IPC channel registration
│   │   └── …
│   ├── preload/
│   │   ├── index.ts            # ★ exposes IPC bridge to renderer
│   │   └── askpass.ts
│   ├── renderer/src/
│   │   ├── screens/Settings/    # ★ Settings UI (Connect to Remote Hermes)
│   │   └── …
│   └── shared/i18n/locales/en/  # ★ dialog strings live here
├── tasks/
│   ├── DEVLOG.md          # OUR — append-only session log
│   ├── todo.md            # OUR — phased plan
│   └── lessons.md         # OUR — corrections
├── CONTEXT.md             # OUR — this file
└── .github/workflows/
    ├── ci.yml             # UPSTREAM — typecheck + test + lint
    └── release.yml        # UPSTREAM — electron-builder per platform
```

★ = files we'll touch for the OAuth patch.

## Conventions

- **Code style:** ESLint (configured for `@electron-toolkit` patterns); prettier auto-formats on commit via husky
- **Type safety:** strict TS, no `any`; contextBridge types live in `src/preload/index.ts` and are re-imported by main
- **IPC channels:** registered in `src/main/ipc/register.ts`; renderer accesses via `window.api.*` (typed)
- **i18n:** ALL user-facing strings go through `src/shared/i18n/locales/<lang>/<namespace>.ts` — never hardcode English in components
- **lat.md:** every new feature documents itself in `lat.md/` with `// @lat:` code refs in tests; `lat check` runs in CI (we'll keep this contract)
- **Atomic commits:** one concern per commit; DEVLOG entry per session
- **Branch model:** `main` is stable, `dev` is integration, `feat/<slug>` per session (matches Hermes-wide convention)

## Current focus

**Phase 1 — Audit** (in progress): dispatch research agent to map every auth-related file in the upstream repo and produce a structured report on what the OAuth + ticket-mint flow needs to touch.

**Phase 2 — Port**: write a kickoff for the apply agent with the official Nous agent's OAuth implementation (`NousResearch/hermes-agent/apps/desktop/electron/main.cjs` lines 3940–4220) as the port spec.

**Phase 3 — Verify end-to-end** on macOS: build `.dmg` from this fork, install on Mac, point at `https://<athena-tailnet>/dashboard`, confirm OAuth login → ticket mint → WS connect → full dashboard features.

## Why a fork, not a branch on fathah/

- Maintainers don't accept unsolicited OAuth additions without extensive review (upstream issue tracker confirms — see `src/main/dashboard.ts:389` self-note)
- A fork lets us iterate fast without forking the project conversation
- PR-ready from day one — when ready, we open the PR against `fathah/hermes-desktop@main` and they can review the diff against the well-known upstream tip

## Agents

| Agent | Role | Reads |
|---|---|---|
| Hermes | Orchestrator on athena | AGENTS.md + this CONTEXT.md + tasks/todo.md + tasks/DEVLOG.md |
| Claude Code (claude) | Primary coding agent for this project | AGENTS.md (upstream's lat.md instructions) + this CONTEXT.md |
| OpenCode | Narrow fixes, lint cleanup | CONTEXT.md |
| Lat.md semantic search | When reasoning about existing patterns | requires `LAT_LLM_KEY` env var |

## Reference: OAuth flow to port

From `NousResearch/hermes-agent/apps/desktop/electron/main.cjs` (lines ~3940–4220):

1. `oauthLoginConnectionConfig(url)` — opens Electron BrowserWindow with `partition: 'persist:oauth'`
2. Navigates to `<url>/auth/login` → Nous Portal OAuth round-trip
3. Browser redirects to `/auth/callback` → server sets HttpOnly cookies:
   - `hermes_session_at` (15min access token)
   - `hermes_session_rt` (24h rotating refresh token)
4. For every `gateway.connect()`: `freshGatewayWsUrl()` calls `POST /api/auth/ws-ticket` (cookies attached via Electron's `net` bound to the persistent partition), server validates session + mints 30s single-use ticket
5. WebSocket upgrade URL: `ws://…/api/ws?ticket=<fresh>`

Community app today: only knows `?token=<apiKey>`. Source `src/main/dashboard.ts:389` literally says: *"OAuth ticket flow is not wired in Hermes One yet."*
