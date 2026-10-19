import { displayUnit } from "../utils/display.js";

// Reporting consistency matrix: metric x reporting period, one cell per combination.
//
// This is a heatmap built from a real <table> rather than an SVG grid, so the
// visual and its accessible equivalent are the same element - there is no second
// "table view" that can drift from the picture. Every cell carries a glyph and a
// text label as well as its tint, so state never depends on colour alone.

const CELL_STATES = {
  APPROVED: { glyph: "✓", label: "Approved", className: "matrix-cell-approved" },
  UNREVIEWED: { glyph: "!", label: "Unreviewed", className: "matrix-cell-unreviewed" },
  MISSING: { glyph: "–", label: "Not reported", className: "matrix-cell-missing" },
};

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function cellTitle(cell, state) {
  const formatted = formatNumber(cell.value);
  const measurement = formatted ? ` ${formatted} ${displayUnit(cell.unit)}.` : "";
  const trace = cell.submission_id ? ` Submission #${cell.submission_id}.` : "";
  return `${cell.metric_name}, ${cell.reporting_period}: ${state.label}.${measurement}${trace}`;
}

export function ConsistencyMatrix({ report }) {
  const metrics = report?.metrics ?? [];
  const periods = report?.periods ?? [];

  if (metrics.length === 0 || periods.length === 0) {
    return (
      <p className="insight-empty">
        This project has no submissions with a readable reporting period yet, so reporting consistency cannot be
        shown.
      </p>
    );
  }

  const byKey = new Map(report.cells.map((cell) => [`${cell.metric_name}|${cell.reporting_period}`, cell]));
  const coverage = report.approved_coverage_percent;

  return (
    <div className="consistency-insight">
      <div className="coverage-stat">
        <p className="coverage-label">Approved reporting coverage</p>
        <p className="coverage-value">
          {coverage === null ? "Not available" : `${Math.round(coverage)}%`}
        </p>
        <p className="coverage-detail">
          {report.approved_cells} of {report.total_cells} metric-periods have approved data. This measures how
          completely the project has reported and had its data approved — it is not a sustainability score.
        </p>
      </div>

      <div className="chart-legend">
        {Object.values(CELL_STATES).map((state) => (
          <span className="chart-legend-item" key={state.label}>
            <span className={`matrix-swatch ${state.className}`} aria-hidden="true">
              {state.glyph}
            </span>
            {state.label}
          </span>
        ))}
      </div>

      <div className="metrics-table-wrap">
        <table className="consistency-matrix">
          <caption className="visually-hidden">
            Reporting state for each metric in each reporting period.
          </caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              {periods.map((period) => (
                <th scope="col" key={period}>
                  {period}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric}>
                <th scope="row">{metric}</th>
                {periods.map((period) => {
                  const cell = byKey.get(`${metric}|${period}`);
                  const state = CELL_STATES[cell?.state] ?? CELL_STATES.MISSING;
                  const formatted = cell ? formatNumber(cell.value) : null;
                  return (
                    <td key={period} className={`matrix-cell ${state.className}`} title={cellTitle(cell ?? {
                      metric_name: metric,
                      reporting_period: period,
                      value: null,
                      unit: null,
                      submission_id: null,
                    }, state)}>
                      <span className="matrix-glyph" aria-hidden="true">
                        {state.glyph}
                      </span>
                      <span className="matrix-state">{state.label}</span>
                      {formatted && (
                        <span className="matrix-value">
                          {formatted} {displayUnit(cell.unit)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
