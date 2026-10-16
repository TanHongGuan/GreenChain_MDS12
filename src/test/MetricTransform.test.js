import { describe, expect, it } from "vitest";
import { CORE_METRICS, approvedSeries, comparePeriods, metricDefinition } from "../utils/metrics.js";

describe("approved metric charts", () => {
  it("filters non-approved points and preserves source IDs", () => {
    const points = [
      { submission_id: 3, status: "REJECTED", reporting_period: "2026-Q3", value: 2, unit: "kWh" },
      { submission_id: 2, status: "APPROVED", reporting_period: "2026-Q2", value: 10, unit: "kWh" },
      { submission_id: 1, status: "APPROVED", reporting_period: "2026-Q1", value: 11, unit: "kWh" },
    ];
    expect(approvedSeries(points, CORE_METRICS[0]).map((item) => item.submission_id)).toEqual([1, 2]);
  });
  it("converts source kgCO2e only for display and rejects incompatible units", () => {
    const co2 = metricDefinition("carbon_emissions");
    const points = approvedSeries([
      { submission_id: 1, status: "APPROVED", reporting_period: "2026-Q1", value: 2000, unit: "kgCO2e" },
      { submission_id: 2, status: "APPROVED", reporting_period: "2026-Q2", value: 3, unit: "litres" },
    ], co2);
    expect(points).toMatchObject([{ value: 2, unit: "tCO2e", source_value: 2000, submission_id: 1 }]);
  });
  it("omits percentage when baseline is zero", () => {
    expect(comparePeriods({ value: 0, unit: "kWh" }, { value: 10, unit: "kWh" })).toEqual({ absolute: 10, percent: null });
    expect(comparePeriods({ value: 1, unit: "kWh" }, { value: 1, unit: "m3" })).toBeNull();
  });
});
