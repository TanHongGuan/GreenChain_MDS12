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
    // A refusal can name several row-level faults at once; keep them as a list so
    // the page can show each one against the row it came from.
    error.issues = Array.isArray(payload?.issues) ? payload.issues : [];
    error.status = response.status;
    error.code = payload?.error?.code || payload?.error;
    throw error;
  }

  return payload;
}

export async function createSubmission({ projectName, organisation, reportingPeriod, file, previousSubmissionId = null, projectId = null, confirmedMapping = null }) {
  const formData = new FormData();
  formData.append("project_name", projectName);
  formData.append("organisation", organisation);
  formData.append("reporting_period", reportingPeriod);
  if (projectId) formData.append("project_id", String(projectId));
  if (confirmedMapping) formData.append("confirmed_mapping", JSON.stringify(confirmedMapping));
  if (previousSubmissionId) {
    formData.append("previous_submission_id", String(previousSubmissionId));
  }
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/submissions`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  return parseSubmissionResponse(response);
}

export async function previewSubmissionMapping(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/submissions/mapping-preview`, {
    method: "POST", credentials: "include", body: formData,
  });
  return parseSubmissionResponse(response);
}

export async function getProjectSubmissions(projectId) {
  const response = await fetch(`${API_BASE_URL}/submissions/projects/${projectId}`, { credentials: "include" });
  const payload = await parseSubmissionResponse(response);
  return payload.submissions;
}

export async function getSubmissionDetail(submissionId) {
  const response = await fetch(`${API_BASE_URL}/submissions/${submissionId}`, { credentials: "include" });
  const payload = await parseSubmissionResponse(response);
  return payload.submission;
}

export function getSubmissionEvidenceUrl(submissionId, artifactType) {
  return `${API_BASE_URL}/submissions/${submissionId}/evidence/${encodeURIComponent(artifactType)}`;
}
