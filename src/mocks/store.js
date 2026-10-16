const STORAGE_KEY = "greenchain-demo-v1";
const seed = {
  projects: [
    { project_id: 101, project_name: "Riverview Learning Centre", organisation: "Demo Civic Trust", location: "Kuala Lumpur", description: "A fictional learning facility used to demonstrate quarterly resource reporting.", created_at: "2025-01-10T09:00:00Z" },
    { project_id: 102, project_name: "North Quay Offices", organisation: "Demo Civic Trust", location: "Penang", description: "Fictional office project with incomplete metric coverage.", created_at: "2025-06-03T09:00:00Z" },
    { project_id: 103, project_name: "Canopy Research Hall", organisation: "Demo Future Works", location: "Selangor", description: "Fictional research building awaiting its first review.", created_at: "2026-02-14T09:00:00Z" },
    { project_id: 104, project_name: "Harbour Community Library", organisation: "Demo Future Works", location: "Johor", description: "Fictional single-period reporting example.", created_at: "2026-01-05T09:00:00Z" },
  ],
  submissions: [
    { submission_id: 1001, project_id: 101, reporting_period: "2025-Q3", status: "APPROVED", submitted_at: "2025-10-08T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 124000, unit: "kWh" }, { metric_name: "Water", value: 4600, unit: "m3" }, { metric_name: "CO2e", value: 68, unit: "tCO2e" }] },
    { submission_id: 1002, project_id: 101, reporting_period: "2025-Q4", status: "APPROVED", submitted_at: "2026-01-09T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 119500, unit: "kWh" }, { metric_name: "Water", value: 4280, unit: "m3" }, { metric_name: "CO2e", value: 64, unit: "tCO2e" }] },
    { submission_id: 1003, project_id: 101, reporting_period: "2026-Q1", status: "APPROVED", submitted_at: "2026-04-08T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 113200, unit: "kWh" }, { metric_name: "Water", value: 4110, unit: "m3" }, { metric_name: "CO2e", value: 59, unit: "tCO2e" }] },
    { submission_id: 1004, project_id: 102, reporting_period: "2026-Q1", status: "APPROVED", submitted_at: "2026-04-12T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 88500, unit: "kWh" }, { metric_name: "Water", value: 3210, unit: "m3" }] },
    { submission_id: 1005, project_id: 102, reporting_period: "2026-Q2", status: "REJECTED", submitted_at: "2026-07-02T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 70000, unit: "kWh" }], reason: "Source meter export does not match the declared period." },
    { submission_id: 1006, project_id: 103, reporting_period: "2026-Q2", status: "UNREVIEWED", submitted_at: "2026-07-04T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 76000, unit: "kWh" }, { metric_name: "Water", value: 2650, unit: "m3" }, { metric_name: "CO2e", value: 38, unit: "tCO2e" }] },
    { submission_id: 1007, project_id: 104, reporting_period: "2026-Q1", status: "APPROVED", submitted_at: "2026-04-15T09:00:00Z", metrics: [{ metric_name: "Electricity", value: 54200, unit: "kWh" }, { metric_name: "Water", value: 1880, unit: "m3" }, { metric_name: "CO2e", value: 27, unit: "tCO2e" }] },
  ],
  highlights: {},
  nextProjectId: 105,
  nextSubmissionId: 1008,
};

function copy(value) { return JSON.parse(JSON.stringify(value)); }

let memory = null;
export function getStore() {
  if (memory) return memory;
  try { memory = JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || copy(seed); }
  catch { memory = copy(seed); }
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
