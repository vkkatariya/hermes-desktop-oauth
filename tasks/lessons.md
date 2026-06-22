# Lessons

> Every mistake or correction gets an entry here.
> Format: **Symptom** → **Root cause** → **Fix** → **Prevention rule**.

<!-- Example format:
## 2026-06-22 — Agent dispatched without verifying auth

**Symptom:** `claude -p ...` returned degraded output quality; some files silently not modified.

**Root cause:** `claude` was on PATH but not authenticated against the user's Pro subscription. No `claude doctor` preflight.

**Fix:** Verified via `claude doctor` → user re-authed → re-dispatched cleanly.

**Prevention rule:** Always run `claude doctor` / `codex login status` / `agy --auth-status` before dispatching any subscription-required agent. If unauthenticated, surface to user immediately and pick an authenticated alternative from the rotation table.
-->
