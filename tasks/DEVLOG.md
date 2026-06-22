# Dev Log

> Append-only. Hermes + sub-agents write one entry per session. Newest at top.
> Format: date, agent, Did, State, Decided, Next/Blocked, Modified.

---

## 2026-06-22 phase 1 audit — Hermes + opencode

**Did:** Dispatched `opencode` audit subagent to map every auth-related file in upstream `fathah/hermes-desktop`. Agent returned 7-section structured report (Section A: 17-file inventory, B: IPC conventions with regex enforcement detail, C: i18n key conventions with 8+ concrete keys, D: dashboard connect flow gap with verbatim code quotes and line numbers, E: vitest test patterns, F: lat.md integration, G: 7 risks/gotchas). Parent verified 4 critical claims: (1) channel regex `/^[a-z][a-z0-9-]*$/` enforced at `tests/preload-api-surface.test.ts:233,243` — **NO COLONS allowed**, (2) `oauth-login*` namespace collision with provider sign-in, (3) `dashboard.ts:349-395` matches the OAuth-gated error path verbatim, (4) `git status` clean (audit modified nothing). Saved full report to `tasks/audits/phase-1-audit.md` (345 lines) and condensed summary to `phase-1-audit-summary.md`. Patched `tasks/todo.md` to fix the colon → kebab-case issue and reflect audit's expanded file list (added `config.ts`, `remote-sessions.ts`, `remote-models.ts`, `remote-metadata.ts`; corrected file path from `connection-config.ts` to `config.ts`).

**State:** Phase 1 complete. All 5 audit tasks checked. Branch still on `dev`. Audit found no half-implemented OAuth work — clean slate, no scaffolding to extend. Two findings materially shape Phase 2: (a) channel namespace must be `oauth-dashboard-*` (kebab-case), (b) `ConnectionConfig` ripples through 7+ files and must be updated in lockstep.

**Decided:**
- `claude` is the right CLI for Phase 2 (multi-file TS refactor with subtle OAuth mechanics, not narrow enough for `opencode`)
- Phase 2 is one branch, one commit-set — the work is tightly coupled and the audit enumerated everything
- `remote-sessions.ts`/`remote-models.ts`/`remote-metadata.ts` updates are Phase 2 if scope allows, otherwise explicit follow-up
- lat.md entries (3 new files) are part of the patch, not a separate commit — the project's `AGENTS.md` requires `lat check` to pass

**Next:** Write Phase 2 kickoff referencing audit, then dispatch `claude -p --model sonnet --dangerously-skip-permissions` to port the OAuth flow. After dispatch, verify branch + diff per L-027/L-030; merge to `dev`; user runs e2e on Mac.

**Blocked:** None.

**Modified:** `tasks/audits/phase-1-audit.md` (new), `tasks/audits/phase-1-audit-summary.md` (new), `tasks/todo.md` (Phase 1 → ✅, channel naming fix, file list expansion)

---

## 2026-06-22 init — Hermes project-init skill

**Did:** Forked `fathah/hermes-desktop` → `vkkatariya/hermes-desktop-oauth`; cloned fork to athena at `/home/radxa/dev-shared/projects/hermes-desktop-oauth/`; surveyed upstream's existing project skeleton (AGENTS.md, CLAUDE.md, CONTRIBUTING.md, lat.md/, electron-builder.yml, .github/workflows/ci.yml, src/main/{hermes-auth,dashboard,ipc/register}.ts); detected non-vanilla setup — upstream uses `lat.md` knowledge graph + husky + eslint + vitest + electron-vite; chose "partial setup" variant of project-init per skill guidance.

**Stack:** TypeScript (strict) + Electron + React 18 + Vite (electron-vite) + Tailwind + Radix + Three.js + better-sqlite3 + electron-builder + Vitest + ESLint + husky + lat.md

**State:** Fork ready, partial project-init applied. Upstream files preserved. Missing pieces added: `CONTEXT.md`, `tasks/{DEVLOG,todo,lessons}.md`. No code changes yet — Phase 1 audit pending.

**Decided:**
- Don't overwrite upstream's `AGENTS.md`/`CLAUDE.md` — they encode the lat.md workflow contract
- Don't replace upstream's CI — it's already typecheck+test+lint-on-PR
- Keep `electron-builder.yml publish: fathah/` — PRs target upstream; this fork exists to author + stage
- Patch `README.md` URLs `fathah/` → `vkkatariya/hermes-desktop-oauth`
- Use audit + apply split (Phase 1 = research dispatch, Phase 2 = port kickoff with spec from official `main.cjs:3940-4220`)

**Next:** Phase 1 — dispatch research agent to map every auth-related file in upstream repo, document OAuth gaps, return structured audit report. After review, write Phase 2 kickoff that ports the official Nous flow.

**Blocked:** None.

**Modified:** `CONTEXT.md` (new), `tasks/DEVLOG.md` (this entry), `tasks/todo.md` (new), `tasks/lessons.md` (new)
