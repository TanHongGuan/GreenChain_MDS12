import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { getApprovedMonthlyHistory, getProjectConsistency, getProjectDetail, getMetricHistory } from "../services/dataService.js";
import {
  getProjectSubmissions,
  getSubmissionDetail,
  getSubmissionEvidenceUrl,
} from "../services/dataService.js";

import { CORE_METRICS, metricDefinition, normalizedPoint, seriesForStatuses } from "../utils/metrics.js";
import { PeriodComparison, TrendChart, VerificationChart } from "../components/MetricCharts.jsx";
import { ConsistencyMatrix } from "../components/ConsistencyMatrix.jsx";
import { Panel } from "../components/Panel.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { displayDate, displayUnit } from "../utils/display.js";

const CANONICAL_METRIC_ORDER = ["Electricity", "Water", "CO2e"];

function formatValue(value) {
  if (value === null || value === undefined) {
    return "Not available";
  }
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Rejected is deliberately not offered: it failed review and must never be charted as evidence.
const CHART_STATUS_OPTIONS = [["APPROVED", "Approved"], ["UNREVIEWED", "Unreviewed"]];

function chartStatusNote(statuses) {
  const approved = statuses.includes("APPROVED");
  const unreviewed = statuses.includes("UNREVIEWED");
  if (approved && unreviewed) return "Approved and unreviewed";
  if (unreviewed) return "Unreviewed only";
  if (approved) return "Approved only";
  return "Nothing selected";
}

function statusClass(status) {
  return `status-pill status-${status.toLowerCase()}`;
}

function formatDate(value) {
  if (!value) {
    return "Not available";
  }
  return displayDate(value, true);
}

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "Not available";
  }
  return `${value.toLocaleString()} bytes`;
}

function orderMetrics(metrics) {
  const byName = new Map(metrics.filter((metric) => metricDefinition(metric.metric_name)).map((metric) => [metric.metric_name, metric]));
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
  const definition = metricDefinition(metricName);
  const displayLatest = latest ? normalizedPoint(latest, definition) : null;
  const displayPrevious = previous ? normalizedPoint(previous, definition) : null;

  if (!latest) {
    return (
      <article className="metric-card metric-card-empty">
        <h3>{definition.label}</h3>
        <p>No approved data yet.</p>
      </article>
    );
  }

  return (
    <article className="metric-card">
      <h3>{definition.label}</h3>
      <p className="metric-card-value">
        {formatValue(displayLatest?.value ?? latest.value)} <span className="metric-card-unit">{displayUnit(displayLatest?.unit || latest.unit)}</span>
      </p>
      <p className="metric-card-period">Approved period: {latest.reporting_period}</p>
      <button type="button" className="text-button metric-card-source" onClick={() => onSelectSubmission(latest.submission_id)}>
        View source submission #{latest.submission_id}
      </button>
      {!displayLatest && <p>Unit is not supported for trend charts.</p>}
      <ComparisonBadge latest={displayLatest || latest} previous={displayPrevious || previous} />
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
  const href = getSubmissionEvidenceUrl(submissionId, type);
  if (!evidence?.available || !href) {
    return (
      <span className="secondary-button evidence-disabled" aria-disabled="true">
        {label} unavailable
      </span>
    );
  }

  return (
    <a className="secondary-button" href={href}>
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

function SubmissionDetailPanel({ detail, status, error, canInspectEvidence }) {
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

      <h3 className="detail-subheading">Submission information</h3>
      <dl className="detail-grid">
        <div>
          <dt>Reporting period</dt>
          <dd>{detail.reporting_period}</dd>
        </div>
        <div>
          <dt>Submitted by</dt>
          <dd>
            {detail.submitted_by
              ? `${detail.submitted_by.name} (${detail.submitted_by.email})`
              : "Not available"}
          </dd>
        </div>
        <div>
          <dt>Submitted at</dt>
          <dd>{formatDate(detail.submitted_at)}</dd>
        </div>
        <div><dt>Source file</dt><dd>{original?.filename || "Not available"}</dd></div>
      </dl>

      <h3 className="detail-subheading">Review and integrity</h3>
      <dl className="detail-grid">
        <div><dt>Review decision</dt><dd>{detail.review?.decision || "Pending"}</dd></div>
        <div><dt>Reviewed by</dt><dd>{detail.review ? `${detail.review.reviewer_name} (${detail.review.reviewer_email})` : "Pending"}</dd></div>
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
      </dl>
      <p className="integrity-note">A matching SHA-256 checks file consistency, not the accuracy of its reported values. Unavailable demo evidence is not an integrity failure.</p>

      <h3 className="detail-subheading">Evidence and processed metrics</h3>
      <div className="evidence-actions">
        {!canInspectEvidence && <p>Evidence access is restricted for this submission.</p>}
        {/* Only the original file is offered for download. The processed records
            and the audit history are still kept and still shown on this page -
            the metrics table below, and the review and integrity block above. */}
        {canInspectEvidence && <EvidenceLink
          submissionId={detail.submission_id} type="original"
          label="Original uploaded file" evidence={original}
        />}
      </div>

      {detail.metrics.filter((metric) => metricDefinition(metric.metric_name)).length === 0 ? (
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
              {detail.metrics.filter((metric) => metricDefinition(metric.metric_name)).map((metric) => (
                <tr key={`${metric.metric_name}-${metric.submission_id}`}>
                  <td>{metric.metric_name}</td>
                  <td>
                    {formatValue(metric.value)} {displayUnit(metric.unit)}
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
      <h3 className="detail-subheading">Version history</h3>
      <dl className="detail-grid">
        <div><dt>Previous version</dt><dd>{detail.previous_submission ? `#${detail.previous_submission.submission_id}` : "None"}</dd></div>
        <div><dt>Corrected by</dt><dd>{detail.corrected_by?.length ? detail.corrected_by.map((version) => `#${version.submission_id}`).join(", ") : "None"}</dd></div>
      </dl>
    </article>
  );
}

export function ProjectDetailPage() {
  const { user } = useAuth();
  const { projectId } = useParams();
  const location = useLocation();
  const projectListUrl = `/projects${location.search}`;
  const navigationParams = new URLSearchParams(location.search);
  const requestedSubmissionId = navigationParams.get("submission");
  const [detail, setDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState("loading");
  const [detailError, setDetailError] = useState("");

  const [submissions, setSubmissions] = useState([]);
  const [verificationRecords, setVerificationRecords] = useState([]);
  const [submissionsStatus, setSubmissionsStatus] = useState("loading");
  const [submissionsError, setSubmissionsError] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [consistency, setConsistency] = useState(null);
  const [consistencyStatus, setConsistencyStatus] = useState("loading");
  const [consistencyError, setConsistencyError] = useState("");
  const [submissionDetail, setSubmissionDetail] = useState(null);
  const [submissionDetailStatus, setSubmissionDetailStatus] = useState("idle");
  const [submissionDetailError, setSubmissionDetailError] = useState("");
  // Both states by default. Unreviewed points are drawn dashed and hollow, and the
  // note below says so, so pending figures are never mistaken for reviewed ones.
  const [chartStatuses, setChartStatuses] = useState(["APPROVED", "UNREVIEWED"]);
  // Fixed order, so the effect below sees the same key whichever box was ticked first.
  const statusKey = CHART_STATUS_OPTIONS.map(([value]) => value).filter((value) => chartStatuses.includes(value)).join(",");

  function toggleChartStatus(status) {
    setChartStatuses((current) => current.includes(status)
      ? current.filter((item) => item !== status) : [...current, status]);
  }
  const [historyByKey, setHistoryByKey] = useState({});
  const [historyStatus, setHistoryStatus] = useState("loading");
  const [chartMetricKey, setChartMetricKey] = useState(CORE_METRICS[0].key);
  const [monthlyRecords, setMonthlyRecords] = useState([]);
  const [monthlyStatus, setMonthlyStatus] = useState("loading");
  const [monthlyError, setMonthlyError] = useState("");

  useEffect(() => {
    let active = true;
    setMonthlyStatus("loading");
    getApprovedMonthlyHistory(projectId).then((payload) => {
      if (active) { setMonthlyRecords(payload.monthly_records || []); setMonthlyStatus("success"); }
    }).catch((error) => {
      if (active) { setMonthlyError(error.message || "Unable to load monthly data."); setMonthlyStatus("error"); }
    });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    if (!detail) return undefined;
    const statuses = statusKey ? statusKey.split(",") : [];
    if (!statuses.length) { setHistoryByKey({}); setHistoryStatus("success"); return undefined; }
    let active = true;
    setHistoryStatus("loading");
    Promise.all(CORE_METRICS.map(async (definition) => {
      const existing = detail.metrics.find((metric) => metricDefinition(metric.metric_name)?.key === definition.key);
      try {
        // The endpoint returns approved rows always, and unreviewed ones only when
        // asked. Rejected rows are never returned by it at all.
        const response = await getMetricHistory(projectId, existing?.metric_name || definition.names[0], statuses.includes("UNREVIEWED"));
        return [definition.key, seriesForStatuses(response.points, definition, statuses)];
      } catch { return [definition.key, []]; }
    })).then((entries) => { if (active) { setHistoryByKey(Object.fromEntries(entries)); setHistoryStatus("success"); } });
    return () => { active = false; };
  }, [detail, projectId, statusKey]);

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
        const visibleRecords = user?.role === "VIEWER" ? records.filter((record) => record.status === "APPROVED") : records;
        setVerificationRecords(records);
        setSubmissions(visibleRecords);
        const requestedRecord = requestedSubmissionId === null ? visibleRecords[0] : visibleRecords.find((record) => String(record.submission_id) === requestedSubmissionId);
        setSelectedSubmissionId(requestedRecord?.submission_id ?? null);
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
  }, [projectId, user?.role, requestedSubmissionId]);

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
    let isMounted = true;
    setConsistencyStatus("loading");
    setConsistencyError("");

    getProjectConsistency(projectId)
      .then((payload) => {
        if (!isMounted) return;
        setConsistency(payload);
        setConsistencyStatus("success");
      })
      .catch((error) => {
        if (!isMounted) return;
        setConsistencyError(error.message || "Unable to load reporting consistency.");
        setConsistencyStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, [projectId]);

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
        <Link to={projectListUrl} className="secondary-button">
          Back to projects
        </Link>
      </section>
    );
  }

  const orderedMetrics = orderMetrics(detail.metrics);

  return (
    <section className="page-panel project-detail-page">
      <div className="page-heading">
        <Link to={projectListUrl} className="detail-back-link">
          <span aria-hidden="true">←</span> Back to projects
        </Link>
        <p className="eyebrow">{detail.project.organisation}</p>
        <h1>{detail.project.project_name}</h1>
        {detail.project.location && <p className="detail-location">{detail.project.location}</p>}
        {detail.project.description && <p>{detail.project.description}</p>}
      </div>

      {orderedMetrics.length === 0 && <p>No approved sustainability data yet for this project.</p>}

      {orderedMetrics.length > 0 && (
        <div className="metric-summary-section">
          <div className="metric-card-grid">
            {orderedMetrics.map((metric) => (
              <MetricCard key={metric.metric_name} metric={metric} onSelectSubmission={setSelectedSubmissionId} />
            ))}
          </div>
        </div>
      )}

      <Panel id="performance-heading" title="Performance by quarter"
             note={chartStatusNote(chartStatuses)} defaultOpen>
        <fieldset className="compare-status-filter chart-status-filter">
          <legend>Review state shown</legend>
          {CHART_STATUS_OPTIONS.map(([value, label]) => (
            <label key={value}>
              <input type="checkbox" checked={chartStatuses.includes(value)} onChange={() => toggleChartStatus(value)} />
              {label}
            </label>
          ))}
        </fieldset>
        {chartStatuses.includes("UNREVIEWED") && <p className="chart-status-note">
          Unreviewed figures have not passed auditor review and are drawn with a dashed line and hollow points.
          Rejected submissions are never charted.
        </p>}
        {!chartStatuses.length && <p className="form-warning" role="status">Tick at least one review state to show the charts.</p>}
        {historyStatus === "loading" && <p>Loading history...</p>}
        {historyStatus === "success" && chartStatuses.length > 0 && <>
          <div className="metric-tabs" role="tablist" aria-label="Performance metric">
            {CORE_METRICS.map((definition) => <button key={definition.key} role="tab" type="button" id={`metric-tab-${definition.key}`} aria-selected={chartMetricKey === definition.key} aria-controls="metric-trend-panel" className={`metric-tab${chartMetricKey === definition.key ? " metric-tab-active" : ""}`} onClick={() => setChartMetricKey(definition.key)}>{definition.label}</button>)}
          </div>
          {CORE_METRICS.filter((definition) => definition.key === chartMetricKey).map((definition) => <section className="chart-section selected-trend" key={definition.key} id="metric-trend-panel" role="tabpanel" aria-labelledby={`metric-tab-${definition.key}`}>
            <h3>{definition.label} <small>{displayUnit(definition.unit)}</small></h3>
            <TrendChart definition={definition} points={historyByKey[definition.key] || []} />
          </section>)}
          <PeriodComparison seriesByKey={historyByKey} definitions={CORE_METRICS} />
        </>}
      </Panel>

      <Panel id="monthly-performance-heading" title="Monthly performance" note="Approved monthly records only">
        {monthlyStatus === "loading" && <p>Loading monthly history...</p>}
        {monthlyStatus === "error" && <p className="form-error" role="status">{monthlyError}</p>}
        {monthlyStatus === "success" && !monthlyRecords.length && <p>No approved monthly records yet.</p>}
        {monthlyStatus === "success" && monthlyRecords.length > 0 && <>
          <div className="metric-tabs" role="tablist" aria-label="Monthly performance metric">
            {CORE_METRICS.map((definition) => <button key={definition.key} type="button" role="tab" aria-selected={chartMetricKey === definition.key} className={`metric-tab${chartMetricKey === definition.key ? " metric-tab-active" : ""}`} onClick={() => setChartMetricKey(definition.key)}>{definition.label}</button>)}
          </div>
          {CORE_METRICS.filter((definition) => definition.key === chartMetricKey).map((definition) => <div key={definition.key} className="chart-section">
            <h3>{definition.label} <small>{displayUnit(definition.unit)}</small></h3>
            <TrendChart definition={definition} points={monthlyRecords.map((row) => ({
              reporting_period: row.reporting_period, submission_id: row.submission_id,
              value: Number(row[definition.key === "electricity" ? "electricity_kwh" : definition.key === "water" ? "water_m3" : "co2_tco2e"]),
            }))} onSelectSubmission={setSelectedSubmissionId} />
          </div>)}
        </>}
      </Panel>

      <VerificationChart submissions={verificationRecords} />

      <Panel id="consistency-heading" title="Reporting Consistency" note="Coverage by metric and period">
        <p className="panel-caveat">
          Which metrics this project has reported, in which periods, and whether that data passed review.
        </p>
        {consistencyStatus === "loading" && <p>Loading reporting consistency...</p>}
        {consistencyStatus === "error" && (
          <div className="form-error" role="status">{consistencyError}</div>
        )}
        {consistencyStatus === "success" && <ConsistencyMatrix report={consistency} />}
      </Panel>

      <Panel id="submission-records-heading" title="Submission Records" note="Evidence and review outcomes">
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
      </Panel>

      <Panel id="submission-detail-heading" title="Submission Detail" note="Traceability for one submission">
        {submissionsStatus === "success" && requestedSubmissionId !== null && !submissions.some((record) => String(record.submission_id) === requestedSubmissionId) ? <p className="form-error" role="status">This submission is unavailable in the visible project history.</p> : <SubmissionDetailPanel
          detail={submissionDetail}
          status={submissionDetailStatus}
          error={submissionDetailError}
          canInspectEvidence={user?.role === "AUDITOR" || submissionDetail?.status === "APPROVED"}
        />}
      </Panel>
    </section>
  );
}
