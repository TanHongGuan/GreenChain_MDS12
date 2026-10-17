import { displayUnit } from "../utils/display.js";

const format = (value) => Number(value).toLocaleString("en-MY", { maximumFractionDigits: 2 });

export function ComparisonBarChart({ rows, metric, sort = "desc", showShare = false }) {
  if (!rows.length) return <p className="comparison-empty">No approved {metric.label.toLowerCase()} values for this selection and quarter.</p>;
  const sorted = [...rows].sort((a, b) => (a.value - b.value) * (sort === "asc" ? 1 : -1));
  const max = Math.max(0, ...sorted.map((row) => row.value));
  return <div className="comparison-bars" role="img" aria-label={`${metric.label} comparison, zero-based scale, ${displayUnit(metric.unit)}`}>
    {sorted.map((row) => <div className="comparison-bar-row" key={row.id} title={`${row.name}: ${format(row.value)} ${displayUnit(metric.unit)}${showShare && row.share !== null ? ` (${row.share.toFixed(1)}% of reported total)` : ""}`}>
      <span className="comparison-bar-name">{row.name}</span>
      <span className="comparison-bar-track"><span style={{ width: `${max > 0 ? row.value / max * 100 : 0}%` }} /></span>
      <strong>{format(row.value)} <small>{displayUnit(metric.unit)}</small>{showShare && row.share !== null ? <em> · {row.share.toFixed(1)}%</em> : null}</strong>
    </div>)}
    <div className="comparison-axis"><span>0</span><span>{format(max)} {displayUnit(metric.unit)}</span></div>
  </div>;
}

export function OrganisationTrend({ points, metric }) {
  const available = points.filter((point) => point.total !== null);
  if (!available.length) return <p className="comparison-empty">No approved values are available for this metric.</p>;
  if (available.length < 2) return <p className="comparison-empty">Only one quarter has approved data. At least two are needed for a trend.</p>;
  const width = 680, height = 230, left = 76, top = 28, innerWidth = width - left - 28, innerHeight = height - top - 58;
  const values = available.map((point) => point.total);
  const low = Math.min(...values), high = Math.max(...values);
  const padding = Math.max((high - low) * 0.25, Math.abs(high) * 0.02, 1);
  const min = low < 0 ? low - padding : Math.max(0, low - padding), max = high + padding;
  const x = (index) => left + index / Math.max(1, points.length - 1) * innerWidth;
  const y = (value) => top + innerHeight - (value - min) / (max - min) * innerHeight;
  return <div className="organisation-trend">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric.label} reported quarterly totals in ${displayUnit(metric.unit)}; missing quarters have no point`}>
      <text x={left} y="16" className="chart-unit-label">{displayUnit(metric.unit)}</text>
      <line x1={left} y1={top} x2={left} y2={top + innerHeight} className="chart-axis" />
      <line x1={left} y1={top + innerHeight} x2={width - 20} y2={top + innerHeight} className="chart-axis" />
      <text x={left - 7} y={top + 5} textAnchor="end">{format(max)}</text>
      <text x={left - 7} y={top + innerHeight} textAnchor="end">{format(min)}</text>
      {points.slice(1).map((point, index) => points[index].total !== null && point.total !== null ?
        <line key={`${point.period}-line`} x1={x(index)} y1={y(points[index].total)} x2={x(index + 1)} y2={y(point.total)} className="comparison-trend-line" /> : null)}
      {points.map((point, index) => <g key={point.period}>
        {point.total !== null ? <circle cx={x(index)} cy={y(point.total)} r="5" className="comparison-trend-point"><title>{`${point.period}: ${format(point.total)} ${displayUnit(metric.unit)} from ${point.contributorCount} building(s)`}</title></circle> : null}
        <text x={x(index)} y={height - 6} textAnchor="middle">{point.period}</text>
      </g>)}
    </svg>
    <p className="chart-axis-note">Vertical axis: {format(min)}–{format(max)} {displayUnit(metric.unit)}. Missing quarters break the line; totals reflect available approved data.</p>
  </div>;
}
