import { useState } from "react";
import { comparePeriods } from "../utils/metrics.js";
import { displayUnit } from "../utils/display.js";

function format(value) { return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

export function TrendChart({ definition, points, onSelectSubmission }) {
  if (!points.length) return <p className="chart-empty">No values are available for this metric under the selected review states.</p>;
  if (points.length < 2) return <p className="chart-empty">Only one period is available. A trend needs at least two.</p>;
  const width = 680, height = 220, left = 72, top = 30, innerWidth = width - left - 24, innerHeight = height - top - 44;
  const values = points.map((point) => point.value);
  const low = Math.min(...values), high = Math.max(...values);
  const padding = Math.max((high - low) * 0.25, Math.abs(high) * 0.02, 1);
  const min = low < 0 ? low - padding : Math.max(0, low - padding), max = high + padding;
  const y = (value) => top + innerHeight - ((value - min) / (max - min)) * innerHeight;
  const x = (index) => left + (index / (points.length - 1)) * innerWidth;
  const coordinates = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  return <div className="trend-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${definition.label} approved trend in ${displayUnit(definition.unit)}; vertical axis from ${format(min)} to ${format(max)}`}>
      <text x={left} y="16" className="chart-unit-label">{displayUnit(definition.unit)}</text>
      <line x1={left} y1={top} x2={left} y2={top + innerHeight} className="chart-axis" />
      <line x1={left} y1={top + innerHeight} x2={width - 20} y2={top + innerHeight} className="chart-axis" />
      <line x1={left} y1={top + innerHeight / 2} x2={width - 20} y2={top + innerHeight / 2} className="chart-gridline" />
      <text x={left - 6} y={top + 5} textAnchor="end">{format(max)}</text>
      <text x={left - 6} y={top + innerHeight / 2 + 5} textAnchor="end">{format((min + max) / 2)}</text>
      <text x={left - 6} y={top + innerHeight} textAnchor="end">{format(min)}</text>
      {points.slice(1).map((point, index) => {
        // A segment is dashed when either end is unreviewed, so an unreviewed
        // value never reads as a confirmed part of the trend.
        const previous = points[index];
        const provisional = previous.status !== "APPROVED" || point.status !== "APPROVED";
        return <line key={`seg-${point.reporting_period}-${point.submission_id}`}
          x1={x(index)} y1={y(previous.value)} x2={x(index + 1)} y2={y(point.value)}
          className={provisional ? "chart-line chart-line-dashed" : "chart-line"} strokeWidth="2.5" />;
      })}
      {points.map((point, index) => <g key={`${point.reporting_period}-${point.submission_id}`}>
        <circle cx={x(index)} cy={y(point.value)} r="5"
          className={point.status === "APPROVED" ? "chart-point-approved" : "chart-point-unreviewed"}>
          <title>{`${point.reporting_period}: ${format(point.value)} ${displayUnit(definition.unit)}, ${point.status === "APPROVED" ? "approved" : "unreviewed"}, source submission #${point.submission_id}`}</title></circle>
        <text x={x(index)} y={height - 6} textAnchor="middle">{point.reporting_period}</text>
      </g>)}
    </svg>
    <p className="chart-axis-note">Vertical axis: {format(min)}–{format(max)} {displayUnit(definition.unit)}. The axis is scaled to the observed range; it does not always start at zero.</p>
    <div className="chart-sources">{points.map((point) => <button type="button" key={`${point.reporting_period}-${point.submission_id}`} className="text-button" onClick={() => onSelectSubmission(point.submission_id)}>{point.reporting_period} · #{point.submission_id}</button>)}</div>
  </div>;
}

export function PeriodComparison({ seriesByKey, definitions }) {
  const [key, setKey] = useState(definitions[0].key);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const definition = definitions.find((item) => item.key === key);
  const points = seriesByKey[key] || [];
  const first = points.find((item) => item.reporting_period === (from || points.at(-2)?.reporting_period));
  const second = points.find((item) => item.reporting_period === (to || points.at(-1)?.reporting_period));
  const comparison = comparePeriods(first, second);
  return <section className="chart-section" aria-labelledby="period-comparison-heading">
    <h2 id="period-comparison-heading">Period comparison</h2>
    <div className="comparison-controls">
      <label>Metric<select value={key} onChange={(event) => { setKey(event.target.value); setFrom(""); setTo(""); }}>{definitions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label>From<select value={from || points.at(-2)?.reporting_period || ""} onChange={(event) => setFrom(event.target.value)}>{points.map((point) => <option key={point.reporting_period} value={point.reporting_period}>{point.reporting_period}</option>)}</select></label>
      <label>To<select value={to || points.at(-1)?.reporting_period || ""} onChange={(event) => setTo(event.target.value)}>{points.map((point) => <option key={point.reporting_period} value={point.reporting_period}>{point.reporting_period}</option>)}</select></label>
    </div>
    {!comparison || first.reporting_period === second.reporting_period ? <p>Choose two approved periods for the same metric.</p> : <div className="comparison-result">
      <div><strong>{first.reporting_period}</strong><span>{format(first.value)} {displayUnit(definition.unit)}</span></div>
      <div><strong>{second.reporting_period}</strong><span>{format(second.value)} {displayUnit(definition.unit)}</span></div>
      <p>Change: {comparison.absolute > 0 ? "+" : ""}{format(comparison.absolute)} {displayUnit(definition.unit)}{comparison.percent === null ? "" : ` (${comparison.percent > 0 ? "+" : ""}${comparison.percent.toFixed(1)}%)`}</p>
    </div>}
  </section>;
}

export function VerificationChart({ submissions }) {
  if (!submissions.length) return <p>No submissions to classify.</p>;
  const statuses = [["APPROVED", "Approved"], ["UNREVIEWED", "Unreviewed"], ["REJECTED", "Rejected"]];
  return <section className="chart-section" aria-labelledby="verification-heading"><h2 id="verification-heading">Submission verification</h2>
    <div className="verification-bar" role="img" aria-label={statuses.map(([key, label]) => `${label}: ${submissions.filter((item) => item.status === key).length}`).join(", ")}>
      {statuses.map(([key]) => <span key={key} className={`verification-${key.toLowerCase()}`} style={{ width: `${submissions.filter((item) => item.status === key).length / submissions.length * 100}%` }} />)}
    </div>
    <div className="verification-legend">{statuses.map(([key, label]) => <span key={key}>{label}: {submissions.filter((item) => item.status === key).length}</span>)}</div>
  </section>;
}
