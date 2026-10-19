import { getStore, saveStore } from "./store.js";
import { resetMockStore } from "./store.js";
import { currentDemoUser } from "./identity.js";
import { assignedSubmissions, buildingSubmissions, ownedBuildings } from "./selectors.js";

const fail = (message, status = 404) => Object.assign(new Error(message), { status });
const state = () => getStore();
const projectById = (id) => state().projects.find((item) => item.project_id === Number(id));
const submissionById = (id) => state().submissions.find((item) => item.submission_id === Number(id));
const sortedSubmissions = (id) => state().submissions.filter((item) => item.project_id === Number(id)).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
const approved = (id) => sortedSubmissions(id).filter((item) => item.status === "APPROVED");
const userId = () => Number(sessionStorage.getItem("greenchain-demo-user") || 1);
const snapshot = (value) => JSON.parse(JSON.stringify(value));
const requireDemoRole = (role) => {
  const user = currentDemoUser();
  if (!user) throw fail("Demo sign-in required.", 401);
  if (user.role !== role) throw fail("This demo identity cannot access that operation.", 403);
  return user;
};

export async function getOwnedBuildings() {
  const store = state();
  return snapshot(ownedBuildings(store, requireDemoRole("UPLOADER")).map((project) => ({
    ...project,
    submission_count: buildingSubmissions(store, project.project_id).length,
    latest_submission: sortedSubmissions(project.project_id)[0] || null,
  })));
}

export async function getOwnedBuilding(id) {
  const building = ownedBuildings(state(), requireDemoRole("UPLOADER")).find((project) => project.project_id === Number(id));
  if (!building) throw fail("Building was not found for this demo company.", 404);
  return snapshot(building);
}


export async function getAssignedSubmissions() {
  return snapshot(assignedSubmissions(state(), requireDemoRole("AUDITOR")));
}

function buildingInput(input, store, organisationId, excludeId = null) {
  const project_name = String(input?.project_name || "").trim();
  const location = String(input?.location || "").trim();
  const description = String(input?.description || "").trim();
  if (!project_name) throw fail("Building name is required.", 400);
  if (project_name.length > 255 || location.length > 255 || description.length > 1000) throw fail("Building details are too long.", 400);
  const duplicate = store.projects.some((project) => project.organisation_id === organisationId && project.project_id !== excludeId && project.project_name.trim().toLowerCase() === project_name.toLowerCase());
  if (duplicate) throw fail("A building with this name already exists in your organisation.", 409);
  return { project_name, location: location || null, description: description || null };
}

export async function createBuilding(input) {
  const user = requireDemoRole("UPLOADER");
  const store = state();
  const organisation = store.organisations.find((item) => item.id === user.organisation_id);
  if (!organisation) throw fail("Demo organisation was not found.", 404);
  const fields = buildingInput(input, store, organisation.id);
  const now = new Date().toISOString();
  const building = { project_id: store.nextProjectId++, organisation_id: organisation.id, organisation: organisation.name, ...fields, created_at: now, updated_at: now };
  store.projects.push(building);
  saveStore();
  return snapshot(building);
}

export async function updateBuilding(id, input) {
  const user = requireDemoRole("UPLOADER");
  const store = state();
  const building = store.projects.find((project) => project.project_id === Number(id) && project.organisation_id === user.organisation_id);
  if (!building) throw fail("Building was not found for this demo company.", 404);
  const fields = buildingInput(input, store, user.organisation_id, building.project_id);
  Object.assign(building, fields, { updated_at: new Date().toISOString() });
  saveStore();
  return snapshot(building);
}

export function resetDemoData() {
  if (!currentDemoUser()) throw fail("Demo sign-in required.", 401);
  resetMockStore();
}

function projectCard(project) {
  const latest = sortedSubmissions(project.project_id)[0];
  const trusted = approved(project.project_id)[0];
  const metric = trusted?.metrics.find((item) => item.metric_name === "Electricity");
  return {
    ...project, status: latest?.status || "UNREVIEWED", reporting_period: latest?.reporting_period || null,
    latest_reporting_period: latest?.reporting_period || null, submission_id: latest?.submission_id || null,
    submitted_at: latest?.submitted_at || null, updated_at: latest?.submitted_at || project.created_at,
    highlighted: (state().highlights[userId()] || []).includes(project.project_id),
    trusted_metric: metric ? { ...metric, reporting_period: trusted.reporting_period, submission_id: trusted.submission_id } : null,
  };
}

function withProject(submission) {
  const project = projectById(submission.project_id);
  const review = submission.status === "UNREVIEWED" ? null : {
    review_id: submission.submission_id, reviewer_id: 3, reviewer_name: "Demo Auditor", reviewer_email: "auditor@demo.greenchain.test",
    decision: submission.status, reason: submission.reason || null, reviewed_at: submission.reviewed_at || submission.submitted_at,
  };
  const evidence = Object.fromEntries(["original", "processed", "audit_report"].map((type) => [type, {
    artifact_type: type, available: false,
    filename: type === "original" ? submission.source_filename || `demo-${submission.submission_id}.csv` : `${type}-${submission.submission_id}.csv`, content_type: "text/csv", size_bytes: type === "original" ? submission.file_size || null : null,
    storage_backend: "DEMO_SESSION", sha256: submission.sha256 || null,
    integrity: { status: submission.sha256 ? "MATCH" : "UNAVAILABLE", matches: submission.sha256 ? true : null },
  }]));
  return {
    ...submission, project_name: project?.project_name, organisation: project?.organisation,
    submitted_by: { id: 2, name: "Demo Uploader", email: "uploader@demo.greenchain.test" }, review, evidence,
    previous_submission: null, corrected_by: [],
    metrics: submission.metrics.map((metric) => ({ ...metric, category: metric.category || null, submission_id: submission.submission_id, reporting_period: submission.reporting_period, status: submission.status })),
  };
}

export async function getHomeDiscovery() {
  const cards = state().projects.map(projectCard).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return { recently_updated: cards.slice(0, 4), featured: cards.filter((item) => item.trusted_metric).slice(0, 3), new_projects: [...cards].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3), featured_rule: "Approved data", summary: {
    total_projects: state().projects.length, total_organisations: new Set(state().projects.map((item) => item.organisation)).size,
    total_submissions: state().submissions.length,
    approved_submissions: state().submissions.filter((item) => item.status === "APPROVED").length,
    unreviewed_submissions: state().submissions.filter((item) => item.status === "UNREVIEWED").length,
  }, activity: state().submissions.slice().sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).slice(0, 5).map((item) => withProject(item)) };
}

export async function getProjectCatalogue(params = {}) {
  const all = state().projects.map(projectCard);
  const filterOptions = (key) => [...new Set(all.map((item) => item[key]).filter(Boolean))].sort().map((value) => ({ value, count: all.filter((item) => item[key] === value).length }));
  const filters = { organisations: filterOptions("organisation"), locations: filterOptions("location"), statuses: filterOptions("status"), reporting_periods: filterOptions("reporting_period") };
  const search = String(params.search || "").toLowerCase();
  let rows = all.filter((item) => (!search || `${item.project_name} ${item.organisation}`.toLowerCase().includes(search)) &&
    (!params.location || item.location === params.location) && (!params.organisation || item.organisation === params.organisation) &&
    (!params.reporting_period || item.reporting_period === params.reporting_period) &&
    (!params.status || params.status.includes(item.status)));
  const [key, direction] = String(params.sort || "updated_desc").split(/_(?=[^_]+$)/);
  const sortKey = { updated: "updated_at", created: "created_at", period: "reporting_period", organisation: "organisation", project_name: "project_name" }[key] || "updated_at";
  rows.sort((a, b) => String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")) * (direction === "asc" ? 1 : -1));
  const page = Math.max(1, Number(params.page) || 1), page_size = Math.max(1, Number(params.page_size) || 12);
  return { projects: rows.slice((page - 1) * page_size, page * page_size), page, page_size, total_items: rows.length, total_pages: Math.ceil(rows.length / page_size), filters };
}

export async function getProjectDetail(id) {
  const project = projectById(id);
  if (!project) throw fail("Project was not found.");
  const names = ["Electricity", "Water", "CO2e"];
  const metrics = names.map((name) => {
    const points = approved(id).filter((item) => item.metrics.some((metric) => metric.metric_name === name)).map((item) => {
      const metric = item.metrics.find((row) => row.metric_name === name);
      return { ...metric, submission_id: item.submission_id, reporting_period: item.reporting_period, status: "APPROVED" };
    });
    return { metric_name: name, latest: points[0] || null, previous: points[1] || null };
  });
  return { project, metrics };
}

export async function getMetricHistory(id, name, includeUnreviewed = false) {
  if (!projectById(id)) throw fail("Project was not found.");
  const points = sortedSubmissions(id).filter((item) => item.status === "APPROVED" || (includeUnreviewed && item.status === "UNREVIEWED"))
    .flatMap((item) => item.metrics.filter((metric) => metric.metric_name === name).map((metric) => ({ ...metric, category: metric.category || null, submission_id: item.submission_id, reporting_period: item.reporting_period, status: item.status })));
  return { metric_name: name, points: points.sort((a, b) => a.reporting_period.localeCompare(b.reporting_period)) };
}

export async function getProjectSubmissions(id) { if (!projectById(id)) throw fail("Project was not found."); return sortedSubmissions(id).map(withProject); }
export async function getSubmissionDetail(id) { const item = submissionById(id); if (!item) throw fail("Submission was not found."); return withProject(item); }
export function getSubmissionEvidenceUrl() { return null; }
export async function getPendingReviews() { requireDemoRole("AUDITOR"); return state().submissions.filter((item) => item.status === "UNREVIEWED").map(withProject); }
export async function getReviewHistory() { requireDemoRole("AUDITOR"); return state().submissions.filter((item) => item.status !== "UNREVIEWED").map(withProject).sort((a, b) => String(b.reviewed_at || "").localeCompare(String(a.reviewed_at || ""))); }
export async function getReviewDetail(id) {
  requireDemoRole("AUDITOR");
  const detail = await getSubmissionDetail(id);
  return { ...detail, original_sha256: detail.evidence.original.sha256, integrity: detail.evidence.original.integrity,
    evidence: { original: { label: detail.evidence.original.filename, url: null }, processed: { label: detail.evidence.processed.filename, url: null } },
    simulated_evidence: { original: detail.metrics.map((metric) => `${metric.metric_name},${metric.value},${metric.unit}`).join("\n"), processed: detail.metrics.map((metric) => `${metric.metric_name}: ${metric.value} ${metric.unit}`).join("\n") } };
}
export async function decideSubmission(id, decision, reason) {
  requireDemoRole("AUDITOR");
  const item = submissionById(id);
  if (!item) throw fail("Submission was not found.");
  if (item.status !== "UNREVIEWED") throw fail("Only unreviewed submissions can be decided.", 409);
  if (!["APPROVED", "REJECTED"].includes(decision)) throw fail("Invalid decision.", 400);
  if (decision === "REJECTED" && !reason?.trim()) throw fail("A rejection reason is required.", 400);
  item.status = decision; item.reason = reason?.trim() || null; item.reviewed_at = new Date().toISOString(); saveStore();
  return { submission_id: item.submission_id, status: decision, reason: item.reason, message: `Submission ${decision.toLowerCase()} successfully.` };
}

export async function createSubmission({ projectId = null, projectName, organisation, reportingPeriod, file, previewRows }) {
  const user = requireDemoRole("UPLOADER");
  const store = state();
  let project;
  if (projectId !== null && projectId !== undefined) {
    project = ownedBuildings(store, user).find((item) => item.project_id === Number(projectId));
    if (!project) throw fail("Select a building owned by your demo organisation.", 403);
  } else {
    project = store.projects.find((item) => item.project_name.toLowerCase() === projectName.toLowerCase() && item.organisation.toLowerCase() === organisation.toLowerCase());
    if (project && user?.role === "UPLOADER" && project.organisation_id !== user.organisation_id) {
      throw fail("This building belongs to another demo organisation.", 403);
    }
  }
  if (!project) {
    let organisationRecord = store.organisations.find((item) => item.name === organisation);
    if (!organisationRecord) {
      organisationRecord = { id: `legacy-${encodeURIComponent(organisation)}`, name: organisation };
      store.organisations.push(organisationRecord);
    }
    project = { project_id: store.nextProjectId++, project_name: projectName, organisation, organisation_id: organisationRecord.id, location: null, description: "Demo submission project", created_at: new Date().toISOString() };
    store.projects.push(project);
  }
  const item = { submission_id: store.nextSubmissionId++, project_id: project.project_id, reporting_period: reportingPeriod, status: "UNREVIEWED", submitted_at: new Date().toISOString(), metrics: (previewRows || []).map((row) => ({ metric_name: row.metric_name, value: Number(row.value), unit: row.unit, category: row.category || null })), file_size: file.size, source_filename: file.name };
  store.submissions.push(item); saveStore();
  return { submission_id: item.submission_id, status: item.status, message: "Demo submission created", project_id: project.project_id };
}

export async function getHighlightedProjects() { return { projects: state().projects.map(projectCard).filter((item) => item.highlighted) }; }
export async function addHighlightedProject(id) { if (!projectById(id)) throw fail("Project was not found."); const list = state().highlights[userId()] ||= []; if (!list.includes(Number(id))) list.push(Number(id)); saveStore(); return { project: projectCard(projectById(id)) }; }
export async function removeHighlightedProject(id) { const list = state().highlights[userId()] ||= []; const index = list.indexOf(Number(id)); if (index >= 0) list.splice(index, 1); saveStore(); return { project_id: Number(id), highlighted: false, removed: index >= 0 }; }
