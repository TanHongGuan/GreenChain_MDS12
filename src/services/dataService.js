import * as realAuth from "../api/authApi.js";
import * as realProjects from "../api/projectsApi.js";
import * as realDiscovery from "../api/discoveryApi.js";
import * as realSubmissions from "../api/submissionsApi.js";
import * as realReviews from "../api/reviewsApi.js";
import * as realInsights from "../api/insightsApi.js";
import * as mock from "../mocks/mockService.js";
import { clearDemoUser, currentDemoUser, findDemoUserByEmail, setDemoUser } from "../mocks/identity.js";

export const DATA_MODE = import.meta.env.VITE_DATA_MODE === "mock" ? "mock" : "real";
export const isMockMode = DATA_MODE === "mock";
const choose = (fake, real) => (...args) => (isMockMode ? fake(...args) : real(...args));
export async function login(email, password) {
  if (!isMockMode) return realAuth.login(email, password);
  const user = findDemoUserByEmail(email);
  if (!user || !password) throw Object.assign(new Error("Use a listed demo identity and enter a demo password."), { status: 401 });
  setDemoUser(user);
  return { ...user };
}
export async function getCurrentUser() {
  if (!isMockMode) return realAuth.getCurrentUser();
  const user = currentDemoUser();
  if (!user) throw Object.assign(new Error("Demo sign-in required."), { status: 401 });
  return { ...user };
}
export async function logout() { if (isMockMode) clearDemoUser(); else await realAuth.logout(); }

export async function getOwnedMockBuildings() {
  if (!isMockMode) throw Object.assign(new Error("Company buildings are available in mock mode only."), { status: 501 });
  return mock.getOwnedBuildings();
}
export async function getOwnedMockBuilding(id) {
  if (!isMockMode) throw Object.assign(new Error("Company buildings are available in mock mode only."), { status: 501 });
  return mock.getOwnedBuilding(id);
}
export async function createMockBuilding(input) {
  if (!isMockMode) throw Object.assign(new Error("Company buildings are available in mock mode only."), { status: 501 });
  return mock.createBuilding(input);
}
export async function updateMockBuilding(id, input) {
  if (!isMockMode) throw Object.assign(new Error("Company buildings are available in mock mode only."), { status: 501 });
  return mock.updateBuilding(id, input);
}
export async function getAssignedMockSubmissions() {
  if (!isMockMode) throw Object.assign(new Error("Demo auditor assignments are available in mock mode only."), { status: 501 });
  return mock.getAssignedSubmissions();
}
export function resetDemoData(confirmed = false) {
  if (!isMockMode) throw Object.assign(new Error("Demo reset is available in mock mode only."), { status: 501 });
  if (!confirmed) throw Object.assign(new Error("Confirm demo reset first."), { status: 400 });
  mock.resetDemoData();
}

export const getHomeDiscovery = choose(mock.getHomeDiscovery, realDiscovery.getHomeDiscovery);
export const getProjectCatalogue = choose(mock.getProjectCatalogue, realProjects.getProjectCatalogue);
export const getProjectDetail = choose(mock.getProjectDetail, realProjects.getProjectDetail);
export const getMetricHistory = choose(mock.getMetricHistory, realProjects.getMetricHistory);
export const getProjectSubmissions = choose(mock.getProjectSubmissions, realSubmissions.getProjectSubmissions);
export const getSubmissionDetail = choose(mock.getSubmissionDetail, realSubmissions.getSubmissionDetail);
export const createSubmission = choose(mock.createSubmission, realSubmissions.createSubmission);
export const getPendingReviews = choose(mock.getPendingReviews, realReviews.getPendingReviews);
export const getReviewHistory = choose(mock.getReviewHistory, async () => null);
export const getReviewDetail = choose(mock.getReviewDetail, realReviews.getReviewDetail);
export const decideSubmission = choose(mock.decideSubmission, realReviews.decideSubmission);
export const getHighlightedProjects = choose(mock.getHighlightedProjects, realDiscovery.getHighlightedProjects);
export const addHighlightedProject = choose(mock.addHighlightedProject, realDiscovery.addHighlightedProject);
export const removeHighlightedProject = choose(mock.removeHighlightedProject, realDiscovery.removeHighlightedProject);
export const getProjectBenchmarks = choose(mock.getProjectBenchmarks, realInsights.getProjectBenchmarks);
export const getProjectConsistency = choose(mock.getProjectConsistency, realInsights.getProjectConsistency);
export const getSubmissionEvidenceUrl = choose(mock.getSubmissionEvidenceUrl, realSubmissions.getSubmissionEvidenceUrl);
export const evidenceUrl = (path) => isMockMode ? null : realReviews.evidenceUrl(path);
