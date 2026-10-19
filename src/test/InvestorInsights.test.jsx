import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BenchmarkComparisonChart, niceAxisMax } from "../components/BenchmarkComparisonChart.jsx";
import { ConsistencyMatrix } from "../components/ConsistencyMatrix.jsx";

function comparison(overrides = {}) {
  return {
    metric_name: "Electricity",
    reporting_period: "2026-Q2",
    submission_id: 10,
    value: 150,
    unit: "kWh",
    direction: "LOWER_IS_BETTER",
    benchmark_value: 200,
    benchmark_unit: "kWh",
    difference_percent: -25,
    classification: "BETTER_THAN_TARGET",
    reason: null,
    source: {
      provider: "Test Provider",
      source_name: "Test Source",
      source_version: "v1",
      source_url: null,
      country: "Australia",
      property_type: "Office",
      year: 2026,
    },
    ...overrides,
  };
}

function report(comparisons) {
  return {
    project: {
      project_id: 42,
      project_name: "Green Tower",
      organisation: "Acme Corp",
      country: "Australia",
      property_type: "Office",
    },
    tolerance_percent: 5,
    comparisons,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("benchmark comparison chart", () => {
  test("shows the benchmark source and version so the comparison is attributable", () => {
    const { container } = render(<BenchmarkComparisonChart report={report([comparison()])} />);

    const provenance = container.querySelector(".benchmark-provenance");
    expect(provenance).toHaveTextContent("Test Provider");
    expect(provenance).toHaveTextContent("version v1");
    expect(provenance).toHaveTextContent("Australia / Office");
    // The table twin repeats the attribution, so the source travels with the data.
    const row = screen.getByRole("row", { name: /Electricity/ });
    expect(within(row).getByText(/Test Provider v1 \(2026\)/)).toBeInTheDocument();
  });

  test("states the tolerance band that defines 'at target'", () => {
    const { container } = render(<BenchmarkComparisonChart report={report([comparison()])} />);

    expect(container.querySelector(".benchmark-provenance")).toHaveTextContent(
      "A value within 5% of the benchmark is reported as at target",
    );
  });

  test("renders the classification as text, not colour alone", () => {
    render(<BenchmarkComparisonChart report={report([comparison()])} />);

    expect(screen.getAllByText("Better than target").length).toBeGreaterThan(0);
  });

  test("renders a table twin carrying every value", () => {
    render(<BenchmarkComparisonChart report={report([comparison()])} />);

    const row = screen.getByRole("row", { name: /Electricity/ });
    expect(within(row).getByText(/150 kWh/)).toBeInTheDocument();
    expect(within(row).getByText(/200 kWh/)).toBeInTheDocument();
    expect(within(row).getByText("-25.0%")).toBeInTheDocument();
  });

  test("explains a metric that cannot be benchmarked instead of dropping it", () => {
    const notComparable = comparison({
      classification: "NOT_COMPARABLE",
      reason: "UNIT_MISMATCH",
      difference_percent: null,
      benchmark_value: null,
      benchmark_unit: null,
      source: null,
    });

    render(<BenchmarkComparisonChart report={report([notComparable])} />);

    expect(screen.getByRole("heading", { name: "Not compared" })).toBeInTheDocument();
    expect(screen.getAllByText(/does not convert units/).length).toBeGreaterThan(0);
    // The measured value stays visible so a reader does not assume the metric is absent.
    expect(screen.getAllByText(/150 kWh/).length).toBeGreaterThan(0);
  });

  test("a project with no approved data says so rather than rendering an empty chart", () => {
    render(<BenchmarkComparisonChart report={report([])} />);

    expect(screen.getByText(/nothing to benchmark/)).toBeInTheDocument();
  });

  test("does not invent a GreenChain score or a peer percentile", () => {
    render(<BenchmarkComparisonChart report={report([comparison()])} />);

    expect(screen.queryByText(/percentile/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rating/i)).not.toBeInTheDocument();
  });

  test("axis maximum rounds up to a readable tick", () => {
    expect(niceAxisMax(0)).toBe(10);
    expect(niceAxisMax(3)).toBe(5);
    expect(niceAxisMax(25)).toBe(25);
    expect(niceAxisMax(31)).toBe(50);
    expect(niceAxisMax(640)).toBe(700);
  });
});

describe("reporting consistency matrix", () => {
  const consistency = {
    project_id: 42,
    metrics: ["Electricity", "Water"],
    periods: ["2026-Q1", "2026-Q2"],
    cells: [
      {
        metric_name: "Electricity",
        reporting_period: "2026-Q1",
        state: "APPROVED",
        value: 100,
        unit: "kWh",
        submission_id: 9,
      },
      {
        metric_name: "Electricity",
        reporting_period: "2026-Q2",
        state: "UNREVIEWED",
        value: 150,
        unit: "kWh",
        submission_id: 10,
      },
      {
        metric_name: "Water",
        reporting_period: "2026-Q1",
        state: "MISSING",
        value: null,
        unit: null,
        submission_id: null,
      },
      {
        metric_name: "Water",
        reporting_period: "2026-Q2",
        state: "APPROVED",
        value: 20,
        unit: "kL",
        submission_id: 11,
      },
    ],
    approved_cells: 2,
    total_cells: 4,
    approved_coverage_percent: 50,
  };

  test("labels every cell state in text, never colour alone", () => {
    render(<ConsistencyMatrix report={consistency} />);

    // Two legend entries plus the cells themselves.
    expect(screen.getAllByText("Approved").length).toBe(3);
    expect(screen.getAllByText("Unreviewed").length).toBe(2);
    expect(screen.getAllByText("Not reported").length).toBe(2);
  });

  test("reports coverage as counts as well as a percentage", () => {
    render(<ConsistencyMatrix report={consistency} />);

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText(/2 of 4 metric-periods/)).toBeInTheDocument();
  });

  test("says explicitly that coverage is not a sustainability score", () => {
    render(<ConsistencyMatrix report={consistency} />);

    expect(screen.getByText(/not a sustainability score/)).toBeInTheDocument();
  });

  test("renders one row per metric and one column per period", () => {
    render(<ConsistencyMatrix report={consistency} />);

    expect(screen.getByRole("columnheader", { name: "2026-Q1" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "2026-Q2" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Electricity" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Water" })).toBeInTheDocument();
  });

  test("a project with no readable periods says so", () => {
    render(<ConsistencyMatrix report={{ ...consistency, metrics: [], periods: [], cells: [] }} />);

    expect(screen.getByText(/no submissions with a readable reporting period/)).toBeInTheDocument();
  });
});
