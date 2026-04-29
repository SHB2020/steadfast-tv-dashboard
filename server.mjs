import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./lib/config.mjs";
import {
  buildQuickBooksAuthUrl,
  exchangeQuickBooksCode,
  generateQuickBooksState,
  getQuickBooksConnectionStatus,
  quickBooksConfigured,
} from "./lib/providers/quickbooks-oauth-provider.mjs";
import { readSnapshot, snapshotInfo } from "./lib/snapshot-store.mjs";
import { getSyncState, runSync } from "./lib/sync-service.mjs";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendRedirect(res, location, cookies = []) {
  const headers = { Location: location };
  if (cookies.length) headers["Set-Cookie"] = cookies;
  res.writeHead(302, headers);
  res.end();
}

function parseCookies(cookieHeader = "") {
  const pairs = cookieHeader.split(";").map((part) => part.trim()).filter(Boolean);
  const output = {};
  for (const pair of pairs) {
    const [name, ...rest] = pair.split("=");
    output[name] = decodeURIComponent(rest.join("="));
  }
  return output;
}

async function serveFile(res, targetPath) {
  try {
    const ext = path.extname(targetPath).toLowerCase();
    const body = await readFile(targetPath);
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/dashboard") {
    try {
      const data = await readSnapshot();
      return sendJson(res, 200, data);
    } catch (error) {
      return sendJson(res, 500, {
        error: "Unable to load dashboard snapshot",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (url.pathname === "/api/health") {
    // Health check is intentionally tolerant: it should return 200 even
    // before the first snapshot is written, so Render's healthCheckPath
    // does not flap during cold starts.
    try {
      const info = await snapshotInfo();
      const syncState = getSyncState();
      return sendJson(res, 200, {
        ok: true,
        snapshotPath: info.path,
        snapshotExists: info.exists,
        snapshotUpdatedAt: info.updatedAt,
        snapshotSize: info.size,
        mode: syncState.mode,
        sync: syncState,
        company: config.companyName,
        syncIntervalMinutes: config.syncIntervalMinutes,
      });
    } catch (error) {
      return sendJson(res, 200, {
        ok: true,
        warning: "snapshot inspection failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (url.pathname === "/api/qbo/status") {
    try {
      const status = await getQuickBooksConnectionStatus();
      return sendJson(res, 200, status);
    } catch (error) {
      return sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (url.pathname === "/api/qbo/connect") {
    if (!quickBooksConfigured()) {
      return sendJson(res, 400, {
        ok: false,
        error: "QuickBooks OAuth is not configured yet. Set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, and QUICKBOOKS_REDIRECT_URI.",
      });
    }

    const state = generateQuickBooksState();
    const secure = (config.baseUrl || "").startsWith("https://") ||
      (req.headers["x-forwarded-proto"] === "https");
    const cookie = [
      `qbo_oauth_state=${encodeURIComponent(state)}`,
      "HttpOnly",
      "Path=/",
      "Max-Age=600",
      "SameSite=Lax",
      secure ? "Secure" : "",
    ].filter(Boolean).join("; ");

    return sendRedirect(res, buildQuickBooksAuthUrl(state), [cookie]);
  }

  if (url.pathname === "/api/qbo/callback") {
    const cookies = parseCookies(req.headers.cookie || "");
    const expectedState = cookies.qbo_oauth_state;
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const realmId = url.searchParams.get("realmId");

    if (!expectedState || !state || expectedState !== state) {
      return sendJson(res, 400, { ok: false, error: "QuickBooks OAuth state mismatch" });
    }

    if (!code || !realmId) {
      return sendJson(res, 400, { ok: false, error: "Missing QuickBooks callback parameters" });
    }

    try {
      await exchangeQuickBooksCode({ code, realmId });
      const clearCookie = "qbo_oauth_state=; Path=/; Max-Age=0; SameSite=Lax";
      // Kick off a sync immediately so finance data is fresh after connecting.
      runSync({ force: true }).catch(() => {});
      return sendRedirect(res, "/?qbo=connected", [clearCookie]);
    } catch (error) {
      return sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (url.pathname === "/api/sync" && req.method === "POST") {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (config.syncToken && token !== config.syncToken) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" });
    }

    const state = await runSync({ force: true });
    return sendJson(res, 200, { ok: !state.lastError, sync: state });
  }

  if (url.pathname === "/") {
    return serveFile(res, path.join(config.publicDir, "index.html"));
  }

  const requested = path.normalize(path.join(config.publicDir, url.pathname));
  if (!requested.startsWith(config.publicDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  return serveFile(res, requested);
});

const intervalMs = Math.max(1, config.syncIntervalMinutes) * 60_000;
setInterval(() => {
  runSync().catch((err) => console.error("Background sync failed:", err.message));
}, intervalMs);

// Initial sync on boot — non-fatal if it fails (snapshot fallback covers it).
runSync().catch((err) => console.error("Initial sync failed:", err.message));

server.listen(config.port, () => {
  console.log(`Steadfast TV dashboard listening on port ${config.port}`);
  console.log(`Data dir: ${config.dataDir}`);
  console.log(`Sync interval: every ${config.syncIntervalMinutes} minute(s)`);
});
