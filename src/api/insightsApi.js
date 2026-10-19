const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function parseInsightsResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error?.message || payload?.message || payload?.detail || "Unable to load investor insights.";
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code || payload?.error;
    throw error;
  }

  return payload;
}

export async function getProjectBenchmarks(projectId) {
  const response = await fetch(`${API_BASE_URL}/insights/projects/${projectId}/benchmarks`, {
    credentials: "include",
  });
  return parseInsightsResponse(response);
}

export async function getProjectConsistency(projectId) {
  const response = await fetch(`${API_BASE_URL}/insights/projects/${projectId}/consistency`, {
    credentials: "include",
  });
  return parseInsightsResponse(response);
}
