import { getProjectCatalogue, getMetricHistory, isMockMode } from "./dataService.js";
import { getStore } from "../mocks/store.js";
import { CORE_METRICS } from "../utils/metrics.js";

async function allProjects() {
  const projects = [];
  let page = 1;
  do {
    const result = await getProjectCatalogue({ status: ["APPROVED", "UNREVIEWED", "REJECTED"], page, page_size: 50 });
    projects.push(...result.projects);
    if (page >= result.total_pages) break;
    page += 1;
  } while (true);
  return projects;
}

export async function getComparisonSnapshot() {
  if (isMockMode) {
    const { projects, submissions } = getStore();
    return { projects: [...projects], submissions: [...submissions] };
  }

  const projects = await allProjects();
  const histories = await Promise.all(projects.map(async (project) => {
    const responses = await Promise.all(CORE_METRICS.map((metric) => getMetricHistory(project.project_id, metric.names[0])));
    return responses.flatMap((response, index) => (response.points || [])
      .filter((point) => point.status === "APPROVED")
      .map((point) => ({ project_id: project.project_id, ...point, metric_name: CORE_METRICS[index].names[0] })));
  }));
  const bySubmission = new Map();
  for (const point of histories.flat()) {
    const key = `${point.project_id}:${point.submission_id}`;
    if (!bySubmission.has(key)) bySubmission.set(key, {
      project_id: point.project_id, submission_id: point.submission_id, reporting_period: point.reporting_period,
      status: "APPROVED", submitted_at: null, metrics: [],
    });
    bySubmission.get(key).metrics.push({ metric_name: point.metric_name, value: point.value, unit: point.unit });
  }
  return { projects, submissions: [...bySubmission.values()] };
}
