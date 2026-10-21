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
    expect(getProjectCatalogue).toHaveBeenCalledWith({ page: 1, page_size: 50, status: ["APPROVED"] });
    expect(getMetricHistory).toHaveBeenCalledTimes(3);
    // Approved only, so the history endpoint is not asked for unreviewed points.
    expect(getMetricHistory).toHaveBeenCalledWith(101, "Electricity", false);
    expect(snapshot.projects).toEqual([project]);
    expect(snapshot.submissions).toEqual([{
      project_id: 101, submission_id: 10, reporting_period: "2026-Q1", status: "APPROVED",
      submitted_at: null, metrics: [{ metric_name: "Electricity", value: 100, unit: "kWh" }],
    }]);
  });

  it("asks for unreviewed work, and keeps its real status, when requested", async () => {
    getProjectCatalogue.mockClear();
    getMetricHistory.mockClear();

    const snapshot = await getComparisonSnapshot(["APPROVED", "UNREVIEWED"]);

    expect(getProjectCatalogue).toHaveBeenCalledWith({
      page: 1, page_size: 50, status: ["APPROVED", "UNREVIEWED"],
    });
    expect(getMetricHistory).toHaveBeenCalledWith(101, "Electricity", true);
    // Each submission keeps the state it actually has rather than being assumed
    // approved, so the page can say which is which.
    expect(snapshot.submissions.map((item) => [item.submission_id, item.status]))
      .toEqual([[10, "APPROVED"], [11, "UNREVIEWED"]]);
  });

  it("asks for nothing when no review state is chosen", async () => {
    getProjectCatalogue.mockClear();
    expect(await getComparisonSnapshot([])).toEqual({ projects: [], submissions: [] });
    expect(getProjectCatalogue).not.toHaveBeenCalled();
  });
});
