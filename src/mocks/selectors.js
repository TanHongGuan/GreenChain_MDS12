export function ownedBuildings(store, user) {
  if (user?.role !== "UPLOADER" || !user.organisation_id) return [];
  return store.projects.filter((project) => project.organisation_id === user.organisation_id);
}

export function buildingSubmissions(store, projectId) {
  return store.submissions.filter((submission) => submission.project_id === Number(projectId));
}

export function reviewedSubmissions(store, projectId) {
  return buildingSubmissions(store, projectId).filter((submission) => submission.status !== "UNREVIEWED");
}

export function pendingSubmissions(store, projectId) {
  return buildingSubmissions(store, projectId).filter((submission) => submission.status === "UNREVIEWED");
}

export function acceptedAssignments(store, consultantId) {
  return store.assignments.filter((assignment) => assignment.consultant_id === Number(consultantId) && assignment.status === "ACCEPTED");
}

export function assignedSubmissions(store, user) {
  if (user?.role !== "AUDITOR") return [];
  const projectIds = new Set(acceptedAssignments(store, user.id).map((assignment) => assignment.project_id));
  return store.submissions.filter((submission) => projectIds.has(submission.project_id));
}
