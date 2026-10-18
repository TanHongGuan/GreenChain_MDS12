import { DEMO_ORGANISATIONS, DEMO_USERS } from "./identity.js";

export const MOCK_STORAGE_KEY = "greenchain-demo-v1";
export const MOCK_SCHEMA_VERSION = 4;
const comparisonProjects = [
  { project_id: 105, project_name: "Bukit Civic Annex", organisation: "Demo Civic Trust", location: "Kuala Lumpur" },
  { project_id: 106, project_name: "Taman Skills Hub", organisation: "Demo Civic Trust", location: "Selangor" },
  { project_id: 107, project_name: "Bayview Innovation Centre", organisation: "Demo Future Works", location: "Johor" },
  { project_id: 108, project_name: "Meranti Operations House", organisation: "Demo Future Works", location: "Selangor" },
].map((project) => ({ ...project, description: "Fictional building for comparison demonstrations.", created_at: "2025-07-01T09:00:00Z" }));

const comparisonValues = {
  105: [[93000, 3400, 46], [97000, 3520, 48], [91000, 3260, 45], [90000, 3200, 44]],
  106: [[61000, 2100, 30], [63000, 2200, 31], [65000, 2250, 32], [64000, 2180, 31]],
  107: [[72000, 2800, 36], [70000, 2710, 35], [68000, 2600, 34], [67000, 2570, 33]],
  108: [[81000, 3100, 40], [79000, 3000, 39], [77000, 2950, 38], [76000, 2900, 37]],
};
const comparisonPeriods = ["2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2"];
const comparisonSubmissions = Object.entries(comparisonValues).flatMap(([projectId, values], buildingIndex) =>
  values.flatMap(([electricity, water, co2], quarterIndex) => {
    if (projectId === "106" && quarterIndex === 1) return [];
    const status = projectId === "108" && quarterIndex === 3 ? "UNREVIEWED" : "APPROVED";
    const metrics = [
      { metric_name: "Electricity", value: electricity, unit: "kWh" },
      { metric_name: "Water", value: water, unit: "m3" },
      ...projectId === "105" && quarterIndex === 2 ? [] : [{ metric_name: "CO2e", value: co2, unit: "tCO2e" }],
    ];
    return [{ submission_id: 1100 + buildingIndex * 4 + quarterIndex, project_id: Number(projectId), reporting_period: comparisonPeriods[quarterIndex], status, submitted_at: `${2025 + Math.floor((quarterIndex + 3) / 4)}-${String(((quarterIndex + 3) % 4) * 3 + 1).padStart(2, "0")}-15T09:00:00Z`, metrics }];
  }),
);
const seed = {
  schemaVersion: MOCK_SCHEMA_VERSION,
  organisations: DEMO_ORGANISATIONS.map((organisation) => ({ ...organisation })),
  users: DEMO_USERS.map((user) => ({ ...user })),
  assignments: [
    { id: 1, project_id: 103, consultant_id: 3, status: "ACCEPTED" },
  ],
  projects: [
    { project_id: 101, project_name: "Riverview Learning Centre", organisation: "Demo Civic Trust", location: "Kuala Lumpur", description: "A fictional learning facility used to demonstrate quarterly resource reporting.", created_at: "2025-01-10T09:00:00Z" },
    { project_id: 102, project_name: "North Quay Offices", organisation: "Demo Civic Trust", location: "Penang", description: "Fictional office project with incomplete metric coverage.", created_at: "2025-06-03T09:00:00Z" },
    { project_id: 103, project_name: "Canopy Research Hall", organisation: "Demo Future Works", location: "Selangor", description: "Fictional research building awaiting its first review.", created_at: "2026-02-14T09:00:00Z" },
    { project_id: 104, project_name: "Harbour Community Library", organisation: "Demo Future Works", location: "Johor", description: "Fictional single-period reporting example.", created_at: "2026-01-05T09:00:00Z" },
    ...comparisonProjects,
  ],
  submissions: [
    { submission_id: 1001, project_id: 101, reporting_period: "2025-Q3", status: "APPROVED", submitted_at: "2025-10-08T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 124000, unit: "kWh" }, { metric_name: "Water", value: 4600, unit: "m3" }, { metric_name: "CO2e", value: 68, unit: "tCO2e" }] },
    { submission_id: 1002, project_id: 101, reporting_period: "2025-Q4", status: "APPROVED", submitted_at: "2026-01-09T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 119500, unit: "kWh" }, { metric_name: "Water", value: 4280, unit: "m3" }, { metric_name: "CO2e", value: 64, unit: "tCO2e" }] },
    { submission_id: 1003, project_id: 101, reporting_period: "2026-Q1", status: "APPROVED", submitted_at: "2026-04-08T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 113200, unit: "kWh" }, { metric_name: "Water", value: 4110, unit: "m3" }, { metric_name: "CO2e", value: 59, unit: "tCO2e" }] },
    { submission_id: 1004, project_id: 102, reporting_period: "2026-Q1", status: "APPROVED", submitted_at: "2026-04-12T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 88500, unit: "kWh" }, { metric_name: "Water", value: 3210, unit: "m3" }] },
    { submission_id: 1005, project_id: 102, reporting_period: "2026-Q2", status: "REJECTED", submitted_at: "2026-07-02T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 70000, unit: "kWh" }], reason: "Source meter export does not match the declared period." },
    { submission_id: 1006, project_id: 103, reporting_period: "2026-Q2", status: "UNREVIEWED", submitted_at: "2026-07-04T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 76000, unit: "kWh" }, { metric_name: "Water", value: 2650, unit: "m3" }, { metric_name: "CO2e", value: 38, unit: "tCO2e" }] },
    { submission_id: 1007, project_id: 104, reporting_period: "2026-Q1", status: "APPROVED", submitted_at: "2026-04-15T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 54200, unit: "kWh" }, { metric_name: "Water", value: 1880, unit: "m3" }, { metric_name: "CO2e", value: 27, unit: "tCO2e" }] },
    ...comparisonSubmissions,
  ],
  highlights: {},
  preparations: [],
  nextPreparationId: 1,
  preparationAssignments: [],
  preparationReviews: [],
  nextPreparationReviewId: 1,
  nextProjectId: 109,
  nextSubmissionId: 1116,
};
seed.projects = seed.projects.map((project) => ({
  ...project,
  organisation_id: DEMO_ORGANISATIONS.find((organisation) => organisation.name === project.organisation)?.id || null,
}));

function copy(value) { return JSON.parse(JSON.stringify(value)); }

function organisationId(name) {
  if (!name) return null;
  return DEMO_ORGANISATIONS.find((organisation) => organisation.name === name)?.id || `legacy-${encodeURIComponent(name)}`;
}

function migrateStore(value) {
  if (!value || !Array.isArray(value.projects) || !Array.isArray(value.submissions)) return copy(seed);
  // Keep every saved project, submission and highlight; only add relationships and missing seed fixtures.
  const migrated = {
    ...value,
    schemaVersion: MOCK_SCHEMA_VERSION,
    organisations: [...DEMO_ORGANISATIONS.map((organisation) => ({ ...organisation })), ...(Array.isArray(value.organisations) ? value.organisations.filter((organisation) => !DEMO_ORGANISATIONS.some((known) => known.id === organisation?.id)) : [])],
    users: DEMO_USERS.map((user) => ({ ...user })),
    assignments: Array.isArray(value.assignments) ? value.assignments : copy(seed.assignments),
    highlights: value.highlights && typeof value.highlights === "object" && !Array.isArray(value.highlights) ? value.highlights : {},
    preparations: Array.isArray(value.preparations) ? value.preparations : [],
    preparationAssignments: Array.isArray(value.preparationAssignments) ? value.preparationAssignments : [],
    preparationReviews: Array.isArray(value.preparationReviews) ? value.preparationReviews : [],
  };
  migrated.projects = value.projects.map((project) => ({ ...project, organisation_id: project.organisation_id || organisationId(project.organisation) }));
  for (const project of migrated.projects) {
    if (project.organisation_id && !migrated.organisations.some((item) => item.id === project.organisation_id)) {
      migrated.organisations.push({ id: project.organisation_id, name: project.organisation });
    }
  }
  if (!value.comparisonSeedVersion) {
    const knownProjects = new Set(migrated.projects.map((item) => item.project_id));
    const knownSubmissions = new Set(migrated.submissions.map((item) => item.submission_id));
    migrated.projects.push(...copy(comparisonProjects.filter((item) => !knownProjects.has(item.project_id))).map((project) => ({ ...project, organisation_id: organisationId(project.organisation) })));
    migrated.submissions.push(...copy(comparisonSubmissions.filter((item) => !knownSubmissions.has(item.submission_id))));
    migrated.comparisonSeedVersion = 1;
  }
  migrated.nextProjectId = Math.max(Number(value.nextProjectId) || 0, 109, ...migrated.projects.map((item) => Number(item.project_id) + 1));
  migrated.nextSubmissionId = Math.max(Number(value.nextSubmissionId) || 0, 1116, ...migrated.submissions.map((item) => Number(item.submission_id) + 1));
  migrated.nextPreparationId = Math.max(Number(value.nextPreparationId) || 0, 1, ...migrated.preparations.map((item) => (Number(item.id) || 0) + 1));
  migrated.nextPreparationReviewId = Math.max(Number(value.nextPreparationReviewId) || 0, 1, ...migrated.preparationReviews.map((item) => (Number(item.id) || 0) + 1));
  return migrated;
}

let memory = null;
export function getStore() {
  if (memory) return memory;
  try { memory = migrateStore(JSON.parse(sessionStorage.getItem(MOCK_STORAGE_KEY))); }
  catch { memory = copy(seed); }
  saveStore();
  return memory;
}

export function saveStore() {
  try { sessionStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(getStore())); }
  catch { /* Private browsing can disable session storage. */ }
}

export function resetMockStore() {
  memory = copy(seed);
  saveStore();
}

export function clearMockStoreCache() {
  memory = null;
}
