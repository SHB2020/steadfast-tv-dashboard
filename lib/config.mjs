import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function numberFromEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Where mutable runtime state lives (snapshot, QuickBooks tokens).
// On Render, point DATA_DIR at a persistent disk mount (e.g. /var/data)
// so that values survive redeploys. Locally it falls back to ./data.
const dataDir = process.env.DATA_DIR || path.join(appRoot, "data");

// The seed snapshot ships in the repo at ./data/seed-snapshot.json.
// On first boot (e.g. after a fresh persistent disk is created), the
// server copies this file into dataDir so the dashboard renders even
// before the first live sync completes.
const seedSnapshotPath = path.join(appRoot, "data", "seed-snapshot.json");

export const config = {
  appRoot,
  publicDir: path.join(appRoot, "public"),
  dataDir,
  seedSnapshotPath,
  snapshotPath:
    process.env.DASHBOARD_SNAPSHOT_PATH ||
    path.join(dataDir, "dashboard-snapshot.json"),
  quickBooksTokenPath:
    process.env.QUICKBOOKS_TOKEN_PATH ||
    path.join(dataDir, "quickbooks-tokens.json"),
  port: numberFromEnv("PORT", 3000),
  syncIntervalMinutes: numberFromEnv("SYNC_INTERVAL_MINUTES", 15),
  syncToken: process.env.SYNC_TOKEN || "",
  companyName: process.env.COMPANY_NAME || "Steadfast Homebuyers",
  baseUrl: process.env.BASE_URL || "",
  jobTread: {
    grantKey: process.env.JOBTREAD_GRANT_KEY || "",
    endpoint: process.env.JOBTREAD_ENDPOINT || "https://api.jobtread.com/pave",
  },
  quickBooks: {
    sourceFile: process.env.QUICKBOOKS_SOURCE_FILE || "",
    sourceUrl: process.env.QUICKBOOKS_SOURCE_URL || "",
    clientId: process.env.QUICKBOOKS_CLIENT_ID || "",
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || "",
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || "",
    realmId: process.env.QUICKBOOKS_REALM_ID || "",
    environment: process.env.QUICKBOOKS_ENVIRONMENT || "production",
  },
};
