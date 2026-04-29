# Steadfast TV Dashboard

Hosted office TV dashboard for Steadfast Homebuyers fix-and-flip operations.

**To deploy this for the first time, follow [`DEPLOY_NOW.md`](./DEPLOY_NOW.md).** That file is the click-by-click walkthrough.

## What it does

- Serves a full-screen browser dashboard at `/` for the office TV.
- Auto-refreshes the screen every 5 minutes.
- Pulls fresh project data from JobTread on the server every 15 minutes.
- Pulls fresh finance data from QuickBooks (after a one-time consent flow).
- Highlights timeline risk, budget risk, quality evidence, and the open-but-not-active cleanup queue.

## API surface

- `GET /` — the dashboard HTML
- `GET /api/dashboard` — current snapshot JSON (what the page reads)
- `GET /api/health` — Render health check; reports snapshot age and last sync
- `POST /api/sync` — force a sync (requires `Authorization: Bearer ${SYNC_TOKEN}`)
- `GET /api/qbo/status` — current QuickBooks connection state
- `GET /api/qbo/connect` — start QuickBooks OAuth (one-time per environment)
- `GET /api/qbo/callback` — Intuit redirects here after consent

## Run locally

```bash
npm start
```

Then open http://localhost:3000.

No `npm install` is needed — the app uses only built-in Node modules.

## Project layout

```
server.mjs                    HTTP server + route table
lib/
  config.mjs                  All env-var reading happens here
  snapshot-store.mjs          Reads/writes the snapshot JSON, seeds on first boot
  sync-service.mjs            Orchestrates JobTread + QuickBooks pulls
  token-store.mjs             Persists QuickBooks OAuth tokens to disk
  providers/
    jobtread-provider.mjs     Pave query + project normalization
    quickbooks-oauth-provider.mjs  OAuth dance + report fetch
    quickbooks-provider.mjs   Routes between OAuth / JSON URL / local file
public/
  index.html  app.js  styles.css   The TV view
data/
  seed-snapshot.json           Bundled in repo. Seed used on first boot.
scripts/
  run-sync.mjs                 CLI: trigger one sync cycle and exit
  build-snapshot.mjs           CLI: re-seed the snapshot file from seed-snapshot.json
render.yaml                    Render Blueprint (used by the deploy walkthrough)
.env.example                   Example local env file
```

## Persistent state

On Render, mutable runtime state (the live snapshot and the QuickBooks tokens)
lives on a persistent disk mounted at `/var/data`. The `DATA_DIR` env var
points the app at that mount. Without the persistent disk, every redeploy
would force you to reconnect QuickBooks.

## Environment variables

See [`.env.example`](./.env.example) for the full list with comments.
