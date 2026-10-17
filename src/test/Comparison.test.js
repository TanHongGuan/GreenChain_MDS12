import { describe, expect, it } from "vitest";
import { approvedRecords, comparisonRows, organisationSummary, previousQuarter } from "../utils/comparison.js";

const projects = [
  { project_id: 1, project_name: "Alpha", organisation: "Org A" },
  { project_id: 2, project_name: "Beta", organisation: "Org A" },
  { project_id: 3, project_name: "Gamma", organisation: "Org B" },
];
const entry = (id, project, period, status, electricity, water) => ({
  submission_id: id, project_id: project, reporting_period: period, status, submitted_at: `2026-04-${String(id).padStart(2, "0")}T00:00:00Z`,
  metrics: [electricity === null ? null : { metric_name: "Electricity", value: electricity, unit: "kWh" }, water === null ? null : { metric_name: "Water", value: water, unit: "m3" }].filter(Boolean),
});
const submissions = [
  entry(1, 1, "2025-Q4", "APPROVED", 100, 10),
  entry(2, 2, "2025-Q4", "APPROVED", 200, 20),
  entry(3, 1, "2026-Q1", "APPROVED", 120, null),
  entry(4, 1, "2026-Q1", "APPROVED", 130, null),
  entry(5, 2, "2026-Q1", "REJECTED", 900, 90),
  entry(6, 3, "2026-Q1", "UNREVIEWED", 800, 80),
];

describe("comparison aggregation", () => {
  it("keeps only the latest approved building-quarter submission", () => {
    expect(approvedRecords(submissions).get("1:2026-Q1").submission_id).toBe(4);
    expect(comparisonRows(projects, submissions, [1, 2, 3], "2026-Q1").map((row) => row.values.electricity)).toEqual([130, null, null]);
  });

  it("does not treat missing metrics, rejected, or unreviewed values as zero", () => {
    const rows = comparisonRows(projects, submissions, [1, 2, 3], "2026-Q1");
    expect(rows[0].values.water).toBeNull();
    expect(rows[1].submissionId).toBeNull();
    expect(rows[2].submissionId).toBeNull();
  });

  it("aggregates only eligible buildings and calculates contribution shares", () => {
    const summary = organisationSummary(projects, submissions, "Org A", "2025-Q4", "electricity");
    expect(summary.total).toBe(300);
    expect(summary.contributorCount).toBe(2);
    expect(summary.contributors[0].share).toBeCloseTo(100 / 3);
    expect(summary.contributors[1].share).toBeCloseTo(200 / 3);
  });

  it("uses the same buildings for quarter-over-quarter percentages", () => {
    const summary = organisationSummary(projects, submissions, "Org A", "2026-Q1", "electricity");
    expect(summary.total).toBe(130);
    expect(summary.matchedCount).toBe(1);
    expect(summary.matchedChangePercent).toBe(30);
    expect(organisationSummary(projects, submissions, "Org A", "2026-Q1", "water").matchedChangePercent).toBeNull();
    expect(previousQuarter("2026-Q1")).toBe("2025-Q4");
  });
});
