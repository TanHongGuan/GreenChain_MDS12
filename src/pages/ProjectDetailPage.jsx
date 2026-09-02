import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getMetricHistory, getProjectDetail } from "../api/projectsApi.js";

const CANONICAL_METRIC_ORDER = ["Electricity", "Water", "CO2e", "Waste"];

function formatValue(value) {
  if (value === null || value === undefined) {
    return "Not available";
  }
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function statusClass(status) {
  return `status-pill status-${status.toLowerCase()}`;
}

function orderMetrics(metrics) {
  const byName = new Map(metrics.map((metric) => [metric.metric_name, metric]));
  const ordered = [];
  for (const name of CANONICAL_METRIC_ORDER) {
    if (byName.has(name)) {
      ordered.push(byName.get(name));
      byName.delete(name);
    }
  }
  return [...ordered, ...byName.values()];
}

function ComparisonBadge({ latest, previous }) {
  if (!previous) {
    return <span className="comparison-badge comparison-none">No previous approved period</span>;
  }
  if (previous.value === 0) {
    return <span className="comparison-badge comparison-none">Comparison not available</span>;
  }

  const change = ((latest.value - previous.value) / previous.value) * 100;
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";

  return (
    <span className={`comparison-badge comparison-${direction}`}>
      {arrow} {Math.abs(change).toFixed(1)}% vs {previous.reporting_period}
    </span>
  );
}

function MetricCard({ metric }) {
  const { metric_name: metricName, latest, previous } = metric;

  if (!latest) {
    return (
      <article className="metric-card metric-card-empty">
        <h3>{metricName}</h3>
        <p>No approved data yet.</p>
      </article>
    );
  }

  return (
    <article className="metric-card">
      <h3>{metricName}</h3>
      <p className="metric-card-value">
        {formatValue(latest.value)} <span className="metric-card-unit">{latest.unit}</span>
      </p>
      <p className="metric-card-period">Approved period: {latest.reporting_period}</p>
      <ComparisonBadge latest={latest} previous={previous} />
    </article>
  );
}

function MetricHistoryChart({ points }) {
  if (points.length === 0) {
    return <p>No historical data available for the selected filters.</p>;
  }

  const width = 640;
  const height = 220;
  const padding = 32;
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const valueRange = maxValue - minValue || 1;

  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : padding + (index / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - minValue) / valueRange) * (height - padding * 2);
    return { ...point, x, y };
  });

  return (
    <svg
      className="metric-history-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Metric history over time"
    >
      {coords.slice(1).map((point, index) => {
        const previousPoint = coords[index];
        const isSolid = previousPoint.status === "APPROVED" && point.status === "APPROVED";
        return (
          <line
            key={`${previousPoint.submission_id}-${point.submission_id}`}
            x1={previousPoint.x}
            y1={previousPoint.y}
            x2={point.x}
            y2={point.y}
            className={isSolid ? "chart-line chart-line-solid" : "chart-line chart-line-dashed"}
          />
        );
      })}
      {coords.map((point) => (
        <circle
          key={point.submission_id}
          cx={point.x}
          cy={point.y}
          r={5}
          className={point.status === "APPROVED" ? "chart-point chart-point-approved" : "chart-point chart-point-unreviewed"}
        >
          <title>
            {point.reporting_period}: {formatValue(point.value)} ({point.status})
          </title>
        </circle>
      ))}
    </svg>
  );
}

export function ProjectDetailPage() {
  const { projectId } = useParams();
  const [detail, setDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState("loading");
  const [detailError, setDetailError] = useState("");

  const [selectedMetric, setSelectedMetric] = useState(null);
  const [includeUnreviewed, setIncludeUnreviewed] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyStatus, setHistoryStatus] = useState("idle");
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setDetailStatus("loading");
    setDetailError("");

    getProjectDetail(projectId)
      .then((payload) => {
        if (!isMounted) {
          return;
        }
        setDetail(payload);
        const orderedMetrics = orderMetrics(payload.metrics);
        setSelectedMetric(orderedMetrics.length > 0 ? orderedMetrics[0].metric_name : null);
        setDetailStatus("success");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setDetailError(error.message || "Unable to load this project.");
        setDetailStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!selectedMetric) {
      return undefined;
    }
    let isMounted = true;
    setHistoryStatus("loading");
    setHistoryError("");

    getMetricHistory(projectId, selectedMetric, includeUnreviewed)
      .then((payload) => {
        if (!isMounted) {
          return;
        }
        setHistory(payload.points);
        setHistoryStatus("success");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setHistoryError(error.message || "Unable to load metric history.");
        setHistoryStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, [projectId, selectedMetric, includeUnreviewed]);

  if (detailStatus === "loading") {
    return (
      <section className="page-panel project-detail-page">
        <p>Loading project...</p>
      </section>
    );
  }

  if (detailStatus === "error") {
    return (
      <section className="page-panel project-detail-page">
        <div className="form-error" role="status">
          {detailError}
        </div>
        <Link to="/projects" className="secondary-button">
          Back to projects
        </Link>
      </section>
    );
  }

  const orderedMetrics = orderMetrics(detail.metrics);

  return (
    <section className="page-panel project-detail-page">
      <div className="page-heading">
        <p className="eyebrow">{detail.project.organisation}</p>
        <h1>{detail.project.project_name}</h1>
      </div>

      {orderedMetrics.length === 0 && <p>No approved sustainability data yet for this project.</p>}

      {orderedMetrics.length > 0 && (
        <>
          <div className="metric-card-grid">
            {orderedMetrics.map((metric) => (
              <MetricCard key={metric.metric_name} metric={metric} />
            ))}
          </div>

          <div className="metric-tabs" role="tablist" aria-label="Metric history selector">
            {orderedMetrics.map((metric) => (
              <button
                key={metric.metric_name}
                type="button"
                role="tab"
                aria-selected={selectedMetric === metric.metric_name}
                className={selectedMetric === metric.metric_name ? "metric-tab metric-tab-active" : "metric-tab"}
                onClick={() => setSelectedMetric(metric.metric_name)}
              >
                {metric.metric_name}
              </button>
            ))}
          </div>

          <div className="chart-controls">
            <label>
              <input
                type="checkbox"
                checked={includeUnreviewed}
                onChange={(event) => setIncludeUnreviewed(event.target.checked)}
              />
              Show unreviewed submissions (dashed)
            </label>
          </div>

          {historyStatus === "loading" && <p>Loading history...</p>}
          {historyStatus === "error" && (
            <div className="form-error" role="status">
              {historyError}
            </div>
          )}
          {historyStatus === "success" && <MetricHistoryChart points={history} />}

          {historyStatus === "success" && history.length > 0 && (
            <div className="metrics-table-wrap">
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((point) => (
                    <tr key={point.submission_id}>
                      <td>{point.reporting_period}</td>
                      <td>
                        {formatValue(point.value)} {point.unit}
                      </td>
                      <td>
                        <span className={statusClass(point.status)}>{point.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
