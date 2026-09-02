const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function parseProjectResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error?.message || payload?.message || payload?.detail || "Unable to load project data.";
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code || payload?.error;
    throw error;
  }

  return payload;
}

function buildProjectQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        query.set(key, value.join(","));
      }
      continue;
    }
    query.set(key, String(value));
  }
  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

export async function getProjectCatalogue(params = {}) {
  const response = await fetch(`${API_BASE_URL}/projects${buildProjectQuery(params)}`, { credentials: "include" });
  return parseProjectResponse(response);
}

export async function getProjects(params = {}) {
  const payload = await getProjectCatalogue(params);
  return payload.projects;
}

export async function getProjectDetail(projectId) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, { credentials: "include" });
  return parseProjectResponse(response);
}

export async function getMetricHistory(projectId, metricName, includeUnreviewed = false) {
  const params = new URLSearchParams();
  if (includeUnreviewed) {
    params.set("include_unreviewed", "true");
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/metrics/${encodeURIComponent(metricName)}/history${query}`,
    { credentials: "include" },
  );
  return parseProjectResponse(response);
}
