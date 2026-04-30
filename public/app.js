// Default 5-minute client-side refresh. Server syncs on its own cadence
// (every 15 minutes by default), but a client poll keeps the screen fresh
// even if the user reloads at an awkward moment.
const REFRESH_MS = 300000;

// Hard-reload the page once a day so the kiosk picks up new deploys and
// doesn't accumulate memory or stale assets.
const HARD_RELOAD_MS = 24 * 60 * 60 * 1000;

const formatMoney = (value) => {
  if (value == null) return "Not loaded";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatPct = (value) => {
  if (value == null) return "Not loaded";
  return `${(value * 100).toFixed(1)}%`;
};

const formatSyncTime = (iso) => {
  if (!iso) return "Pending first sync";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const rail = document.querySelector("#kpi-rail");
const attentionList = document.querySelector("#attention-list");
const signalsList = document.querySelector("#signals-list");
const mixList = document.querySelector("#mix-list");
const projectGrid = document.querySelector("#project-grid");
const financeKpis = document.querySelector("#finance-kpis");
const sparkChart = document.querySelector("#spark-chart");
const sparkLabels = document.querySelector("#spark-labels");
const openGapList = document.querySelector("#open-gap-list");
const title = document.querySelector("#title");
const lastSync = document.querySelector("#last-sync");
const refreshMode = document.querySelector("#refresh-mode");

function setClock() {
  const now = new Date();
  document.querySelector("#clock").textContent = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderKpis(kpis = {}) {
  const items = [
    ["Open Jobs", kpis.openJobs ?? 0],
    ["Active Jobs", kpis.activeJobs ?? 0],
    ["Open But Not Active", kpis.openNotActive ?? 0],
    ["Active At Risk", kpis.activeAtRisk ?? 0],
    ["Over Budget Active", kpis.overBudgetActive ?? 0],
  ];
  rail.innerHTML = items
    .map(
      ([label, value]) => `
        <article class="kpi">
          <span class="kpi-label">${label}</span>
          <div class="kpi-value">${value}</div>
        </article>
      `,
    )
    .join("");
}

function renderAttention(rows = []) {
  if (!rows.length) {
    attentionList.innerHTML = `
      <article class="attention-card">
        <div>
          <div class="mini-label">All clear</div>
          <h3>Nothing requires immediate attention right now.</h3>
          <p class="attention-copy">Check back after the next sync.</p>
        </div>
      </article>`;
    return;
  }
  attentionList.innerHTML = rows
    .map((row) => {
      const tone = row.timeline === "Watch" ? "watch" : "";
      return `
        <article class="attention-card ${tone}">
          <div>
            <div class="mini-label">${row.timeline ?? ""}</div>
            <h3>${row.property ?? ""}</h3>
            <p class="attention-copy">${row.scheduleSignal ?? ""}</p>
          </div>
          <div>
            <div class="mini-label">Budget + Quality</div>
            <p class="attention-copy">${row.budgetSignal ?? ""}</p>
            <p class="attention-copy">${row.qualitySignal ?? ""}</p>
          </div>
          <div>
            <div class="mini-label">Action</div>
            <p class="attention-copy">${row.action ?? ""}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSignals(rows = []) {
  signalsList.innerHTML = rows
    .map(
      (row) => `
        <div class="signal-row">
          <strong>${row.label ?? ""}</strong>
          <span>${row.value ?? ""}</span>
        </div>
      `,
    )
    .join("");
}

function renderMix(rows = []) {
  const toneClass = {
    "At Risk": "risk",
    Watch: "watch",
    "On Track": "ok",
  };

  mixList.innerHTML = rows
    .map(
      (row) => `
        <div class="mix-row">
          <span class="mix-chip"><span class="dot ${toneClass[row.label] || "ok"}"></span>${row.label}</span>
          <strong>${row.count}</strong>
        </div>
      `,
    )
    .join("");
}

function renderProjects(rows = []) {
  if (!rows.length) {
    projectGrid.innerHTML = `<div class="error-state">No active projects loaded yet.</div>`;
    return;
  }
  projectGrid.innerHTML = rows
    .map((row) => {
      const tone = row.timelineBucket === "At Risk" ? "risk" : row.timelineBucket === "Watch" ? "watch" : "";
      return `
        <article class="project-card ${tone}">
          <div>
            <div class="status-pill">
              <span class="dot ${tone || "ok"}"></span>
              <span>${row.timelineBucket}</span>
            </div>
            <h3>${row.property}</h3>
            <p class="attention-copy">${row.rehabOps || "Stage not loaded"}${row.targetCompletionDate ? ` • target ${row.targetCompletionDate}` : ""}</p>
          </div>
          <div class="project-metrics">
            <div class="metric-line"><span>Days remaining</span><strong>${row.daysRemaining ?? "None"}</strong></div>
            <div class="metric-line"><span>Actual cost</span><strong>${formatMoney(row.actualCost)}</strong></div>
            <div class="metric-line"><span>Rehab budget</span><strong>${formatMoney(row.rehabBudget)}</strong></div>
            <div class="metric-line"><span>Budget used</span><strong>${formatPct(row.actualVsRehabBudget)}</strong></div>
            <div class="metric-line"><span>ARV</span><strong>${formatMoney(row.arv)}</strong></div>
          </div>
          <div>
            <div class="mini-label">${row.qualityStatus ?? ""}</div>
            <p class="project-evidence">${row.qualityEvidence ?? ""}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderFinance(finance) {
  // Hide the entire QuickBooks Pressure section when not connected, OR when
  // the snapshot still contains the bundled seed finance numbers. We never
  // want to leave stale-but-real-looking finance on the TV.
  const qbSection = document.getElementById("qb-section");
  const isSeedFinance = finance?.periodLabel === "Jan 1 to Apr 29, 2026";
  if (!finance || isSeedFinance) {
    if (qbSection) qbSection.style.display = "none";
    financeKpis.innerHTML = "";
    sparkChart.innerHTML = "";
    sparkLabels.innerHTML = "";
    return;
  }
  if (qbSection) qbSection.style.display = "";

  const financeRows = [
    ["Period", finance.periodLabel ?? "—"],
    ["Total income", formatMoney(finance.totalIncome)],
    ["Gross profit", formatMoney(finance.grossProfit)],
    ["Net income", `<span class="${finance.netIncome < 0 ? "money-negative" : "money-positive"}">${formatMoney(finance.netIncome)}</span>`],
    ["Cash at end", formatMoney(finance.cashAtEnd)],
    ["Op cash flow", `<span class="${finance.operatingCashFlow < 0 ? "money-negative" : "money-positive"}">${formatMoney(finance.operatingCashFlow)}</span>`],
  ];

  financeKpis.innerHTML = financeRows
    .map(
      ([label, value]) => `
        <div class="finance-row">
          <strong>${label}</strong>
          <span>${value}</span>
        </div>
      `,
    )
    .join("");

  const monthly = Array.isArray(finance.monthlyNetIncome) ? finance.monthlyNetIncome : [];
  if (!monthly.length) {
    sparkChart.innerHTML = "";
    sparkLabels.innerHTML = "";
    return;
  }

  const maxMagnitude = Math.max(...monthly.map((d) => Math.abs(d.value || 0))) || 1;
  sparkChart.innerHTML = monthly
    .map((item) => {
      const height = Math.max(18, Math.round((Math.abs(item.value || 0) / maxMagnitude) * 120));
      const tone = (item.value || 0) >= 0 ? "positive" : "";
      return `<div class="spark-bar ${tone}" style="height:${height}px" title="${item.label}: ${formatMoney(item.value)}"></div>`;
    })
    .join("");
  sparkLabels.innerHTML = monthly
    .map((item) => `<div>${item.label}<br />${formatMoney(item.value)}</div>`)
    .join("");
}

function renderOpenGap(rows = []) {
  if (!rows.length) {
    openGapList.innerHTML = `<div class="gap-row"><strong>None</strong><span>Every open job is also marked Active.</span></div>`;
    return;
  }
  openGapList.innerHTML = rows
    .map(
      (row) => `
        <div class="gap-row">
          <strong>${row.property}</strong>
          <span>${row.stage || "No stage"}: ${row.reason}</span>
        </div>
      `,
    )
    .join("");
}

async function loadDashboard() {
  try {
    const response = await fetch(`/api/dashboard?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    title.textContent = data.meta?.dashboardTitle || "Fix-and-Flip Command Screen";
    lastSync.textContent = formatSyncTime(data.meta?.generatedAt);
    refreshMode.textContent = `Every ${Math.round((data.meta?.refreshMs || REFRESH_MS) / 60000)} min`;

    // Strip the QuickBooks signal from Operating Signals when QB isn't connected
    // (or when finance is still the bundled seed). The QuickBooks Pressure
    // panel below uses the same heuristic — we want both to disappear together.
    const isSeedFinance = data.finance?.periodLabel === "Jan 1 to Apr 29, 2026";
    const signals = (!data.finance || isSeedFinance)
      ? (data.portfolioSignals || []).filter((s) => s.label !== "QuickBooks")
      : data.portfolioSignals;

    renderKpis(data.kpis);
    renderAttention(data.attentionNow);
    renderSignals(signals);
    renderMix(data.timelineMix);
    renderProjects(data.activeProjects);
    renderFinance(data.finance);
    renderOpenGap(data.openNotActivePreview);
  } catch (error) {
    attentionList.innerHTML = `<div class="error-state">Unable to load the dashboard right now. ${error.message}</div>`;
  }
}

setClock();
setInterval(setClock, 1000);
loadDashboard();
setInterval(loadDashboard, REFRESH_MS);
setTimeout(() => window.location.reload(), HARD_RELOAD_MS);
