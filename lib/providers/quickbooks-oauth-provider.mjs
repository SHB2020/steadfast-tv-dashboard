import crypto from "node:crypto";
import { config } from "../config.mjs";
import { readQuickBooksTokens, writeQuickBooksTokens } from "../token-store.mjs";

const AUTH_BASE = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REPORTS_BASE = "https://quickbooks.api.intuit.com/v3/company";
const ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting";

function basicAuthHeader() {
  return `Basic ${Buffer.from(`${config.quickBooks.clientId}:${config.quickBooks.clientSecret}`).toString("base64")}`;
}

function nowPlusSeconds(seconds) {
  return new Date(Date.now() + (seconds * 1000)).toISOString();
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function flattenRows(rows = []) {
  const output = [];
  for (const row of rows) {
    if (row?.Summary?.ColData?.length) output.push(row.Summary.ColData);
    if (row?.ColData?.length) output.push(row.ColData);
    if (row?.Rows?.Row?.length) output.push(...flattenRows(row.Rows.Row));
  }
  return output;
}

function findReportValue(reportJson, names) {
  const rows = flattenRows(reportJson?.Rows?.Row ?? []);
  for (const row of rows) {
    const label = row?.[0]?.value?.trim();
    if (label && names.includes(label)) {
      const valueCell = row.at(-1);
      return parseAmount(valueCell?.value);
    }
  }
  return 0;
}

async function tokenRequest(bodyParams) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(bodyParams),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`QuickBooks token request failed: ${response.status} ${text}`);
  }

  return response.json();
}

export function quickBooksConfigured() {
  return Boolean(config.quickBooks.clientId && config.quickBooks.clientSecret && config.quickBooks.redirectUri);
}

export function buildQuickBooksAuthUrl(state) {
  const url = new URL(AUTH_BASE);
  url.searchParams.set("client_id", config.quickBooks.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ACCOUNTING_SCOPE);
  url.searchParams.set("redirect_uri", config.quickBooks.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export function generateQuickBooksState() {
  return crypto.randomUUID();
}

export async function exchangeQuickBooksCode({ code, realmId }) {
  const payload = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.quickBooks.redirectUri,
  });

  const tokens = {
    realmId,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type,
    expiresAt: nowPlusSeconds(payload.expires_in ?? 3600),
    refreshExpiresAt: nowPlusSeconds(payload.x_refresh_token_expires_in ?? 8640000),
    updatedAt: new Date().toISOString(),
  };

  await writeQuickBooksTokens(tokens);
  return tokens;
}

async function refreshQuickBooksTokens(tokens) {
  const payload = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
  });

  const next = {
    realmId: tokens.realmId,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type,
    expiresAt: nowPlusSeconds(payload.expires_in ?? 3600),
    refreshExpiresAt: nowPlusSeconds(payload.x_refresh_token_expires_in ?? 8640000),
    updatedAt: new Date().toISOString(),
  };

  await writeQuickBooksTokens(next);
  return next;
}

export async function getQuickBooksConnectionStatus() {
  const tokens = await readQuickBooksTokens();
  return {
    configured: quickBooksConfigured(),
    connected: Boolean(tokens?.accessToken),
    realmId: config.quickBooks.realmId || tokens?.realmId || null,
    tokenUpdatedAt: tokens?.updatedAt || null,
    redirectUri: config.quickBooks.redirectUri || null,
  };
}

export async function getQuickBooksAccess() {
  const tokens = await readQuickBooksTokens();
  if (!tokens?.accessToken) {
    throw new Error("QuickBooks is not connected yet");
  }

  const expiresAt = new Date(tokens.expiresAt).getTime();
  if (Number.isNaN(expiresAt) || expiresAt < Date.now() + 60_000) {
    return refreshQuickBooksTokens(tokens);
  }

  return tokens;
}

async function fetchReport(reportName, params, tokens) {
  const url = new URL(`${REPORTS_BASE}/${tokens.realmId}/reports/${reportName}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  url.searchParams.set("minorversion", "75");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`QuickBooks report ${reportName} failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function pullQuickBooksFinanceFromApi(fallbackFinance) {
  const tokens = await getQuickBooksAccess();
  const end = new Date();
  const start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));

  const profitAndLoss = await fetchReport("ProfitAndLoss", {
    start_date: formatDate(start),
    end_date: formatDate(end),
    accounting_method: "Accrual",
  }, tokens);

  const cashFlow = await fetchReport("CashFlow", {
    start_date: formatDate(start),
    end_date: formatDate(end),
  }, tokens);

  const monthlyNetIncome = [];
  for (let offset = 3; offset >= 0; offset -= 1) {
    const monthDate = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - offset, 1));
    const report = await fetchReport("ProfitAndLoss", {
      start_date: formatDate(startOfMonth(monthDate)),
      end_date: formatDate(endOfMonth(monthDate)),
      accounting_method: "Accrual",
    }, tokens);
    monthlyNetIncome.push({
      label: monthDate.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      value: findReportValue(report, ["Net Income"]),
    });
  }

  return {
    periodLabel: `${formatDate(start)} to ${formatDate(end)}`,
    totalIncome: findReportValue(profitAndLoss, ["Total Income"]),
    grossProfit: findReportValue(profitAndLoss, ["Gross Profit"]),
    netIncome: findReportValue(profitAndLoss, ["Net Income"]),
    cashAtEnd: findReportValue(cashFlow, ["CASH AT END OF PERIOD", "Cash at end of period"]),
    operatingCashFlow: findReportValue(cashFlow, ["Net cash provided by operating activities"]),
    monthlyNetIncome: monthlyNetIncome.length ? monthlyNetIncome : (fallbackFinance?.monthlyNetIncome ?? []),
  };
}
