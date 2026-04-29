# Render Deployment Notes

## Recommended Render shape

- Create one `Web Service`
- Keep the TV pointed at that one hosted URL in full-screen browser mode
- Use the built-in health check on `/api/health`
- Let the app perform its own background sync every 15 minutes

## Fastest setup

If you deploy from GitHub, Render can read the included `render.yaml` blueprint.

That blueprint already sets:

- service name
- Node runtime
- Starter plan
- root directory
- build command
- start command
- health check path
- placeholder environment variables

## Manual Render settings

If you prefer to click through Render instead of using the blueprint, use:

- Service type: `Web Service`
- Runtime: `Node`
- Root Directory: `tv-dashboard`
- Build Command: `npm install --omit=dev`
- Start Command: `npm start`
- Health Check Path: `/api/health`
- Plan: `Starter`

## Environment variables

Copy `.env.example` and fill in:

- `SYNC_TOKEN`: used for manual sync calls to `POST /api/sync`
- `JOBTREAD_GRANT_KEY`: enables direct JobTread refresh
- `QUICKBOOKS_SOURCE_FILE` or `QUICKBOOKS_SOURCE_URL`: current finance input path
- `COMPANY_NAME`: leave as `Steadfast Homebuyers`
- `SYNC_INTERVAL_MINUTES`: start with `15`

For Render specifically, I recommend setting:

- `SYNC_TOKEN` as a generated secret
- `JOBTREAD_GRANT_KEY` as a secret environment variable
- `QUICKBOOKS_SOURCE_URL` as a secret environment variable if you use a private finance endpoint
- `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET` as secrets if you use direct OAuth
- `QUICKBOOKS_REDIRECT_URI` to `https://your-render-url.onrender.com/api/qbo/callback`
- `QUICKBOOKS_REALM_ID` after the first QuickBooks connection if you want it pinned in env

## QuickBooks direct connect

This app now includes:

- `GET /api/qbo/status`
- `GET /api/qbo/connect`
- `GET /api/qbo/callback`

Direct QuickBooks setup on Render:

1. Create your Intuit developer app
2. Add this redirect URI in Intuit:
   `https://your-render-url.onrender.com/api/qbo/callback`
3. Set these Render secrets:
   - `QUICKBOOKS_CLIENT_ID`
   - `QUICKBOOKS_CLIENT_SECRET`
   - `QUICKBOOKS_REDIRECT_URI`
4. Open:
   `https://your-render-url.onrender.com/api/qbo/connect`
5. Complete the QuickBooks consent flow once
6. Check:
   `https://your-render-url.onrender.com/api/qbo/status`

After that, the sync job can start pulling finance reports directly from QuickBooks.

## Manual sync

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_SYNC_TOKEN" \
  https://your-tv-dashboard.example.com/api/sync
```

## Health check

Use:

```bash
curl https://your-tv-dashboard.example.com/api/health
```

This returns:

- snapshot timestamp
- current mode (`snapshot` or `live`)
- last sync attempt and last sync error

## After deploy

1. Open the Render URL in a browser and confirm the dashboard loads.
2. Check `/api/health` and make sure the service is healthy.
3. Add the custom domain you want the TV to use.
4. Put the office TV browser in full-screen / kiosk mode on that URL.
5. Once credentials are in place, run one manual `POST /api/sync` and confirm the mode moves from `snapshot` to `live`.

## Honest current status

- JobTread live pull is wired for production once you provide a grant key.
- QuickBooks now supports either a private finance JSON feed or a direct OAuth connection path.
- The remaining production work is entering your Intuit app credentials in Render and completing the first consent flow.
