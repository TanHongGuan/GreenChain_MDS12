const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function parseDiscoveryResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error?.message || payload?.message || payload?.detail || "Unable to load discovery data.";
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code || payload?.error;
    throw error;
  }

  return payload;
}

export async function getHomeDiscovery() {
  const response = await fetch(`${API_BASE_URL}/discovery/home`, { credentials: "include" });
  return parseDiscoveryResponse(response);
}

export async function getHighlightedProjects() {
  const response = await fetch(`${API_BASE_URL}/highlighted/projects`, { credentials: "include" });
  return parseDiscoveryResponse(response);
}

export async function addHighlightedProject(projectId) {
  const response = await fetch(`${API_BASE_URL}/highlighted/projects/${projectId}`, {
    method: "POST",
    credentials: "include",
  });
  return parseDiscoveryResponse(response);
}

export async function removeHighlightedProject(projectId) {
  const response = await fetch(`${API_BASE_URL}/highlighted/projects/${projectId}`, {
    method: "DELETE",
    credentials: "include",
  });
  return parseDiscoveryResponse(response);
}
