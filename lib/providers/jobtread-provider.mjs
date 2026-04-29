const ACTIVE_QUERY = {
  currentGrant: {
    organization: {
      id: {},
      name: {},
    },
  },
  organization: {
    $: { id: "$ORGANIZATION_ID" },
    jobs: {
      $: {
        where: ["closedOn", null],
        size: 100,
        sortBy: [{ field: "createdAt", order: "desc" }],
      },
      nodes: {
        id: {},
        name: {},
        createdAt: {},
        actualCost: {},
        projectedCost: {},
        location: { address: {}, city: {}, state: {} },
        customFieldValues: {
          $: {
            where: [
              ["customField", "name"],
              "in",
              [
                "Active Job",
                "Actual Completion Date",
                "Actual Rehab Start Date",
                "ARV",
                "Estimated Profit",
                "Funding Project",
                "Inspection Date",
                "Loan Amount",
                "Overall Job Quality",
                "Property ID",
                "Purchase Date",
                "Purchase Price",
                "QuickBooks Class",
                "Rehab Budget",
                "REHAB OPS",
                "Schedule Status",
                "Target Completion Date",
                "Target Start Date",
              ],
            ],
            size: 30,
            sortBy: [{ field: "createdAt", order: "asc" }],
          },
          nodes: {
            customField: { name: {}, type: {} },
            value: {},
            dateValue: {},
            numberValue: {},
            booleanValue: {},
          },
        },
      },
    },
  },
};

const DETAIL_QUERY_TEMPLATE = {
  "$ALIAS": {
    _: "job",
    $: { id: "$JOB_ID" },
    id: {},
    name: {},
    dailyLogs: {
      $: {
        size: 3,
        sortBy: [{ field: "date", order: "desc" }],
      },
      count: {},
      nodes: {
        date: {},
        notes: {},
        customFieldValues: {
          $: {
            where: [
              ["customField", "name"],
              "in",
              ["Anticipated Delays", "Inspections Passed/Failed", "Trades Onsite", "Work Performed"],
            ],
            size: 10,
          },
          nodes: {
            customField: { name: {} },
            value: {},
            booleanValue: {},
          },
        },
      },
    },
    comments: {
      $: {
        size: 3,
        sortBy: [{ field: "createdAt", order: "desc" }],
      },
      count: {},
      nodes: {
        createdAt: {},
        message: {},
        targetType: {},
      },
    },
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function replaceTokens(value, replacements) {
  if (typeof value === "string") return replacements[value] ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceTokens(item, replacements));
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, inner] of Object.entries(value)) {
      output[replaceTokens(key, replacements)] = replaceTokens(inner, replacements);
    }
    return output;
  }
  return value;
}

async function callJobTread({ endpoint, grantKey, query }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {
        $: { grantKey },
        ...query,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`JobTread request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(`JobTread error: ${JSON.stringify(payload.error)}`);
  }
  return payload;
}

function mapCustomFields(nodes = []) {
  const map = {};
  for (const node of nodes) {
    map[node.customField.name] = {
      type: node.customField.type,
      value: node.value,
      dateValue: node.dateValue,
      numberValue: node.numberValue,
      booleanValue: node.booleanValue,
    };
  }
  return map;
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[$,]/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function daysRemaining(dateString) {
  if (!dateString) return null;
  const target = new Date(`${dateString}T00:00:00Z`);
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.round((target - utcToday) / 86400000);
}

function pct(a, b) {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

function summarizeQuality(detail) {
  const dailyLogs = detail?.dailyLogs?.nodes ?? [];
  const comments = detail?.comments?.nodes ?? [];
  if (dailyLogs.length) {
    const recent = dailyLogs[0];
    const cf = mapCustomFields(recent.customFieldValues?.nodes ?? []);
    const delay = cf["Anticipated Delays"]?.booleanValue;
    const work = cf["Work Performed"]?.value || recent.notes || "Recent field activity logged.";
    return {
      qualityStatus: delay ? "Concern" : "Observed",
      qualityEvidence: work,
      dailyLogsCount: detail.dailyLogs.count ?? dailyLogs.length,
      commentsCount: detail.comments.count ?? comments.length,
    };
  }
  if (comments.length) {
    return {
      qualityStatus: "Limited evidence",
      qualityEvidence: comments[0].message,
      dailyLogsCount: 0,
      commentsCount: detail.comments.count ?? comments.length,
    };
  }
  return {
    qualityStatus: "Limited data",
    qualityEvidence: "No recent daily logs or comments pulled from JobTread.",
    dailyLogsCount: 0,
    commentsCount: 0,
  };
}

function classifyTimeline(project) {
  if (!project.activeJob) return "Open Not Active";
  if (project.scheduleStatusField === "Behind") return "At Risk";
  if (project.daysRemaining != null && project.daysRemaining < 0) return "At Risk";
  if (project.daysRemaining != null && project.daysRemaining <= 7) return "At Risk";
  if (project.scheduleStatusField === "At Risk") return "At Risk";
  if (!project.targetCompletionDate && !project.scheduleStatusField) return "Watch";
  if (!project.actualCost && project.rehabBudget) return "Watch";
  return project.scheduleStatusField || "On Track";
}

export async function pullJobTreadPortfolio({ endpoint, grantKey }) {
  if (!grantKey) {
    throw new Error("JOBTREAD_GRANT_KEY is missing");
  }

  const orgResponse = await callJobTread({
    endpoint,
    grantKey,
    query: { currentGrant: ACTIVE_QUERY.currentGrant },
  });

  if (!orgResponse?.currentGrant?.organization?.id) {
    const summary = JSON.stringify(orgResponse).slice(0, 600);
    throw new Error(
      `JobTread did not return an organization for this grant key. ` +
      `Verify the key is a Production Pave grant tied to an organization. Response: ${summary}`,
    );
  }

  const organizationId = orgResponse.currentGrant.organization.id;
  const companyName = orgResponse.currentGrant.organization.name;

  const query = replaceTokens(clone(ACTIVE_QUERY), { "$ORGANIZATION_ID": organizationId });
  const activeResponse = await callJobTread({ endpoint, grantKey, query });
  const jobs = activeResponse.organization.jobs.nodes ?? [];

  const detailTargets = jobs.filter((job) => {
    const fields = mapCustomFields(job.customFieldValues?.nodes ?? []);
    return fields["Active Job"]?.booleanValue === true;
  });

  // Fetch each active job's detail in its own request. Bundling them all
  // into a single query was hitting JobTread's request-size limit (HTTP 413)
  // once the active job count grew. One-at-a-time keeps each request small,
  // and a per-job try/catch prevents a single bad job from killing the sync.
  const detailResponse = {};
  for (const job of detailTargets) {
    try {
      const singleQuery = replaceTokens(clone(DETAIL_QUERY_TEMPLATE), {
        "$ALIAS": `job_${job.id}`,
        "$JOB_ID": job.id,
      });
      const response = await callJobTread({ endpoint, grantKey, query: singleQuery });
      Object.assign(detailResponse, response);
    } catch (err) {
      console.error(`JobTread detail fetch failed for job ${job.id}: ${err.message}`);
    }
  }

  const normalizedProjects = jobs.map((job) => {
    const fields = mapCustomFields(job.customFieldValues?.nodes ?? []);
    const detail = detailResponse[`job_${job.id}`];
    const quality = summarizeQuality(detail);

    const purchasePrice = numberOrNull(fields["Purchase Price"]?.value);
    const rehabBudget = numberOrNull(fields["Rehab Budget"]?.numberValue ?? fields["Rehab Budget"]?.value);
    const projectedCost = job.projectedCost ?? null;
    const actualCost = job.actualCost ?? null;

    const project = {
      id: job.id,
      property: job.name,
      city: job.location?.city || "",
      address: job.location?.address || "",
      state: job.location?.state || "",
      createdAt: job.createdAt?.slice(0, 10) || "",
      activeJob: fields["Active Job"]?.booleanValue === true,
      rehabOps: fields["REHAB OPS"]?.value || "",
      scheduleStatusField: fields["Schedule Status"]?.value || "",
      purchaseDate: fields["Purchase Date"]?.dateValue || "",
      targetStartDate: fields["Target Start Date"]?.dateValue || "",
      actualRehabStartDate: fields["Actual Rehab Start Date"]?.dateValue || "",
      targetCompletionDate: fields["Target Completion Date"]?.dateValue || "",
      actualCompletionDate: fields["Actual Completion Date"]?.dateValue || "",
      inspectionDate: fields["Inspection Date"]?.dateValue || "",
      purchasePrice,
      rehabBudget,
      projectedCost,
      actualCost,
      actualVsRehabBudget: pct(actualCost, rehabBudget),
      actualVsProjected: pct(actualCost, projectedCost),
      arv: numberOrNull(fields["ARV"]?.numberValue ?? fields["ARV"]?.value),
      estimatedProfit: numberOrNull(fields["Estimated Profit"]?.numberValue ?? fields["Estimated Profit"]?.value),
      qbClass: fields["QuickBooks Class"]?.value || "",
      fundingProject: fields["Funding Project"]?.value || "",
      loanAmount: numberOrNull(fields["Loan Amount"]?.numberValue ?? fields["Loan Amount"]?.value),
      daysRemaining: daysRemaining(fields["Target Completion Date"]?.dateValue),
      ...quality,
    };

    project.timelineBucket = classifyTimeline(project);
    return project;
  });

  return {
    companyName,
    projects: normalizedProjects,
  };
}
