# Phase 3 e2e — Mac verification

**Goal:** Verify the OAuth dashboard auth flow works end-to-end against the live gated dashboard on athena.

**Test target:** `http://auxois-wyrm.ts.net:9119` (Tailscale-only — must be on your VPN)

**Branch to test:** `dev` (latest, after PR #4 merge)
- `origin/dev` tip: `48f0383`
- `vkkatariya/hermes-desktop-oauth:dev` is the source of truth

---

## Step 1 — Get the code

```bash
# If you don't already have the repo on your Mac
git clone git@github.com:vkkatariya/hermes-desktop-oauth.git
cd hermes-desktop-oauth
git checkout dev

# If you already have it
cd hermes-desktop-oauth
git fetch origin
git checkout dev
git pull --ff-only
```

Verify:
```bash
git log --oneline -5
# Should show:
# 48f0383 Merge pull request #4 from vkkatariya/feat/dashboard-oauth
# 86eb0fd docs(todo): update Phase 3 with pre-flight verification + triage guide
# 019506c fix(i18n): remove duplicate apiGenerated keys in he and tr locales
# aa3a88f Merge pull request #3 from vkkatariya/hermes-desktop-oauth
# e328f26 docs(todo): mark Phase 2 gaps 1 and 2 as closed
```

## Step 2 — Install + build

```bash
npm ci
# If you hit "Electron failed to install correctly":
#   rm -rf node_modules/electron/dist node_modules/electron/path.txt
#   node node_modules/electron/install.js
#   # Or check tasks/audits/phase-2-test-rerun.md for the full Electron install dance.

npm run build:mac
# Output: dist/mac/Hermes.app and dist/Hermes-0.6.34.dmg (or similar)
```

## Step 3 — Install the .dmg

```bash
open dist/Hermes-0.6.34.dmg
# Drag Hermes.app to /Applications
# (or run from dist/mac/ directly if you don't want to install)
```

Launch Hermes.app.

## Step 4 — Connect to the gated dashboard

In Hermes.app:
1. **Settings** → tab **Remote**
2. URL: `http://auxois-wyrm.ts.net:9119`
3. **Auth mode radio** (new!) → select **OAuth (browser)**
4. The credential/API-key field should **disappear** (it's token-only)
5. Click **Sign in with browser**

Expected: a BrowserWindow opens, navigates to `https://portal.nous.research/...` (or similar), you complete the OAuth round-trip, the window closes, and the Settings panel shows **"OAuth session active"** with your email.

## Step 5 — Verify the chat tab works

Open a chat tab. The WebSocket should connect using `?ticket=<fresh>` (not `?token=`). You should see:
- Model picker populated
- Slash commands working
- Session sync from the dashboard

To verify the ticket is fresh per-call (not cached):
- Open Hermes developer tools (View → Toggle Developer Tools, or Cmd+Opt+I)
- Network tab → filter `ws` → look at the WebSocket URL — should show `?ticket=...`
- Send a few messages, reconnect, check each WS upgrade uses a different ticket

## Step 6 — Verify cookie persistence

1. Quit Hermes.app (Cmd+Q)
2. Relaunch
3. Open Settings → Remote → should still show **"OAuth session active"** — no re-login required

The cookie jar lives in `persist:hermes-oauth-default` Electron partition. Should persist across app restarts.

## Step 7 — Long-running cookie rotation (optional, time-permitting)

Wait >15 minutes between actions. The gateway should rotate the AT (access token) cookie transparently — your session stays logged in. To verify:
- Settings → Remote → still shows "OAuth session active"
- Or check the dashboard backend logs for AT rotation events

---

## Triage

If something doesn't work:

| Symptom | Check |
|---|---|
| Build fails on Mac | `rm -rf node_modules && npm ci`; if Electron issue, see `tasks/audits/phase-2-test-rerun.md` |
| "OAuth not wired" error | You may be on an older commit. `git checkout dev && git pull --ff-only` |
| BrowserWindow opens but no cookies | Check `src/main/oauth.ts` `oauthDashboardLogin` — partition name should be `persist:hermes-oauth-default` |
| WebSocket 401 immediately | Dashboard may have rejected the ticket. Check `100.94.155.120:9119` logs (or your Mac equivalent) |
| Settings UI doesn't show auth-mode radio | Older Settings.tsx — pull latest `dev` |
| `needs_oauth_login` not surfaced in UI | Renderer may not consume the field. Check Settings.tsx reads `DashboardStatus.needs_oauth_login` |

## Reporting back

After the e2e, please report:
1. Which steps passed (3.4, 3.5, 3.6, 3.7, 3.8)
2. Any console errors from Hermes.app (Cmd+Opt+I → Console tab)
3. Network tab screenshots of the WebSocket upgrade (showing `?ticket=` not `?token=`)
4. Any cookie persistence quirks

If everything passes, we move to Phase 4 (upstream PR).