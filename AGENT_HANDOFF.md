# Agent Handoff — Steadfast TV Dashboard Operations

You are taking over operational support for the Steadfast Homebuyers fix-and-flip TV dashboard. This document is everything you need. Read it end to end before answering questions about the system.

Owner / point of contact: Matt at Steadfast Homebuyers (matt@steadfasthb.com).

---

## 0. Current Status (as of 2026-04-29 evening)

- **Service:** Live and healthy. `mode: "live"`, last sync successful, no errors.
- **JobTread:** Live. Pulling 18 open jobs, 6 marked Active, every 15 minutes.
- **QuickBooks:** Not connected yet. Finance panel currently shows seed data (Net income –$49K placeholder). Setup is paused — Intuit's developer portal was returning `/app/developer/error` after Terms acceptance and would not recover. Resume when their portal is healthy.
- **Repo:** `main` branch, 4 commits.
- **Office TV:** Not yet pointed at the URL — the URL works in any browser, kiosk setup is the next physical step.

If everything still looks like that when you read this, no action needed. If anything has drifted, see §5.1 for how to verify and §6/§7 for fixes.

---

## 1. Quick Reference

| Resource | Where |
|---|---|
| Live dashboard URL | https://steadfast-tv-dashboard.onrender.com |
| Health endpoint | https://steadfast-tv-dashboard.onrender.com/api/health |
| Force-sync endpoint | `POST` https://steadfast-tv-dashboard.onrender.com/api/sync (Bearer auth) |
| QuickBooks status | https://steadfast-tv-dashboard.onrender.com/api/qbo/status |
| QuickBooks connect | https://steadfast-tv-dashboard.onrender.com/api/qbo/connect |
| GitHub repo | https://github.com/SHB2020/steadfast-tv-dashboard |
| Render service | https://dashboard.render.com/web/srv-d7p6cfk48j3c73acoqog |
| Render Blueprint | https://dashboard.render.com/blueprint/exs-d7p4fjt7vvec73b24r4g |
| Render env vars page | https://dashboard.render.com/web/srv-d7p6cfk48j3c73acoqog/env |
| Render logs page | https://dashboard.render.com/web/srv-d7p6cfk48j3c73acoqog/logs |
| Render service ID | `srv-d7p6cfk48j3c73acoqog` |
| Default branch | `main` |
| Persistent disk mount | `/var/data` (1 GB) |
| Plan | Starter ($7/mo) + 1 GB disk ($0.25/mo) = $7.25/mo |
| Auto-deploy on push to main | Yes |
| Server-side sync interval | 15 minutes |
| Browser-side refresh | 5 minutes |
| Daily hard reload | 24 hours |

Local working folder on Matt's machine: `C:\Users\stead\Downloads\tv-dashboard\`

---

## 2. What This System Does

A Node.js web service that:

1. Pulls open jobs and field data from JobTread every 15 minutes (when `JOBTREAD_GRANT_KEY` is set).
2. Pulls finance reports from QuickBooks every 15 minutes (when QuickBooks OAuth is connected).
3. Normalizes both into a single JSON snapshot at `/var/data/dashboard-snapshot.json`.
4. Serves a full-screen HTML/CSS/JS dashboard at `/` for an office TV.
5. Auto-refreshes that page every 5 minutes; hard-reloads it once a day.

If JobTread or QuickBooks isn't reachable, the page falls back to the last-good snapshot. Worst case it falls back to the bundled `data/seed-snapshot.json`. The dashboard never goes blank.

---

## 3. Environment Variables on Render

Variables set in the Render service:

| Key | Value (today) | Purpose |
|---|---|---|
| `NODE_VERSION` | 20.18.0 | Node runtime version |
| `DATA_DIR` | `/var/data` | Mount path for snapshot + tokens |
| `COMPANY_NAME` | Steadfast Homebuyers | Display only |
| `SYNC_INTERVAL_MINUTES` | 15 | Background sync cadence |
| `SYNC_TOKEN` | (auto-generated; reveal in Render UI) | Bearer token for `POST /api/sync` |
| `BASE_URL` | https://steadfast-tv-dashboard.onrender.com | Used by OAuth cookies |
| `JOBTREAD_GRANT_KEY` | (set; org-scoped Pave grant working as of 2026-04-29) | JobTread Pave API auth |
| `QUICKBOOKS_CLIENT_ID` | empty | Set during QuickBooks setup |
| `QUICKBOOKS_CLIENT_SECRET` | empty | Set during QuickBooks setup |
| `QUICKBOOKS_REDIRECT_URI` | empty | Set to `${BASE_URL}/api/qbo/callback` |
| `QUICKBOOKS_REALM_ID` | empty | Auto-populated after first OAuth |
| `QUICKBOOKS_SOURCE_URL` | empty | Optional alt path for finance JSON feed |

Anything not set defaults to empty string in `lib/config.mjs`.

---

## 4. Architecture (1-minute version)

```
Office TV browser ──GET /──▶ Render service (Node 20)
                                  │
                                  ├── reads /var/data/dashboard-snapshot.json
                                  └── every 15 min:
                                        ├── pulls JobTread (Pave GraphQL)
                                        ├── pulls QuickBooks reports (OAuth)
                                        └── writes new snapshot.json
```

Code structure (in repo):
- `server.mjs` — HTTP server, routes
- `lib/config.mjs` — reads all env vars
- `lib/sync-service.mjs` — orchestrates JT + QB pulls, builds snapshot
- `lib/snapshot-store.mjs` — read/write snapshot, auto-seed on first boot
- `lib/token-store.mjs` — persists QuickBooks OAuth tokens to `/var/data/quickbooks-tokens.json`
- `lib/providers/jobtread-provider.mjs` — Pave GraphQL query and normalization
- `lib/providers/quickbooks-oauth-provider.mjs` — OAuth dance + report fetch
- `lib/providers/quickbooks-provider.mjs` — picks between OAuth, JSON URL, local file
- `public/index.html` `app.js` `styles.css` — the TV view
- `data/seed-snapshot.json` — bundled seed; auto-copied to `/var/data` on first boot
- `scripts/run-sync.mjs` — CLI: trigger one sync cycle and exit
- `render.yaml` — Render Blueprint (do not edit lightly)
- `DEPLOY_NOW.md` — original deployment walkthrough
- `README.md` — short overview

---

## 5. Common Operational Tasks

### 5.1 Check that the dashboard is healthy

Hit `GET https://steadfast-tv-dashboard.onrender.com/api/health`.

A healthy response looks like:

```json
{
  "ok": true,
  "snapshotPath": "/var/data/dashboard-snapshot.json",
  "snapshotExists": true,
  "snapshotUpdatedAt": "2026-04-29T20:13:45.491Z",
  "snapshotSize": 7383,
  "mode": "live",
  "sync": {
    "running": false,
    "lastAttemptAt": "2026-04-29T20:30:00.000Z",
    "lastSuccessAt": "2026-04-29T20:30:00.000Z",
    "lastError": null,
    "mode": "live"
  },
  "company": "Steadfast Homebuyers",
  "syncIntervalMinutes": 15
}
```

Red flags:
- `mode: "snapshot"` after JobTread is supposed to be working — investigate `sync.lastError`.
- `sync.lastError` not null — read the message; that's the actual failure.
- `snapshotExists: false` — disk wasn't mounted; very unusual; check Render disk status.
- `ok: false` — server crashed; check Render logs.

### 5.2 Force a sync right now

Get the `SYNC_TOKEN`:

1. Go to Render → service → Environment tab.
2. Click the eye icon next to `SYNC_TOKEN` to reveal the value.
3. Copy it.

Then run:

```bash
curl -X POST -H "Authorization: Bearer <SYNC_TOKEN>" https://steadfast-tv-dashboard.onrender.com/api/sync
```

You should see `{"ok": true, "sync": {...}}`. If `sync.lastError` is non-null, the sync ran but the JobTread or QuickBooks call failed — read the message.

If you don't have a terminal handy, you can also trigger a sync indirectly by clicking **Manual Deploy → Clear build cache & deploy** in the Render service page; the app runs a sync on every boot.

### 5.3 Update an environment variable

1. Go to Render → service → **Environment** tab.
2. Click **Edit**.
3. Change the value (or click the trash icon to remove a row, or click **+ Add variable** to add one).
4. Click **Save, rebuild, and deploy**. Render will redeploy automatically; takes 1–3 minutes.

### 5.4 Push a code change

The user is non-technical and uses no command line. To get a code change deployed:

1. Edit the file in the GitHub web UI: navigate to the file at https://github.com/SHB2020/steadfast-tv-dashboard, click the pencil icon, edit, commit directly to `main`.
2. Render will auto-deploy. Check the **Events** tab on Render for progress.
3. Verify with `GET /api/health` after deploy completes.

For larger changes, ask the user to do the GitHub edit themselves screen by screen, or have them re-upload via the same drag-and-drop flow used originally.

### 5.5 Read Render logs

https://dashboard.render.com/web/srv-d7p6cfk48j3c73acoqog/logs

Useful log strings:
- `Steadfast TV dashboard listening on port 10000` — service booted cleanly.
- `Background sync failed:` — the in-process sync error (if it printed).
- `Initial sync failed:` — the boot-time sync error.

Note: many sync errors are caught in `runSync` and stored in `syncState.lastError` rather than logged. The most reliable way to see the current failure mode is `GET /api/health`, not the logs.

### 5.6 Reset the disk (rarely needed)

If the snapshot or token file gets corrupted:

1. Render → service → **Shell** tab → `rm /var/data/dashboard-snapshot.json` or `rm /var/data/quickbooks-tokens.json`.
2. The seed snapshot will auto-copy back on next boot. QuickBooks will need to be reconnected.

---

## 6. Outstanding Issues (as of handoff)

### 6.1 JobTread sync — RESOLVED

**Status as of 2026-04-29 4:40 PM CT:** Live. `mode: "live"`, `lastError: null`. The dashboard is showing real JobTread data.

**Historical record (kept here for future debugging):** The original failure was `Cannot read properties of null (reading 'id')`. Root cause: the original `JOBTREAD_GRANT_KEY` was an **All Organizations** grant, which JobTread returns with `currentGrant.organization: null`. Fix: Profile → bottom of page → Grants section → click "+ Grant" inside the **Steadfast Home buyers** sub-section (NOT "All Organizations") and use the resulting key.

**Second issue we hit:** After fixing the org scope, the active jobs query returned HTTP 413. Root cause: JobTread Pave rejects requests above a complexity threshold. Fix in `lib/providers/jobtread-provider.mjs`: keep `jobs.size: 25` and `customFieldValues.size: 20` (not the original 100 and 30). If the company ever has more than 25 open jobs at once, watch for jobs getting truncated and either bump these slightly or paginate the query.

**Helpful past tense:** if you re-encounter `Cannot read properties of null (reading 'id')`, see the historical record above. If you re-encounter `413`, inspect the error message — the code now appends JobTread's response body to make the cause obvious. If active job count grows beyond 25, bump `jobs.size` in `lib/providers/jobtread-provider.mjs` slightly (or paginate).

### 6.2 QuickBooks — connection paused

**Status:** Not connected. Finance panel on the TV dashboard is showing seed data (Net income –$49K placeholder, Jan-Apr monthly bars). These look real and aren't — flag this for Matt before the dashboard goes on the actual office TV.

**What was attempted on 2026-04-29:** Started the Intuit developer app creation flow. Matt signed into developer.intuit.com, clicked "I accept the Intuit Developer Terms of Service", and clicked Submit. Intuit redirected to `https://developer.intuit.com/app/developer/error` and stayed stuck there even after logout/login, hard refresh, and direct navigation to /myapps and /dashboard. This appears to be a known Intuit-side glitch where the portal needs time to register the Terms acceptance.

**To resume QuickBooks setup later:**

1. Have Matt try `https://developer.intuit.com/app/developer/myapps` again in his normal Chrome (not the Claude Workshop browser, which still has the broken session). A few hours of distance usually resolves it.
2. Once he's at the My Apps dashboard, create app → "QuickBooks Online and Payments".
3. Production Settings → Keys & credentials → add Redirect URI: `https://steadfast-tv-dashboard.onrender.com/api/qbo/callback`
4. Copy the Production **Client ID** and **Client Secret**.
5. Render Environment tab → set these values:
   - `QUICKBOOKS_CLIENT_ID` = the Client ID
   - `QUICKBOOKS_CLIENT_SECRET` = the Client Secret
   - `QUICKBOOKS_REDIRECT_URI` = `https://steadfast-tv-dashboard.onrender.com/api/qbo/callback`
   - Leave `QUICKBOOKS_REALM_ID` blank (auto-populates).
   - **Important:** Render's React form has a quirk where programmatic value-set ignores the new value. Use real keyboard events: triple-click to select all, then type. We hit this on JobTread too.
6. Save and redeploy.
7. Matt opens `https://steadfast-tv-dashboard.onrender.com/api/qbo/connect` in his browser, signs into QuickBooks Online, clicks **Authorize**.
8. Verify with `https://steadfast-tv-dashboard.onrender.com/api/qbo/status` → should show `connected: true`. The next sync cycle pulls real finance data into the panel.

OAuth tokens are stored on the persistent disk at `/var/data/quickbooks-tokens.json`, so the consent flow is one-time per environment.

**If Matt wants the QB panel hidden until OAuth is done** (so the TV doesn't show stale seed numbers in the meantime): edit `public/app.js`, find `function renderFinance(finance)`, and add `if (!finance || finance.periodLabel?.startsWith("Jan 1 to Apr 29, 2026")) { ... hide panel ... }`. Push via GitHub web editor, Render auto-deploys.

### 6.3 No custom domain yet

Current URL is `steadfast-tv-dashboard.onrender.com`. If the team wants `tv.steadfasthb.com`:

1. Render → service → **Settings → Custom Domains**.
2. Add the desired hostname.
3. Render shows the DNS records to add at the registrar.
4. After DNS propagates, update `BASE_URL` and `QUICKBOOKS_REDIRECT_URI` on Render. Add the new redirect URI in the Intuit app too.

### 6.4 Office TV not yet pointed at the URL

The whole purpose of this build is the office TV. As of handoff, the dashboard URL has only been verified in Matt's laptop browser. To finish:

1. Open the office TV's browser, navigate to `https://steadfast-tv-dashboard.onrender.com`.
2. Press F11 (Windows) or Chrome → View → Enter Full Screen (Mac) for kiosk mode.
3. Make sure the TV's display sleep is off / set to a long timeout.
4. Verify the page is still healthy the next morning — auto-refresh runs every 5 min, full reload every 24 h.

### 6.5 Cleanup loose ends in JobTread (cosmetic, optional)

Matt's JobTread Profile → Grants list contains two unused grants under the "All Organizations" section:

- "**New Grant JOBTREAD DASHBOARD**" — the original All-Orgs grant we replaced. Last used right before the fix.
- "**CHatGPT Key**" — created earlier, never used.

Both are harmless but clutter the audit list. Matt can delete them via the red trash icon next to each. Don't delete the grant labeled "**TV Dashboard (Render)**" under the **Steadfast Home buyers** sub-section — that's the one currently authorizing this app.

---

## 7. Recent Commit History (newest first, top of `main`)

| Message | What it did |
|---|---|
| Trim sizes and surface JobTread error body for diagnostics | The change that made sync go live. Reduced jobs.size 100→25, customFieldValues.size 30→20, added response body to error messages. |
| Reduce active jobs query size from 100 to 30 to fit JobTread limits | Earlier attempt to escape 413; superseded by the trim-sizes commit above. |
| Fetch JobTread job details one at a time to avoid 413 | Refactored detail query into a per-job loop (turned out the 413 was on a different call, but this is still a useful resilience improvement). |
| Surface JobTread response when no organization is returned | Diagnostic improvement that made the "All Organizations grant has null org" issue visible. Necessary to discover the real root cause. |
| Create .gitignore | Added after initial upload because GitHub's drag-and-drop skipped dotfiles the first time. |
| Initial production-ready upload of TV dashboard | First commit — 21 files at repo root. |

If you ever need to roll back, Render → service → Events → click **Rollback** next to a previous live deploy. Auto-deploy will be re-enabled on the next manual push.

---

---

## 8. Troubleshooting Playbook

| Symptom | First check | Most likely fix |
|---|---|---|
| Dashboard page blank or "Unable to load the dashboard right now" | `/api/health` | If 5xx: Render service crashed — check logs; redeploy. If 200: snapshot file may be missing — restart service. |
| Dashboard renders but the seed data never updates (timestamps stuck) | `sync.lastSuccessAt` and `sync.lastError` on `/api/health` | If `lastError` set: fix the upstream auth (JT or QB). If null but `lastSuccessAt` is old: trigger a manual sync. |
| `mode: "snapshot"` and you expected `"live"` | `sync.lastError` | Same as above. The app falls back to `snapshot` whenever the live pull fails. |
| QuickBooks panel says "not connected yet" | `/api/qbo/status` | If `configured: false`: env vars missing — see §6.2. If `configured: true` but `connected: false`: user needs to visit `/api/qbo/connect`. |
| QuickBooks reports start failing with 401 | Token expired | The app refreshes tokens automatically. If refresh itself fails, the user needs to redo the consent flow at `/api/qbo/connect`. |
| Render says "Build failed: Cannot find module" | `package.json` and import paths | Check the most recent commit — likely a typo in an import. Edit on GitHub web UI and commit. |
| `/api/sync` returns 401 Unauthorized | Bearer token | Reveal the current `SYNC_TOKEN` in Render Environment and use it. The token rotates only if someone clicks "Generate" in the UI. |
| Service stops at night | Render plan | The service is on Starter (always-on); should not sleep. If it does, confirm plan in Render Settings. |
| Costs unexpectedly higher than $7.25/mo | Render billing page | Check whether the disk grew or extra services were added. Disk is billed by GB allocated, not used. |

---

## 9. What Requires Human Action (no agent shortcuts)

You CANNOT do these things — always loop in Matt:

1. **Enter or modify payment information** on Render.
2. **Enter the user's Render or GitHub passwords** during sign-in.
3. **Click "Authorize" inside QuickBooks** during OAuth — only the QB account owner can.
4. **Generate or rotate API keys** in JobTread or QuickBooks — needs UI access in those products with their credentials.
5. **Approve a custom domain in DNS** — needs registrar access.
6. **Decide cost/plan changes** — anything above the current $7.25/mo budget.

When any of those come up, give the user a clear step-by-step in plain language and wait for them to confirm completion before continuing.

---

## 10. How Future Code Changes Should Be Made

The user is non-technical. Default to GitHub web editor, not git CLI. Steps:

1. Open the file on GitHub: e.g. https://github.com/SHB2020/steadfast-tv-dashboard/blob/main/lib/providers/jobtread-provider.mjs
2. Click the pencil ("Edit this file") icon in the top right of the file view.
3. Make the change in the in-browser editor.
4. Click **Commit changes...** at the top right.
5. Write a clear commit message and click **Commit changes** in the dialog. Default branch is `main`.
6. Render auto-deploys within ~30 seconds. Watch progress at https://dashboard.render.com/web/srv-d7p6cfk48j3c73acoqog/events.
7. Verify with `GET /api/health` after the green check.

For multi-file changes, use the same approach file by file. Avoid PRs; commit straight to `main`.

If a code change is risky, do a **manual deploy** instead of auto-deploy: click **Manual Deploy → Deploy latest commit** so you can roll back instantly via **Rollback** if it breaks.

---

## 11. Daily Health Routine (suggested)

Run this once a day or before any office leadership meeting:

1. `GET /api/health` — confirm `ok: true`, `mode: "live"`, `sync.lastError: null`.
2. Open https://steadfast-tv-dashboard.onrender.com — confirm the page renders, KPIs look reasonable, "Last Sync" timestamp is recent.
3. If anything looks stale or wrong, trigger a manual sync (§5.2).
4. If the sync still fails, escalate to Matt with the value of `sync.lastError`.

That's the whole job. Good luck.
