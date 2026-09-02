const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function parseReviewResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error?.message || payload?.message || payload?.detail || "Unable to complete review request.";
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code || payload?.error;
    throw error;
  }

  return payload;
}

export async function getPendingReviews() {
  const response = await fetch(`${API_BASE_URL}/reviews/submissions/pending`, {
    credentials: "include",
  });
  const payload = await parseReviewResponse(response);
  return payload.submissions;
}

export async function getReviewDetail(submissionId) {
  const response = await fetch(`${API_BASE_URL}/reviews/submissions/${submissionId}`, {
    credentials: "include",
  });
  const payload = await parseReviewResponse(response);
  return payload.submission;
}

export async function decideSubmission(submissionId, decision, reason) {
  const response = await fetch(`${API_BASE_URL}/reviews/submissions/${submissionId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ decision, reason }),
  });
  return parseReviewResponse(response);
}

export function evidenceUrl(path) {
  return path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
}
