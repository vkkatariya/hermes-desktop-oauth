# Dev Log

> Append-only. Hermes + sub-agents write one entry per session. Newest at top.
> Format: date, agent, Did, State, Decided, Next/Blocked, Modified.

---

## 2026-11-02 · Claude Code (local) · chore(ci): add DEVLOG check job

**Mode:** Builder

**Did:** added the `devlog` job to `.github/workflows/ci.yml`, pasted from `workflow/agents_workflow/enforcement/ci-devlog-job.yml`. It fails a pull request that does not change `tasks/DEVLOG.md`. It is the backstop for `--no-verify` and cloud sessions.

**Config change:** file `.github/workflows/ci.yml`; old: no `devlog` job; new: `devlog` job, runs on `pull_request` only; rollback: `git revert e5ec620`.

**State:** branch `agent/claude-code-config-ci-devlog`, PR open against `main`, not merged.

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
