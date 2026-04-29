import { readFile } from "node:fs/promises";
import { pullQuickBooksFinanceFromApi, quickBooksConfigured } from "./quickbooks-oauth-provider.mjs";

export async function pullQuickBooksFinance({ sourceFile, sourceUrl, fallbackFinance }) {
  if (sourceFile) {
    const raw = await readFile(sourceFile, "utf8");
    return JSON.parse(raw);
  }

  if (sourceUrl) {
    const response = await fetch(sourceUrl, { headers: { "Cache-Control": "no-store" } });
    if (!response.ok) {
      throw new Error(`QuickBooks source URL failed: ${response.status}`);
    }
    return response.json();
  }

  if (quickBooksConfigured()) {
    return pullQuickBooksFinanceFromApi(fallbackFinance);
  }

  return fallbackFinance;
}
