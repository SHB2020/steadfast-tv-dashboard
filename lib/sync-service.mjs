import { config } from "./config.mjs";
import { pullJobTreadPortfolio } from "./providers/jobtread-provider.mjs";
import { pullQuickBooksFinance } from "./providers/quickbooks-provider.mjs";
import { readSnapshot, writeSnapshot } from "./snapshot-store.mjs";

let syncState = {
  running: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  mode: "snapshot",
};

function takeTopAttention(activeProjects) {
  return activeProjects
    .filter((project) => project.timelineBucket !== "On Track" || (project.actualVsRehabBudget ?? 0) > 1)
    .sort((a, b) => {
      const aScore = (a.timelineBucket === "At Risk" ? 10 : 4) + ((a.actualVsRehabBudget ?? 0) > 1 ? 3 : 0);
      const bScore = (b.timelineBucket === "At Risk" ? 10 : 4) + ((b.actualVsRehabBudget ?? 0) > 1 ? 3 : 0);
      return bScore - aScore;
    })
    .slice(0, 3)
    .map((project) => ({
      property: project.property,
      timeline: project.timelineBucket,
      scheduleSignal: project.daysRemaining == null
        ? "No completion plan loaded"
        : project.daysRemaining < 0
          ? `${Math.abs(project.daysRemaining)} days past target completion`
          : `${project.daysRemaining} days left to target completion`,
      budgetSignal: project.actualVsRehabBudget == null
        ? project.rehabBudget == null
          ? "No rehab budget loaded"
          : "Budget loaded but no actual spend yet"
        : `${(project.actualVsRehabBudget * 100).toFixed(1)}% of rehab budget spent`,
      qualitySignal: project.qualityEvidence,
      action: project.timelineBucket === "At Risk"
        ? "Escalate this job in the next ops check-in."
        : "Verify next milestone and keep it moving.",
    }));
}

function buildSignals({ activeProjects, openNotActive, finance }) {
  const atRisk = activeProjects.filter((project) => project.timelineBucket === "At Risk").length;
  const overBudget = activeProjects.filter((project) => (project.actualVsRehabBudget ?? 0) > 1).length;
  const qualityConcern = activeProjects.filter((project) => project.qualityStatus === "Concern").length;

  return [
    {
      label: "Timeline",
      value: `${activeProjects.length} active jobs, with ${atRisk} currently at risk.`,
    },
    {
      label: "Budget",
      value: `${overBudget} active jobs are already above rehab budget.`,
    },
    {
      label: "Quality",
      value: `${qualityConcern} active jobs show strong field evidence of quality or rework risk.`,
    },
    {
      label: "Data gap",
      value: `${openNotActive.length} properties are open in JobTread but not marked Active Job.`,
    },
    {
      label: "QuickBooks",
      value: `Net income is ${finance?.netIncome < 0 ? "negative" : "positive"} for ${finance?.periodLabel || "the current period"}.`,
    },
  ];
}

function buildTimelineMix(activeProjects) {
  const labels = ["At Risk", "Watch", "On Track"];
  return labels.map((label) => ({
    label,
    count: activeProjects.filter((project) => project.timelineBucket === label).length,
  }));
}

function buildSnapshot({ previousSnapshot, companyName, projects, finance, sourceMode }) {
  const activeProjects = projects.filter((project) => project.activeJob);
  const openNotActive = projects.filter((project) => !project.activeJob);

  return {
    meta: {
      ...previousSnapshot.meta,
      company: companyName || previousSnapshot.meta.company,
      dashboardTitle: previousSnapshot.meta.dashboardTitle,
      generatedAt: new Date().toISOString(),
      sourceMode,
      refreshMs: config.syncIntervalMinutes * 60_000,
      note: sourceMode === "live"
        ? "Server-side sync is enabled."
        : previousSnapshot.meta.note,
    },
    kpis: {
      openJobs: projects.length,
      activeJobs: activeProjects.length,
      openNotActive: openNotActive.length,
      activeAtRisk: activeProjects.filter((project) => project.timelineBucket === "At Risk").length,
      overBudgetActive: activeProjects.filter((project) => (project.actualVsRehabBudget ?? 0) > 1).length,
    },
    attentionNow: takeTopAttention(activeProjects),
    portfolioSignals: buildSignals({ activeProjects, openNotActive, finance }),
    timelineMix: buildTimelineMix(activeProjects),
    activeProjects: activeProjects.slice(0, 5),
    openNotActivePreview: openNotActive.slice(0, 4).map((project) => ({
      property: project.property,
      city: project.city,
      stage: project.rehabOps,
      reason: project.qualityEvidence || "Open in JobTread but not marked active.",
    })),
    finance,
  };
}

export async function runSync({ force = false } = {}) {
  if (syncState.running && !force) return syncState;

  syncState = {
    ...syncState,
    running: true,
    lastAttemptAt: new Date().toISOString(),
    lastError: null,
  };

  try {
    const previousSnapshot = await readSnapshot();
    const finance = await pullQuickBooksFinance({
      sourceFile: config.quickBooks.sourceFile,
      sourceUrl: config.quickBooks.sourceUrl,
      fallbackFinance: previousSnapshot.finance,
    });

    if (!config.jobTread.grantKey) {
      syncState = {
        ...syncState,
        running: false,
        mode: "snapshot",
        lastSuccessAt: previousSnapshot.meta.generatedAt || null,
      };
      return syncState;
    }

    const { companyName, projects } = await pullJobTreadPortfolio({
      endpoint: config.jobTread.endpoint,
      grantKey: config.jobTread.grantKey,
    });

    const nextSnapshot = buildSnapshot({
      previousSnapshot,
      companyName,
      projects,
      finance,
      sourceMode: "live",
    });

    await writeSnapshot(nextSnapshot);

    syncState = {
      ...syncState,
      running: false,
      mode: "live",
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
    };

    return syncState;
  } catch (error) {
    syncState = {
      ...syncState,
      running: false,
      lastError: error instanceof Error ? error.message : String(error),
    };
    return syncState;
  }
}

export function getSyncState() {
  return syncState;
}
