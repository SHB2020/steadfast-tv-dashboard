import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";

export async function readQuickBooksTokens() {
  try {
    const raw = await readFile(config.quickBooksTokenPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeQuickBooksTokens(tokens) {
  await mkdir(path.dirname(config.quickBooksTokenPath), { recursive: true });
  await writeFile(config.quickBooksTokenPath, JSON.stringify(tokens, null, 2));
}
