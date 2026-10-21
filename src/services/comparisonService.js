import { getProjectCatalogue, getMetricHistory } from "./dataService.js";
import { CORE_METRICS } from "../utils/metrics.js";

async function allProjects(statuses) {
  const projects = [];
  let page = 1;
  do {
    const result = await getProjectCatalogue({ page, page_size: 50, status: statuses });
    projects.push(...result.projects);
    if (page >= result.total_pages) break;
    page += 1;
  } while (true);
  return projects;
}

// `statuses` is which review states the viewer wants compared. The catalogue and
// the history endpoint are both asked for them, and each point keeps the state
// it actually has rather than being assumed approved.
export async function getComparisonSnapshot(statuses = ["APPROVED"]) {
  if (!statuses.length) return { projects: [], submissions: [] };
  const includeUnreviewed = statuses.includes("UNREVIEWED");
  const projects = await allProjects(statuses);
  const histories = await Promise.all(projects.map(async (project) => {
    const responses = await Promise.all(CORE_METRICS.map(
      (metric) => getMetricHistory(project.project_id, metric.names[0], includeUnreviewed)));
    return responses.flatMap((response, index) => (response.points || [])
      .filter((point) => statuses.includes(point.status))
      .map((point) => ({ project_id: project.project_id, ...point, metric_name: CORE_METRICS[index].names[0] })));
  }));
  const bySubmission = new Map();
  for (const point of histories.flat()) {
    const key = `${point.project_id}:${point.submission_id}`;
    if (!bySubmission.has(key)) bySubmission.set(key, {
      project_id: point.project_id, submission_id: point.submission_id, reporting_period: point.reporting_period,
      status: point.status, submitted_at: point.submitted_at ?? null, metrics: [],
    });
    bySubmission.get(key).metrics.push({ metric_name: point.metric_name, value: point.value, unit: point.unit });
  }
  return { projects, submissions: [...bySubmission.values()] };
}
