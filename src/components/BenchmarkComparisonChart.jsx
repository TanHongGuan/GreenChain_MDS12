import { useState } from "react";

import { displayUnit } from "../utils/display.js";

// Diverging bar chart: each metric's latest approved value as a signed percentage
// difference from its benchmark. Percentage is the only axis, which is what lets
// metrics in kWh, kL and tCO2e share one chart honestly - plotting their raw
// values together would need a second scale, and a second scale invents a
// relationship that is not in the data.

const VIEW_WIDTH = 680;
const LABEL_WIDTH = 150;
const PLOT_LEFT = LABEL_WIDTH;
const PLOT_RIGHT = VIEW_WIDTH - 16;
const PLOT_CENTRE = (PLOT_LEFT + PLOT_RIGHT) / 2;
const HALF_WIDTH = PLOT_CENTRE - PLOT_LEFT;
const ROW_HEIGHT = 52;
const BAR_THICKNESS = 20;
const AXIS_BAND = 34;
const TOP_PAD = 26;
// Shortest bar that can hold its own value label inside with padding on both sides.
const MIN_INSIDE_LABEL_WIDTH = 56;

const CLASSIFICATION_LABELS = {
  BETTER_THAN_TARGET: "Better than target",
  AT_TARGET: "At target",
  WORSE_THAN_TARGET: "Worse than target",
  NOT_COMPARABLE: "Not comparable",
};

const REASON_EXPLANATIONS = {
  PROJECT_SCOPE_UNKNOWN:
    "This project has no recorded country and property type, so no benchmark can be matched to it.",
  NO_BENCHMARK_FOR_SCOPE:
    "No benchmark has been published for this country, property type and metric at or before this reporting year.",
  UNIT_MISMATCH:
    "A benchmark exists but is published in a different unit. GreenChain does not convert units, so no comparison is shown.",
  UNKNOWN_METRIC_DIRECTION:
    "This metric has no agreed better/worse direction, so a target classification would not be meaningful.",
  BENCHMARK_NOT_USABLE: "The matched benchmark value is zero, which makes a percentage difference undefined.",
  PERIOD_NOT_PARSEABLE:
    "This submission's reporting period could not be read as a year and quarter, so no benchmark year could be selected.",
};

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Not available";
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Not available";
  }
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

// Round the axis maximum up to a readable tick value so the ticks are whole numbers.
export function niceAxisMax(maxAbsolute) {
  if (!Number.isFinite(maxAbsolute) || maxAbsolute <= 0) {
    return 10;
  }
  const candidates = [5, 10, 20, 25, 50, 75, 100, 150, 200, 300, 500];
  const found = candidates.find((candidate) => candidate >= maxAbsolute);
  return found ?? Math.ceil(maxAbsolute / 100) * 100;
}

// A rectangle rounded only at the data end, square where it meets the baseline.
function barPath(centreX, tipX, y, thickness, radius) {
  const growsRight = tipX >= centreX;
  const length = Math.abs(tipX - centreX);
  const r = Math.max(0, Math.min(radius, length));
  const bottom = y + thickness;

  if (growsRight) {
    const end = centreX + length;
    return [
      `M ${centreX} ${y}`,
      `H ${end - r}`,
      `Q ${end} ${y} ${end} ${y + r}`,
      `V ${bottom - r}`,
      `Q ${end} ${bottom} ${end - r} ${bottom}`,
      `H ${centreX}`,
      "Z",
    ].join(" ");
  }

  const end = centreX - length;
  return [
    `M ${centreX} ${y}`,
    `H ${end + r}`,
    `Q ${end} ${y} ${end} ${y + r}`,
    `V ${bottom - r}`,
    `Q ${end} ${bottom} ${end + r} ${bottom}`,
    `H ${centreX}`,
    "Z",
  ].join(" ");
}

function ComparisonTable({ comparisons, toleranceP }) {
  return (
    <div className="metrics-table-wrap">
      <table className="metrics-table benchmark-table">
        <caption className="visually-hidden">
          Latest approved value for each metric compared with its benchmark. A value within{" "}
          {toleranceP}% of the benchmark is reported as at target.
        </caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Latest approved</th>
            <th scope="col">Benchmark</th>
            <th scope="col">Difference</th>
            <th scope="col">Assessment</th>
            <th scope="col">Benchmark source</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((comparison) => (
            <tr key={comparison.metric_name}>
              <th scope="row">{comparison.metric_name}</th>
              <td>
                {formatNumber(comparison.value)} {displayUnit(comparison.unit)}
                <span className="table-note"> ({comparison.reporting_period})</span>
              </td>
              <td>
                {comparison.benchmark_value === null
                  ? "Not available"
                  : `${formatNumber(comparison.benchmark_value)} ${displayUnit(comparison.benchmark_unit)}`}
              </td>
              <td>{formatPercent(comparison.difference_percent)}</td>
              <td>
                {CLASSIFICATION_LABELS[comparison.classification] || comparison.classification}
                {comparison.reason && (
                  <span className="table-note"> — {REASON_EXPLANATIONS[comparison.reason] || comparison.reason}</span>
                )}
              </td>
              <td>
                {comparison.source
                  ? `${comparison.source.provider} ${comparison.source.source_version} (${comparison.source.year})`
                  : "None"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BenchmarkComparisonChart({ report }) {
  const [active, setActive] = useState(null);

  const comparisons = report?.comparisons ?? [];
  const comparable = comparisons.filter((item) => item.difference_percent !== null);
  const notComparable = comparisons.filter((item) => item.difference_percent === null);
  const tolerance = report?.tolerance_percent ?? 5;

  if (comparisons.length === 0) {
    return (
      <p className="insight-empty">
        No approved sustainability data is available for this project yet, so there is nothing to benchmark.
      </p>
    );
  }

  const axisMax = niceAxisMax(Math.max(...comparable.map((item) => Math.abs(item.difference_percent)), 0));
  const plotHeight = comparable.length * ROW_HEIGHT;
  const viewHeight = TOP_PAD + plotHeight + AXIS_BAND;
  const ticks = [-axisMax, -axisMax / 2, 0, axisMax / 2, axisMax];

  const sources = Array.from(
    new Map(
      comparable
        .filter((item) => item.source)
        .map((item) => [
          `${item.source.provider}|${item.source.source_version}`,
          item.source,
        ]),
    ).values(),
  );

  return (
    <div className="benchmark-insight">
      {comparable.length > 0 && (
        <>
          <div className="chart-legend" aria-hidden="true">
            <span className="chart-legend-item">
              <span className="chart-swatch chart-swatch-below" /> Below benchmark
            </span>
            <span className="chart-legend-item">
              <span className="chart-swatch chart-swatch-above" /> Above benchmark
            </span>
            <span className="chart-legend-note">
              Lower is better for every metric shown, so a bar to the left is the better outcome.
            </span>
          </div>

          <div className="chart-frame">
            <svg
              className="benchmark-chart"
              viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
              role="img"
              aria-label={`Difference from benchmark for ${comparable
                .map((item) => item.metric_name)
                .join(", ")}. The same values are listed in the table below.`}
            >
              {ticks.map((tick) => {
                const x = PLOT_CENTRE + (tick / axisMax) * HALF_WIDTH;
                const isZero = tick === 0;
                return (
                  <g key={`tick-${tick}`}>
                    <line
                      x1={x}
                      y1={TOP_PAD - 8}
                      x2={x}
                      y2={TOP_PAD + plotHeight}
                      className={isZero ? "chart-baseline" : "chart-gridline"}
                    />
                    <text x={x} y={TOP_PAD + plotHeight + 20} className="chart-tick" textAnchor="middle">
                      {tick > 0 ? `+${tick}%` : `${tick}%`}
                    </text>
                  </g>
                );
              })}

              <text x={PLOT_CENTRE} y={TOP_PAD - 14} className="chart-axis-title" textAnchor="middle">
                Benchmark
              </text>

              {comparable.map((comparison, index) => {
                const y = TOP_PAD + index * ROW_HEIGHT;
                const barY = y + (ROW_HEIGHT - BAR_THICKNESS) / 2;
                const ratio = Math.max(-1, Math.min(1, comparison.difference_percent / axisMax));
                const tipX = PLOT_CENTRE + ratio * HALF_WIDTH;
                const barLength = Math.abs(tipX - PLOT_CENTRE);
                const growsRight = comparison.difference_percent > 0;
                const labelFitsInside = barLength >= MIN_INSIDE_LABEL_WIDTH;
                const labelX = labelFitsInside
                  ? tipX + (growsRight ? -8 : 8)
                  : tipX + (growsRight ? 8 : -8);
                const isActive = active === comparison.metric_name;

                return (
                  <g
                    key={comparison.metric_name}
                    className="benchmark-row"
                    tabIndex={0}
                    role="button"
                    aria-label={`${comparison.metric_name}: ${formatPercent(
                      comparison.difference_percent,
                    )} versus benchmark. ${CLASSIFICATION_LABELS[comparison.classification]}.`}
                    onMouseEnter={() => setActive(comparison.metric_name)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(comparison.metric_name)}
                    onBlur={() => setActive(null)}
                  >
                    {/* Hit area spans the whole row so the target is never pinpoint. */}
                    <rect x={0} y={y} width={VIEW_WIDTH} height={ROW_HEIGHT} className="benchmark-row-hit" />
                    {isActive && (
                      <rect x={0} y={y} width={VIEW_WIDTH} height={ROW_HEIGHT} className="benchmark-row-active" />
                    )}

                    <text x={LABEL_WIDTH - 20} y={y + 22} className="chart-row-label" textAnchor="end">
                      {comparison.metric_name}
                    </text>
                    <text x={LABEL_WIDTH - 20} y={y + 38} className="chart-row-sublabel" textAnchor="end">
                      {CLASSIFICATION_LABELS[comparison.classification]}
                    </text>

                    <path
                      d={barPath(PLOT_CENTRE, tipX, barY, BAR_THICKNESS, 4)}
                      className={growsRight ? "benchmark-bar-above" : "benchmark-bar-below"}
                    />

                    <text
                      x={labelX}
                      y={barY + BAR_THICKNESS / 2 + 4}
                      className={labelFitsInside ? "chart-value-inside" : "chart-value-outside"}
                      textAnchor={labelFitsInside === growsRight ? "end" : "start"}
                    >
                      {formatPercent(comparison.difference_percent)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </>
      )}

      {sources.length > 0 && (
        <p className="benchmark-provenance">
          Benchmark source:{" "}
          {sources
            .map((source) => `${source.provider} — ${source.source_name}, version ${source.source_version}`)
            .join("; ")}
          . Scope: {report.project.country} / {report.project.property_type}. A value within {tolerance}% of the
          benchmark is reported as at target.
        </p>
      )}

      {notComparable.length > 0 && (
        <div className="benchmark-excluded">
          <h3>Not compared</h3>
          <ul>
            {notComparable.map((comparison) => (
              <li key={comparison.metric_name}>
                <strong>{comparison.metric_name}</strong> ({formatNumber(comparison.value)} {displayUnit(comparison.unit)}) —{" "}
                {REASON_EXPLANATIONS[comparison.reason] || "No benchmark comparison is available."}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ComparisonTable comparisons={comparisons} toleranceP={tolerance} />
    </div>
  );
}
