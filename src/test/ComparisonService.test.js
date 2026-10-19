import { describe, expect, it, vi } from "vitest";

const { project, getProjectCatalogue, getMetricHistory } = vi.hoisted(() => {
  const project = { project_id: 101, project_name: "Test Hall", organisation: "Test Trust" };
  return {
    project,
    getProjectCatalogue: vi.fn(async () => ({ projects: [project], total_pages: 1 })),
    getMetricHistory: vi.fn(async (_id, name) => ({ points: name === "Electricity" ? [
      { submission_id: 10, reporting_period: "2026-Q1", status: "APPROVED", value: 100, unit: "kWh" },
      { submission_id: 11, reporting_period: "2026-Q2", status: "UNREVIEWED", value: 900, unit: "kWh" },
    ] : [] })),
  };
});

vi.mock("../services/dataService.js", () => ({ getProjectCatalogue, getMetricHistory }));

import { getComparisonSnapshot } from "../services/comparisonService.js";

describe("real comparison adapter", () => {
  it("uses existing read APIs and excludes unreviewed history points", async () => {
    const snapshot = await getComparisonSnapshot();
    expect(getProjectCatalogue).toHaveBeenCalledWith({ page: 1, page_size: 50 });
    expect(getMetricHistory).toHaveBeenCalledTimes(3);
    expect(snapshot.projects).toEqual([project]);
    expect(snapshot.submissions).toEqual([{
      project_id: 101, submission_id: 10, reporting_period: "2026-Q1", status: "APPROVED",
      submitted_at: null, metrics: [{ metric_name: "Electricity", value: 100, unit: "kWh" }],
    }]);
  });
});
