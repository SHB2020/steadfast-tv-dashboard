// CLI: trigger one sync cycle and print the result, then exit.
// Useful for cron jobs, one-off Render Shell runs, or local debugging.
import { runSync, getSyncState } from "../lib/sync-service.mjs";

const result = await runSync({ force: true });
const state = getSyncState();

console.log(JSON.stringify({ ok: !state.lastError, sync: state, result }, null, 2));
process.exit(state.lastError ? 1 : 0);
