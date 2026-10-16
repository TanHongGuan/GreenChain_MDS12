import { useState } from "react";
import { comparePeriods } from "../utils/metrics.js";

function format(value) { return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

export function TrendChart({ definition, points, onSelectSubmission }) {
  if (points.length < 2) return <p className="chart-empty">At least two approved periods are needed for a trend.</p>;
  const width = 620, height = 190, left = 58, top = 20, innerWidth = width - left - 20, innerHeight = height - top - 36;
  const min = Math.min(...points.map((point) => point.value), 0), max = Math.max(...points.map((point) => point.value), 1);
  const y = (value) => top + innerHeight - ((value - min) / (max - min)) * innerHeight;
  const x = (index) => left + (index / (points.length - 1)) * innerWidth;
  const coordinates = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  return <div className="trend-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${definition.label} approved trend in ${definition.unit}`}>
      <line x1={left} y1={top} x2={left} y2={top + innerHeight} className="chart-axis" />
      <line x1={left} y1={top + innerHeight} x2={width - 20} y2={top + innerHeight} className="chart-axis" />
      <text x={left - 6} y={top + 5} textAnchor="end">{format(max)}</text>
      <text x={left - 6} y={top + innerHeight} textAnchor="end">{format(min)}</text>
      <polyline points={coordinates} fill="none" stroke="#176b4d" strokeWidth="2.5" />
      {points.map((point, index) => <g key={`${point.reporting_period}-${point.submission_id}`}>
        <circle cx={x(index)} cy={y(point.value)} r="5" fill="#176b4d"><title>{`${point.reporting_period}: ${format(point.value)} ${definition.unit}, approved, source submission #${point.submission_id}`}</title></circle>
        <text x={x(index)} y={height - 6} textAnchor="middle">{point.reporting_period}</text>
      </g>)}
    </svg>
    <div className="chart-sources">{points.map((point) => <button type="button" key={point.submission_id} className="text-button" onClick={() => onSelectSubmission(point.submission_id)}>{point.reporting_period} · #{point.submission_id}</button>)}</div>
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
      <div><strong>{first.reporting_period}</strong><span>{format(first.value)} {definition.unit}</span></div>
      <div><strong>{second.reporting_period}</strong><span>{format(second.value)} {definition.unit}</span></div>
      <p>Change: {comparison.absolute > 0 ? "+" : ""}{format(comparison.absolute)} {definition.unit}{comparison.percent === null ? "" : ` (${comparison.percent > 0 ? "+" : ""}${comparison.percent.toFixed(1)}%)`}</p>
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
