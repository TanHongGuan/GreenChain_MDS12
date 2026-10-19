import { beforeEach, describe, expect, it } from "vitest";
import * as mock from "../mocks/mockService.js";
import { resetMockStore } from "../mocks/store.js";

// The mock insights implementation mirrors backend/app/benchmarks/service.py.
// These tests pin the behaviour the two must share, so a demo and a real run
// cannot quietly disagree about what a project's performance looks like.

describe("mock investor insights", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetMockStore();
  });

  it("returns the same payload shape the real API returns", async () => {
    const report = await mock.getProjectBenchmarks(101);

    expect(Object.keys(report).sort()).toEqual(["comparisons", "project", "tolerance_percent"]);
    expect(Object.keys(report.project).sort()).toEqual([
      "country", "organisation", "project_id", "project_name", "property_type",
    ]);
    expect(Object.keys(report.comparisons[0]).sort()).toEqual([
      "benchmark_unit", "benchmark_value", "classification", "difference_percent", "direction",
      "metric_name", "reason", "reporting_period", "source", "submission_id", "unit", "value",
    ]);
    expect(report.tolerance_percent).toBe(5);
  });

  it("uses canonical metric names, not display labels", async () => {
    const report = await mock.getProjectBenchmarks(101);

    expect(report.comparisons.map((item) => item.metric_name)).toEqual(["CO2e", "Electricity", "Water"]);
  });

  it("classifies against the seeded demo benchmark", async () => {
    const report = await mock.getProjectBenchmarks(101);
    const electricity = report.comparisons.find((item) => item.metric_name === "Electricity");

    // Latest approved electricity for project 101 is 113,200 kWh against a 95,000 target.
    expect(electricity.value).toBe(113200);
    expect(electricity.benchmark_value).toBe(95000);
    expect(electricity.difference_percent).toBeCloseTo(19.16, 1);
    expect(electricity.classification).toBe("WORSE_THAN_TARGET");
  });

  it("always attributes a comparison to a named source and version", async () => {
    const report = await mock.getProjectBenchmarks(101);

    for (const comparison of report.comparisons.filter((item) => item.benchmark_value !== null)) {
      expect(comparison.source.provider).toBe("GreenChain Demo Benchmark Set");
      expect(comparison.source.source_version).toBe("demo-2026.1");
    }
  });

  it("reports a project with no benchmark scope instead of guessing one", async () => {
    // Project 104 is seeded without a country or property type on purpose.
    const report = await mock.getProjectBenchmarks(104);

    expect(report.project.country).toBeNull();
    expect(report.comparisons.length).toBeGreaterThan(0);
    for (const comparison of report.comparisons) {
      expect(comparison.classification).toBe("NOT_COMPARABLE");
      expect(comparison.reason).toBe("PROJECT_SCOPE_UNKNOWN");
      expect(comparison.benchmark_value).toBeNull();
    }
  });

  it("never benchmarks unreviewed data", async () => {
    // Project 103's only submission is UNREVIEWED.
    const report = await mock.getProjectBenchmarks(103);

    expect(report.comparisons).toEqual([]);
  });

  it("marks a metric the project never reported as missing", async () => {
    // Project 102 reports Electricity and Water but no CO2e.
    const report = await mock.getProjectConsistency(102);

    expect(report.metrics).toEqual(["Electricity", "Water"]);
    expect(report.cells.every((cell) => cell.state === "APPROVED")).toBe(true);
  });

  it("excludes rejected submissions from reporting consistency", async () => {
    // 2026-Q2 for project 102 is REJECTED and must not become a column.
    const report = await mock.getProjectConsistency(102);

    expect(report.periods).toEqual(["2026-Q1"]);
  });

  it("counts coverage from approved cells only", async () => {
    const report = await mock.getProjectConsistency(105);

    expect(report.total_cells).toBe(report.metrics.length * report.periods.length);
    expect(report.approved_coverage_percent).toBeCloseTo(
      (report.approved_cells / report.total_cells) * 100,
      6,
    );
    // Project 105 is missing CO2e in one quarter, so coverage is below 100%.
    expect(report.approved_coverage_percent).toBeLessThan(100);
  });

  it("does not touch the network", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("Network used in mock mode");
    };
    try {
      await mock.getProjectBenchmarks(101);
      await mock.getProjectConsistency(101);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
