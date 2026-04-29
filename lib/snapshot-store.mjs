import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";

async function ensureSnapshot() {
  await mkdir(path.dirname(config.snapshotPath), { recursive: true });
  try {
    await stat(config.snapshotPath);
    return;
  } catch {
    // Snapshot is missing (fresh disk, fresh checkout). Seed it from the
    // bundled snapshot so the dashboard always has something to render.
    await copyFile(config.seedSnapshotPath, config.snapshotPath);
  }
}

export async function readSnapshot() {
  await ensureSnapshot();
  const raw = await readFile(config.snapshotPath, "utf8");
  return JSON.parse(raw);
}

export async function writeSnapshot(snapshot) {
  await mkdir(path.dirname(config.snapshotPath), { recursive: true });
  await writeFile(config.snapshotPath, JSON.stringify(snapshot, null, 2));
}

export async function snapshotInfo() {
  try {
    const info = await stat(config.snapshotPath);
    return {
      path: config.snapshotPath,
      updatedAt: info.mtime.toISOString(),
      size: info.size,
      exists: true,
    };
  } catch {
    return {
      path: config.snapshotPath,
      updatedAt: null,
      size: 0,
      exists: false,
    };
  }
}
