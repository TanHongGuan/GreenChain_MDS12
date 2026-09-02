import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getMetricHistory, getProjectDetail } from "../api/projectsApi.js";
import {
  getProjectSubmissions,
  getSubmissionDetail,
  getSubmissionEvidenceUrl,
} from "../api/submissionsApi.js";

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

function formatDate(value) {
  if (!value) {
    return "Not available";
  }
  return new Date(value).toLocaleString();
}

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "Not available";
  }
  return `${value.toLocaleString()} bytes`;
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

function MetricCard({ metric, onSelectSubmission }) {
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
      <button type="button" className="text-button" onClick={() => onSelectSubmission(latest.submission_id)}>
        Source submission #{latest.submission_id}
      </button>
      <ComparisonBadge latest={latest} previous={previous} />
    </article>
  );
}

function evidenceStatus(evidence) {
  if (!evidence?.available) {
    return "Unavailable";
  }
  if (evidence.integrity?.status) {
    return evidence.integrity.status;
  }
  return "Available";
}

function EvidenceLink({ submissionId, type, label, evidence }) {
  if (!evidence?.available) {
    return (
      <span className="secondary-button evidence-disabled" aria-disabled="true">
        {label} unavailable
      </span>
    );
  }

  return (
    <a className="secondary-button" href={getSubmissionEvidenceUrl(submissionId, type)}>
      {label}
    </a>
  );
}

function SubmissionRecords({ records, selectedSubmissionId, onSelectSubmission }) {
  if (records.length === 0) {
    return <p>No submission records exist for this project yet.</p>;
  }

  return (
    <div className="metrics-table-wrap submission-records">
      <table className="metrics-table">
        <thead>
          <tr>
            <th>Submission</th>
            <th>Period</th>
            <th>Status</th>
            <th>Review</th>
            <th>Evidence</th>
            <th>Version</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.submission_id} data-selected={record.submission_id === selectedSubmissionId}>
              <td>
                <button type="button" className="text-button" onClick={() => onSelectSubmission(record.submission_id)}>
                  #{record.submission_id}
                </button>
              </td>
              <td>{record.reporting_period}</td>
              <td>
                <span className={statusClass(record.status)}>{record.status}</span>
              </td>
              <td>{record.review?.decision || "Pending"}</td>
              <td>
                Original {evidenceStatus(record.evidence?.original)} / Processed{" "}
                {evidenceStatus(record.evidence?.processed)}
              </td>
              <td>
                {record.previous_submission
                  ? `Correction of #${record.previous_submission.submission_id}`
                  : record.corrected_by?.length
                    ? `Corrected by #${record.corrected_by[0].submission_id}`
                    : "Original"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubmissionDetailPanel({ detail, status, error }) {
  if (status === "idle") {
    return <p>Select a submission record to inspect its traceability.</p>;
  }

  if (status === "loading") {
    return <p>Loading submission detail...</p>;
  }

  if (status === "error") {
    return (
      <div className="form-error" role="status">
        {error}
      </div>
    );
  }

  const original = detail.evidence?.original;
  const processed = detail.evidence?.processed;
  const auditReport = detail.evidence?.audit_report;

  return (
    <article className="submission-detail-panel">
      <div className="detail-header">
        <div>
          <h2>Submission #{detail.submission_id}</h2>
          <p>
            {detail.project_name} / {detail.organisation}
          </p>
        </div>
        <span className={statusClass(detail.status)}>{detail.status}</span>
      </div>

      <dl className="detail-grid">
        <div>
          <dt>Reporting period</dt>
          <dd>{detail.reporting_period}</dd>
        </div>
        <div>
          <dt>Submitted by</dt>
          <dd>{detail.submitted_by?.name || "Not available"}</dd>
        </div>
        <div>
          <dt>Submitted at</dt>
          <dd>{formatDate(detail.submitted_at)}</dd>
        </div>
        <div>
          <dt>Review decision</dt>
          <dd>{detail.review?.decision || "Pending"}</dd>
        </div>
        <div>
          <dt>Original SHA-256</dt>
          <dd className="hash-value">{original?.sha256 || "Not available"}</dd>
        </div>
        <div>
          <dt>Integrity</dt>
          <dd>{evidenceStatus(original)}</dd>
        </div>
        <div>
          <dt>Original size</dt>
          <dd>{formatBytes(original?.size_bytes)}</dd>
        </div>
        <div>
          <dt>Processed size</dt>
          <dd>{formatBytes(processed?.size_bytes)}</dd>
        </div>
        <div>
          <dt>Previous version</dt>
          <dd>{detail.previous_submission ? `#${detail.previous_submission.submission_id}` : "None"}</dd>
        </div>
        <div>
          <dt>Corrected by</dt>
          <dd>
            {detail.corrected_by?.length
              ? detail.corrected_by.map((version) => `#${version.submission_id}`).join(", ")
              : "None"}
          </dd>
        </div>
      </dl>

      <div className="evidence-actions">
        <EvidenceLink submissionId={detail.submission_id} type="original" label="Original data" evidence={original} />
        <EvidenceLink
          submissionId={detail.submission_id}
          type="processed"
          label="Processed data"
          evidence={processed}
        />
        <EvidenceLink
          submissionId={detail.submission_id}
          type="audit_report"
          label="Audit report"
          evidence={auditReport}
        />
      </div>

      {detail.metrics.length === 0 ? (
        <p>No processed metrics are available for this submission.</p>
      ) : (
        <div className="metrics-table-wrap">
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
                <th>Trace</th>
              </tr>
            </thead>
            <tbody>
              {detail.metrics.map((metric) => (
                <tr key={`${metric.metric_name}-${metric.submission_id}`}>
                  <td>{metric.metric_name}</td>
                  <td>
                    {formatValue(metric.value)} {metric.unit}
                  </td>
                  <td>
                    Submission #{metric.submission_id}, {metric.reporting_period}, {metric.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

  const [submissions, setSubmissions] = useState([]);
  const [submissionsStatus, setSubmissionsStatus] = useState("loading");
  const [submissionsError, setSubmissionsError] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [submissionDetail, setSubmissionDetail] = useState(null);
  const [submissionDetailStatus, setSubmissionDetailStatus] = useState("idle");
  const [submissionDetailError, setSubmissionDetailError] = useState("");

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
    let isMounted = true;
    setSubmissionsStatus("loading");
    setSubmissionsError("");
    setSubmissionDetail(null);
    setSubmissionDetailStatus("idle");
    setSelectedSubmissionId(null);

    getProjectSubmissions(projectId)
      .then((records) => {
        if (!isMounted) {
          return;
        }
        setSubmissions(records);
        setSelectedSubmissionId(records.length > 0 ? records[0].submission_id : null);
        setSubmissionsStatus("success");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setSubmissionsError(error.message || "Unable to load submission records.");
        setSubmissionsStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!selectedSubmissionId) {
      setSubmissionDetailStatus("idle");
      setSubmissionDetail(null);
      return undefined;
    }

    let isMounted = true;
    setSubmissionDetailStatus("loading");
    setSubmissionDetailError("");

    getSubmissionDetail(selectedSubmissionId)
      .then((payload) => {
        if (!isMounted) {
          return;
        }
        setSubmissionDetail(payload);
        setSubmissionDetailStatus("success");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setSubmissionDetailError(error.message || "Unable to load submission detail.");
        setSubmissionDetailStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSubmissionId]);

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
              <MetricCard key={metric.metric_name} metric={metric} onSelectSubmission={setSelectedSubmissionId} />
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

      <section className="traceability-section" aria-labelledby="submission-records-heading">
        <div className="section-heading">
          <h2 id="submission-records-heading">Submission Records</h2>
          <p>Trace project values to submitted evidence and review outcomes.</p>
        </div>

        {submissionsStatus === "loading" && <p>Loading submission records...</p>}
        {submissionsStatus === "error" && (
          <div className="form-error" role="status">
            {submissionsError}
          </div>
        )}
        {submissionsStatus === "success" && (
          <SubmissionRecords
            records={submissions}
            selectedSubmissionId={selectedSubmissionId}
            onSelectSubmission={setSelectedSubmissionId}
          />
        )}
      </section>

      <section className="traceability-section" aria-labelledby="submission-detail-heading">
        <div className="section-heading">
          <h2 id="submission-detail-heading">Submission Detail</h2>
        </div>
        <SubmissionDetailPanel
          detail={submissionDetail}
          status={submissionDetailStatus}
          error={submissionDetailError}
        />
      </section>
    </section>
  );
}
