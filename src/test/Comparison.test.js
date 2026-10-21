import { describe, expect, it } from "vitest";
import { comparisonRows, latestPeriodRange, latestRecords, organisationRangeSummary, organisationSummary, periodsInRange, previousQuarter } from "../utils/comparison.js";

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
    expect(latestRecords(submissions).get("1:2026-Q1").submission_id).toBe(4);
    expect(comparisonRows(projects, submissions, [1, 2, 3], "2026-Q1").map((row) => row.values.electricity)).toEqual([130, null, null]);
  });

  it("includes unreviewed submissions only when they are asked for", () => {
    const both = ["APPROVED", "UNREVIEWED"];
    // Gamma's only 2026-Q1 submission is unreviewed, so it is absent by default
    // and present when the viewer asks for unreviewed work too.
    expect(comparisonRows(projects, submissions, [3], "2026-Q1")[0].values.electricity).toBeNull();
    const row = comparisonRows(projects, submissions, [3], "2026-Q1", both)[0];
    expect(row.values.electricity).toBe(800);
    expect(row.status).toBe("UNREVIEWED");

    // Rejected data stays out whatever is asked for: it failed review, and
    // showing it beside approved figures would present it as evidence.
    expect(comparisonRows(projects, submissions, [2], "2026-Q1", both)[0].values.electricity).toBeNull();
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

  it("opens on the latest four quarters and filters a start-to-end range", () => {
    const quarters = ["2025-Q2", "2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2", "2026-Q3"];
    expect(latestPeriodRange(quarters)).toEqual({ start: "2025-Q4", end: "2026-Q3" });
    expect(latestPeriodRange(["2026-Q1"])).toEqual({ start: "2026-Q1", end: "2026-Q1" });
    expect(latestPeriodRange([])).toEqual({ start: "", end: "" });
    expect(periodsInRange(quarters, "2025-Q4", "2026-Q2")).toEqual(["2025-Q4", "2026-Q1", "2026-Q2"]);
  });

  it("sums each building across a range and compares end with start on matched buildings", () => {
    const summary = organisationRangeSummary(projects, submissions, "Org A", ["2025-Q4", "2026-Q1"], "electricity");
    // Alpha 100 + 130 (latest approved in Q1), Beta 200 (Q1 was rejected).
    expect(summary.total).toBe(430);
    expect(summary.contributorCount).toBe(2);
    expect(summary.contributors.find((row) => row.project.project_id === 1).value).toBe(230);
    // Only Alpha reported in both quarters: 100 -> 130.
    expect(summary.matchedCount).toBe(1);
    expect(summary.matchedChangePercent).toBe(30);
    // A single-quarter range has nothing to compare against.
    expect(organisationRangeSummary(projects, submissions, "Org A", ["2025-Q4"], "electricity").matchedChangePercent).toBeNull();
  });

  it("adds up the seeded Monosh demo correctly: two buildings in Q1-Q2, one in Q3, nothing counted twice", () => {
    const demoProjects = [
      { project_id: 1, project_name: "Monosh Science Building", organisation: "Monosh" },
      { project_id: 2, project_name: "Monosh Engineering Hall", organisation: "Monosh" },
    ];
    const seeded = [
      [1, 1, "2026-Q1", 587595.96], [2, 2, "2026-Q1", 489984.50], [3, 1, "2026-Q2", 641618.97],
      [4, 2, "2026-Q2", 526975.12], [5, 1, "2026-Q3", 653112.34],
    ].map(([id, project, period, kwh]) => ({
      submission_id: id, project_id: project, reporting_period: period, status: "APPROVED",
      submitted_at: `2026-10-21T00:00:0${id}Z`, metrics: [{ metric_name: "Electricity", value: kwh, unit: "kWh" }],
    }));
    const q1 = organisationSummary(demoProjects, seeded, "Monosh", "2026-Q1", "electricity");
    const q3 = organisationSummary(demoProjects, seeded, "Monosh", "2026-Q3", "electricity");
    expect(q1.total).toBeCloseTo(1077580.46, 2);
    expect(q1.contributorCount).toBe(2);
    // Engineering has no Q3: it is left out, not counted as zero.
    expect(q3.total).toBeCloseTo(653112.34, 2);
    expect(q3.contributorCount).toBe(1);
    expect(q3.buildingCount).toBe(2);

    const range = organisationRangeSummary(demoProjects, seeded, "Monosh", ["2026-Q1", "2026-Q2", "2026-Q3"], "electricity");
    expect(range.total).toBeCloseTo(587595.96 + 489984.50 + 641618.97 + 526975.12 + 653112.34, 2);
    expect(range.contributors.find((row) => row.project.project_id === 2).value).toBeCloseTo(489984.50 + 526975.12, 2);
    // Only Science reported in both Q1 and Q3, so only it is in the change.
    expect(range.matchedCount).toBe(1);
    expect(range.matchedChangePercent).toBeCloseTo((653112.34 - 587595.96) / 587595.96 * 100, 6);
  });
});

