const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function parseSubmissionResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.message || payload?.error?.message || payload?.detail || "Unable to upload submission.";
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code || payload?.error;
    throw error;
  }

  return payload;
}

export async function createSubmission({ projectName, organisation, reportingPeriod, file }) {
  const formData = new FormData();
  formData.append("project_name", projectName);
  formData.append("organisation", organisation);
  formData.append("reporting_period", reportingPeriod);
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/submissions`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  return parseSubmissionResponse(response);
}
