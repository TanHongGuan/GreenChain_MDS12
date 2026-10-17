const STORAGE_KEY = "greenchain-demo-v1";
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
  nextProjectId: 109,
  nextSubmissionId: 1116,
};

function copy(value) { return JSON.parse(JSON.stringify(value)); }

let memory = null;
export function getStore() {
  if (memory) return memory;
  try { memory = JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || copy(seed); }
  catch { memory = copy(seed); }
  if (!memory.comparisonSeedVersion) {
    const knownProjects = new Set(memory.projects.map((item) => item.project_id));
    const knownSubmissions = new Set(memory.submissions.map((item) => item.submission_id));
    memory.projects.push(...copy(comparisonProjects.filter((item) => !knownProjects.has(item.project_id))));
    memory.submissions.push(...copy(comparisonSubmissions.filter((item) => !knownSubmissions.has(item.submission_id))));
    memory.nextProjectId = Math.max(memory.nextProjectId, 109);
    memory.nextSubmissionId = Math.max(memory.nextSubmissionId, 1116);
    memory.comparisonSeedVersion = 1;
    saveStore();
  }
  return memory;
}

export function saveStore() {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(getStore())); }
  catch { /* Private browsing can disable session storage. */ }
}

export function resetMockStore() {
  memory = copy(seed);
  saveStore();
}

export function mockUser(role) {
  const name = role === "AUDITOR" ? "Demo Auditor" : role === "UPLOADER" ? "Demo Uploader" : "Demo Viewer";
  return { id: { VIEWER: 1, UPLOADER: 2, AUDITOR: 3 }[role], name, email: `${role.toLowerCase()}@demo.greenchain.test`, role };
}
