import * as realAuth from "../api/authApi.js";
import * as realProjects from "../api/projectsApi.js";
import * as realDiscovery from "../api/discoveryApi.js";
import * as realSubmissions from "../api/submissionsApi.js";
import * as realReviews from "../api/reviewsApi.js";
import * as mock from "../mocks/mockService.js";
import { mockUser } from "../mocks/store.js";

export const DATA_MODE = import.meta.env.VITE_DATA_MODE === "mock" ? "mock" : "real";
export const isMockMode = DATA_MODE === "mock";
const choose = (fake, real) => (...args) => (isMockMode ? fake(...args) : real(...args));
const demoUserKey = "greenchain-demo-user";

export async function login(email, password) {
  if (!isMockMode) return realAuth.login(email, password);
  if (!password) throw Object.assign(new Error("Enter a demo password."), { status: 401 });
  const role = email.toLowerCase().startsWith("auditor") ? "AUDITOR" : email.toLowerCase().startsWith("uploader") ? "UPLOADER" : "VIEWER";
  const user = mockUser(role); sessionStorage.setItem(demoUserKey, String(user.id)); return user;
}
export async function getCurrentUser() {
  if (!isMockMode) return realAuth.getCurrentUser();
  const id = Number(sessionStorage.getItem(demoUserKey));
  if (!id) throw Object.assign(new Error("Demo sign-in required."), { status: 401 });
  return mockUser(({ 1: "VIEWER", 2: "UPLOADER", 3: "AUDITOR" })[id] || "VIEWER");
}
export async function logout() { if (isMockMode) sessionStorage.removeItem(demoUserKey); else await realAuth.logout(); }

export const getHomeDiscovery = choose(mock.getHomeDiscovery, realDiscovery.getHomeDiscovery);
export const getProjectCatalogue = choose(mock.getProjectCatalogue, realProjects.getProjectCatalogue);
export const getProjectDetail = choose(mock.getProjectDetail, realProjects.getProjectDetail);
export const getMetricHistory = choose(mock.getMetricHistory, realProjects.getMetricHistory);
export const getProjectSubmissions = choose(mock.getProjectSubmissions, realSubmissions.getProjectSubmissions);
export const getSubmissionDetail = choose(mock.getSubmissionDetail, realSubmissions.getSubmissionDetail);
export const createSubmission = choose(mock.createSubmission, realSubmissions.createSubmission);
export const getPendingReviews = choose(mock.getPendingReviews, realReviews.getPendingReviews);
export const getReviewDetail = choose(mock.getReviewDetail, realReviews.getReviewDetail);
export const decideSubmission = choose(mock.decideSubmission, realReviews.decideSubmission);
export const getHighlightedProjects = choose(mock.getHighlightedProjects, realDiscovery.getHighlightedProjects);
export const addHighlightedProject = choose(mock.addHighlightedProject, realDiscovery.addHighlightedProject);
export const removeHighlightedProject = choose(mock.removeHighlightedProject, realDiscovery.removeHighlightedProject);
export const getSubmissionEvidenceUrl = choose(mock.getSubmissionEvidenceUrl, realSubmissions.getSubmissionEvidenceUrl);
export const evidenceUrl = (path) => isMockMode ? null : realReviews.evidenceUrl(path);
