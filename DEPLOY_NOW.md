# Deploy the TV Dashboard — Step by Step

This guide is written for a non-technical user. It walks you through every screen.
Total time: about 25–35 minutes.

You only need three things:

1. A web browser
2. A GitHub account (free): https://github.com
3. A Render account (free signup): https://render.com

You do **not** need to install anything on your computer. Everything happens in the browser.

---

## Part 1 — Put the code on GitHub (5 minutes)

You already have an empty repo at:
**https://github.com/SHB2020/steadfast-tv-dashboard**

We are going to drag-and-drop the dashboard files into it.

### Step 1.1 — Unzip the files

You received a file called **`steadfast-tv-dashboard.zip`**.

1. Find it in your Downloads folder.
2. Right-click it → choose **"Extract All…"** (Windows) or **double-click** (Mac) to unzip.
3. You should now see a folder called **`steadfast-tv-dashboard`** with files inside it.
4. Open that folder. You should see things like `server.mjs`, `package.json`, `render.yaml`, a `public` folder, a `lib` folder, etc.
5. **Important:** these are the files we are going to upload.

### Step 1.2 — Open your GitHub repo

1. Go to **https://github.com/SHB2020/steadfast-tv-dashboard**.
2. If GitHub asks you to sign in, sign in with the `SHB2020` account.

### Step 1.3 — Start the upload

You should see a mostly-empty page that says "Quick setup" with options like "creating a new file" or "uploading an existing file".

1. Click **"uploading an existing file"** (it's a blue link in the middle of the page).
   - If you don't see "Quick setup" because the repo isn't empty, click the green **"Add file"** button near the top right and choose **"Upload files"**.
2. You should now see a big drag-and-drop zone that says "Drag files here to add them to your repository".

### Step 1.4 — Drag the files in (the important part)

This is where the previous attempt went wrong. **Do not drag the zip file. Do not drag the outer folder. Drag the *contents* of the unzipped folder.**

1. Open the unzipped `steadfast-tv-dashboard` folder on your computer.
2. Press **Ctrl+A** (Windows) or **Cmd+A** (Mac) to select **everything inside**: `server.mjs`, `package.json`, `render.yaml`, `README.md`, `DEPLOY_NOW.md`, the `public` folder, the `lib` folder, the `scripts` folder, the `data` folder, and the hidden `.gitignore` and `.env.example` files.
3. Drag all of those, together, into the GitHub upload area.

**Sanity check:** GitHub should list each item: `server.mjs`, `package.json`, `render.yaml`, `lib/config.mjs`, `lib/sync-service.mjs`, `public/index.html`, etc. If you only see one item called `steadfast-tv-dashboard.zip`, you dragged the wrong thing — delete it and start the drag again with the unzipped contents.

### Step 1.5 — Commit the upload

1. Scroll down past the file list.
2. In the box labeled "Commit changes", leave the default message (or type "Initial upload").
3. Make sure **"Commit directly to the main branch"** is selected.
4. Click the green **"Commit changes"** button.
5. Wait a few seconds. The page will refresh and show all the files in the repo.

You should now see the same files at https://github.com/SHB2020/steadfast-tv-dashboard. Look for `render.yaml` near the top — Render will need that next.

---

## Part 2 — Deploy to Render (10 minutes)

### Step 2.1 — Create a Render account if you don't have one

1. Go to **https://render.com/**.
2. Click **"Get Started"** → sign up with your GitHub account (the same one with the `SHB2020` repo).
3. Follow the prompts. The free signup is fine for now.

### Step 2.2 — Create a new Blueprint

This is the easiest path — Render reads the `render.yaml` file in the repo and sets everything up for you.

1. Once logged in, on the Render dashboard, click the **"+ New"** button near the top right.
2. Choose **"Blueprint"**.
3. Render will ask you to connect a GitHub repository. Click **"Connect a repository"** or similar.
4. If GitHub asks "Where do you want to install Render?", pick the `SHB2020` account, then choose **"Only select repositories"** and pick **`steadfast-tv-dashboard`**. Confirm.
5. Back in Render, you should now see `SHB2020/steadfast-tv-dashboard` in the list. Click **"Connect"** next to it.

### Step 2.3 — Review the blueprint

Render will read `render.yaml` and show you what it's about to create:

- A web service called `steadfast-tv-dashboard`
- A 1 GB persistent disk called `steadfast-data` mounted at `/var/data`
- A list of environment variables, most marked "Sync: false" (which means "you'll fill this in")

This is exactly what we want. Click **"Apply"** (or **"Create"**, depending on Render's wording).

### Step 2.4 — Fill in the secret values

Render will now prompt you for the environment variables that have **`sync: false`**. You can fill in just what you have right now and add the rest later. Here's the order:

| Variable | What to put | Required to start? |
|---|---|---|
| `JOBTREAD_GRANT_KEY` | Your JobTread production grant key | Strongly recommended |
| `BASE_URL` | Leave blank for now (we'll set it after Render gives you a URL) | No |
| `QUICKBOOKS_CLIENT_ID` | Leave blank for now | No |
| `QUICKBOOKS_CLIENT_SECRET` | Leave blank for now | No |
| `QUICKBOOKS_REDIRECT_URI` | Leave blank for now | No |
| `QUICKBOOKS_REALM_ID` | Leave blank for now | No |
| `QUICKBOOKS_SOURCE_URL` | Leave blank for now | No |

Variables you don't need to touch (Render fills them automatically from `render.yaml`): `NODE_VERSION`, `DATA_DIR`, `COMPANY_NAME`, `SYNC_INTERVAL_MINUTES`, `SYNC_TOKEN`.

Click **"Apply"** / **"Save"** / **"Create Resources"** (whatever the bottom button says).

### Step 2.5 — Wait for the first deploy

1. Render will start building and deploying. You'll see a live log scroll by.
2. After 1–3 minutes, you'll see a green **"Live"** badge at the top of the service page.
3. At the very top, Render shows the public URL of your service. It looks like:
   **`https://steadfast-tv-dashboard.onrender.com`** (the exact name may differ).
4. Copy that URL.

### Step 2.6 — Set the BASE_URL env var

1. On the service page, click the **"Environment"** tab on the left.
2. Find `BASE_URL`, click the pencil/edit icon.
3. Paste the URL from the previous step (for example, `https://steadfast-tv-dashboard.onrender.com`).
4. Click **"Save Changes"**. Render will redeploy. Wait for "Live" again.

### Step 2.7 — Open the dashboard

1. Open the Render URL in a new tab.
2. You should see the full Steadfast TV dashboard with the seed data.
3. Visit `<your-url>/api/health` and confirm it says `"ok": true`. The `mode` will be `"snapshot"` until JobTread actually returns data.

If you set `JOBTREAD_GRANT_KEY` already, the next sync (within 15 minutes) will switch the dashboard to live data. Or click ahead to **Part 4** to force a sync immediately.

---

## Part 3 — Connect QuickBooks (10 minutes, one time only)

This is only needed if you want the finance numbers in the bottom-right of the dashboard to reflect real QuickBooks data. **You can skip this section and come back later** — JobTread will already work without it.

### Step 3.1 — Create the QuickBooks app

1. Go to **https://developer.intuit.com/**.
2. Sign in with the Intuit / QuickBooks Online account that owns the company file.
3. Top right, click **"Dashboard"** or **"My Apps"**.
4. Click **"Create an app"** → choose **"QuickBooks Online and Payments"**.
5. Give it a name like "Steadfast TV Dashboard". Click **Create**.

### Step 3.2 — Set the redirect URI

Inside your new app:

1. In the left sidebar, click **"Keys & credentials"** under **"Production Settings"**. (If your QuickBooks Online account is brand new, you may need to start under Development first; the steps are the same.)
2. Find the **"Redirect URIs"** section. Click **Add URI**.
3. Paste this exact URL (replacing the example with your real Render URL):
   `https://steadfast-tv-dashboard.onrender.com/api/qbo/callback`
4. Click **Save**.

### Step 3.3 — Copy the Client ID and Client Secret

On the same page, copy two values:

- **Client ID** (a long string starting with letters/numbers)
- **Client Secret** (click "Reveal" to see it; it's another long string)

Keep that window open — you'll paste them into Render in a moment.

### Step 3.4 — Paste them into Render

1. Go back to your Render service page.
2. Click the **"Environment"** tab.
3. Edit each value:
   - `QUICKBOOKS_CLIENT_ID` → paste the Client ID
   - `QUICKBOOKS_CLIENT_SECRET` → paste the Client Secret
   - `QUICKBOOKS_REDIRECT_URI` → paste `https://<your-render-url>/api/qbo/callback`
   - `QUICKBOOKS_REALM_ID` → leave blank for now (it gets filled in automatically)
4. Click **"Save Changes"**. Render redeploys. Wait for "Live".

### Step 3.5 — Connect

1. In your browser, open: `https://<your-render-url>/api/qbo/connect`
2. Intuit asks you to sign in to your company. Sign in.
3. Intuit asks you to authorize the app. Click **Connect** / **Authorize**.
4. Intuit redirects you back to the dashboard with `?qbo=connected` in the URL.
5. To verify, open: `https://<your-render-url>/api/qbo/status`
   - It should now show `"connected": true` and a real `"realmId"`.

That's it. Finance data will refresh on the next sync (15 minutes), or you can force one — see Part 4.

> **Why a persistent disk matters:** the `render.yaml` already configured a 1 GB persistent disk so your QuickBooks tokens survive every redeploy. Without it, you'd have to reconnect QuickBooks every time the service redeploys.

---

## Part 4 — Day-to-day operations

### Force a fresh sync right now

You'll occasionally want to force a sync without waiting 15 minutes (e.g., right after fixing a JobTread record or connecting QuickBooks).

1. On Render, go to your service → **"Environment"** tab.
2. Find `SYNC_TOKEN` and click the eye icon to reveal it. Copy the value.
3. Open a terminal (Mac: Terminal app; Windows: PowerShell) and paste this, replacing both placeholders:

```bash
curl -X POST -H "Authorization: Bearer THE_SYNC_TOKEN_YOU_COPIED" https://your-render-url.onrender.com/api/sync
```

If you don't want to use a terminal, you can also click **"Manual Deploy" → "Clear build cache & deploy"** on Render. The app runs a sync as soon as it boots.

### Check that everything is working

Open `https://<your-render-url>/api/health`. You should see:

- `"ok": true`
- `"mode": "live"` (after the first successful JobTread sync)
- `"sync.lastSuccessAt"` updated within the last 15 minutes
- `"sync.lastError": null`

If `lastError` is set, copy the message — that's the most useful clue for debugging.

### Set up the office TV

1. Open the office TV's browser.
2. Go to your Render URL.
3. Press **F11** (Windows) or use the browser's full-screen mode (Mac: Chrome → View → "Enter Full Screen") to hide the address bar.
4. Leave it on. The page auto-refreshes every 5 minutes and hard-reloads itself once a day.

### Adding a custom domain (optional)

If you want the TV to point at something like `tv.steadfasthb.com`:

1. On Render, go to your service → **"Settings"** tab → **"Custom Domains"**.
2. Click **"Add Custom Domain"** and enter your domain.
3. Render shows you the DNS records to add at your domain registrar.
4. After DNS propagates (a few minutes to an hour), update `BASE_URL` and `QUICKBOOKS_REDIRECT_URI` to use the custom domain. Add the new redirect URI to the Intuit app too.

---

## Troubleshooting cheat sheet

| Symptom | Likely cause | Fix |
|---|---|---|
| Render says "Build failed: Cannot find module" | The `package.json` didn't make it into the repo | Re-do Step 1.4. Confirm `package.json` is visible at the top of the GitHub repo. |
| Dashboard loads but shows seed data forever | `JOBTREAD_GRANT_KEY` not set | Add it under Environment → Save Changes |
| Finance section says "QuickBooks is not connected yet" | OAuth not finished or tokens expired | Redo Part 3 Step 3.5 |
| `/api/qbo/connect` returns "OAuth state mismatch" | You opened the URL in a different browser than the callback | Stay in the same browser/tab through the consent flow |
| `/api/health` shows `lastError: ...` | The sync hit an error | Read the message — it's almost always an env var typo or an expired credential |
| Render service stops at night | Free tier sleeps after 15 min of no traffic | Upgrade to "Starter" plan, or accept a 15-second cold start |

---

## What was already set up for you in `render.yaml`

You don't have to type these into Render — they auto-applied:

- Web Service named `steadfast-tv-dashboard`
- Node 20 runtime
- Build command: `npm install --omit=dev`
- Start command: `npm start`
- Health check at `/api/health`
- 1 GB persistent disk at `/var/data`
- `DATA_DIR=/var/data` (so live data is stored on the persistent disk)
- A randomly generated `SYNC_TOKEN` for protecting the manual sync endpoint
- Sync interval of 15 minutes
- Company name set to "Steadfast Homebuyers"

You're done. The dashboard should be live, refreshing automatically, and pulling JobTread data on schedule.
