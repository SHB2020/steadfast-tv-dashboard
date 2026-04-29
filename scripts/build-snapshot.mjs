// Convenience script: copy the seed snapshot into the live snapshot path,
// so the dashboard renders immediately after a fresh local clone or a fresh
// Render disk. The server also does this automatically on first boot.
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../lib/config.mjs";

await mkdir(path.dirname(config.snapshotPath), { recursive: true });
await copyFile(config.seedSnapshotPath, config.snapshotPath);
console.log(`Seeded snapshot at ${config.snapshotPath}`);
