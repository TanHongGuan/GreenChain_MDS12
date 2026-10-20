// Single entry point the pages use for backend data. Every call goes to the real FastAPI
// backend; there is no browser-side mock data.
import * as realAuth from "../api/authApi.js";
import * as realProjects from "../api/projectsApi.js";
import * as realDiscovery from "../api/discoveryApi.js";
import * as realSubmissions from "../api/submissionsApi.js";
import * as realReviews from "../api/reviewsApi.js";
import * as realInsights from "../api/insightsApi.js";

export const login = realAuth.login;
export const loginAsAccount = realAuth.loginAsAccount;
export const getLoginAccounts = realAuth.getLoginAccounts;
export const getCurrentUser = realAuth.getCurrentUser;
export const logout = realAuth.logout;

export const getHomeDiscovery = realDiscovery.getHomeDiscovery;
export const getProjectCatalogue = realProjects.getProjectCatalogue;
export const getProjectDetail = realProjects.getProjectDetail;
export const getOwnedBuildings = realProjects.getOwnedBuildings;
export const createOwnedBuilding = realProjects.createOwnedBuilding;
export const updateOwnedBuilding = realProjects.updateOwnedBuilding;
export const getApprovedMonthlyHistory = realProjects.getApprovedMonthlyHistory;
export const getMetricHistory = realProjects.getMetricHistory;
export const getProjectSubmissions = realSubmissions.getProjectSubmissions;
export const getSubmissionDetail = realSubmissions.getSubmissionDetail;
export const createSubmission = realSubmissions.createSubmission;
export const previewSubmissionMapping = realSubmissions.previewSubmissionMapping;
export const getPendingReviews = realReviews.getPendingReviews;
export const getReviewDetail = realReviews.getReviewDetail;
export const decideSubmission = realReviews.decideSubmission;
export const getHighlightedProjects = realDiscovery.getHighlightedProjects;
export const addHighlightedProject = realDiscovery.addHighlightedProject;
export const removeHighlightedProject = realDiscovery.removeHighlightedProject;
export const getProjectBenchmarks = realInsights.getProjectBenchmarks;
export const getProjectConsistency = realInsights.getProjectConsistency;
export const getSubmissionEvidenceUrl = realSubmissions.getSubmissionEvidenceUrl;
export const evidenceUrl = realReviews.evidenceUrl;
