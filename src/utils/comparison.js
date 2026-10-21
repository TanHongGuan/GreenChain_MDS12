import { CORE_METRICS, metricDefinition, normalizedPoint } from "./metrics.js";

export { CORE_METRICS };

export function organisations(projects) {
  return [...new Set(projects.map((project) => project.organisation).filter(Boolean))].sort();
}

export function buildingsByOrganisation(projects, organisation) {
  return projects.filter((project) => project.organisation === organisation);
}

export function reportingPeriods(submissions) {
  return [...new Set(submissions.map((item) => item.reporting_period).filter(Boolean))].sort();
}

export function previousQuarter(period) {
  const match = /^(\d{4})-Q([1-4])$/.exec(period || "");
  if (!match) return null;
  const year = Number(match[1]), quarter = Number(match[2]);
  return quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`;
}

// The latest submission per building and quarter, among the review states the
// viewer asked for. With unreviewed included, a later unreviewed correction can
// outrank an approved one for the same quarter - which is what "show me
// everything" means, and why each row says which state it is showing.
export function latestRecords(submissions, statuses = ["APPROVED"]) {
  const latest = new Map();
  for (const item of submissions) {
    if (!statuses.includes(item.status)) continue;
    const key = `${item.project_id}:${item.reporting_period}`;
    const prior = latest.get(key);
    if (!prior || String(item.submitted_at || "").localeCompare(String(prior.submitted_at || "")) > 0 ||
      (item.submitted_at === prior.submitted_at && Number(item.submission_id) > Number(prior.submission_id))) latest.set(key, item);
  }
  return latest;
}

export function metricValue(record, metricKey, statuses = ["APPROVED"]) {
  if (!record) return null;
  const definition = CORE_METRICS.find((item) => item.key === metricKey);
  if (!definition) return null;
  const candidate = (record.metrics || []).find((item) => metricDefinition(item.metric_name)?.key === metricKey);
  return candidate
    ? normalizedPoint({ ...candidate, status: record.status }, definition, statuses)?.value ?? null
    : null;
}

export function comparisonRows(projects, submissions, projectIds, period, statuses = ["APPROVED"]) {
  const records = latestRecords(submissions, statuses);
  return projectIds.map((id) => {
    const project = projects.find((item) => item.project_id === Number(id));
    if (!project) return null;
    const record = records.get(`${id}:${period}`);
    return {
      project, period, submissionId: record?.submission_id ?? null,
      status: record?.status ?? null,
      values: Object.fromEntries(CORE_METRICS.map((metric) => [metric.key, metricValue(record, metric.key, statuses)])),
    };
  }).filter(Boolean);
}

export function organisationSummary(projects, submissions, organisation, period, metricKey,
                                    statuses = ["APPROVED"]) {
  const members = buildingsByOrganisation(projects, organisation);
  const rows = comparisonRows(projects, submissions, members.map((item) => item.project_id), period, statuses);
  const contributors = rows.filter((row) => row.values[metricKey] !== null);
  const total = contributors.reduce((sum, row) => sum + row.values[metricKey], 0);
  const prior = previousQuarter(period);
  const priorRows = prior ? comparisonRows(projects, submissions, members.map((item) => item.project_id), prior, statuses) : [];
  const priorById = new Map(priorRows.map((row) => [row.project.project_id, row.values[metricKey]]));
  const matched = contributors.filter((row) => priorById.get(row.project.project_id) !== null && priorById.has(row.project.project_id));
  const currentMatched = matched.reduce((sum, row) => sum + row.values[metricKey], 0);
  const previousMatched = matched.reduce((sum, row) => sum + priorById.get(row.project.project_id), 0);
  return {
    period, previousPeriod: prior, buildingCount: members.length, contributorCount: contributors.length,
    total: contributors.length ? total : null,
    contributors: contributors.map((row) => ({ ...row, share: total > 0 ? row.values[metricKey] / total * 100 : null })),
    matchedCount: matched.length,
    matchedChangePercent: matched.length && previousMatched !== 0 ? (currentMatched - previousMatched) / previousMatched * 100 : null,
  };
}
