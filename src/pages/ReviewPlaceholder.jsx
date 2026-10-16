import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { decideSubmission, evidenceUrl, getPendingReviews, getReviewDetail, getReviewHistory, isMockMode } from "../services/dataService.js";
import { metricDefinition } from "../utils/metrics.js";

function formatDate(value) {
  if (!value) {
    return "Not available";
  }
  return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status) {
  return `status-pill status-${status.toLowerCase()}`;
}

export function ReviewPlaceholder() {
  const [queue, setQueue] = useState([]);
  const [queueStatus, setQueueStatus] = useState("loading");
  const [queueError, setQueueError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [detailError, setDetailError] = useState("");
  const [reason, setReason] = useState("");
  const [decisionStatus, setDecisionStatus] = useState("idle");
  const [decisionNotice, setDecisionNotice] = useState("");
  const [pendingDecision, setPendingDecision] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [filters, setFilters] = useState({ project: "", organisation: "", period: "", search: "" });
  const [history, setHistory] = useState(null);

  const filteredQueue = useMemo(() => queue.filter((item) =>
    (!filters.project || item.project_name === filters.project) &&
    (!filters.organisation || item.organisation === filters.organisation) &&
    (!filters.period || item.reporting_period === filters.period) &&
    (!filters.search || `${item.project_name} ${item.organisation} ${item.submission_id}`.toLowerCase().includes(filters.search.toLowerCase()))
  ), [queue, filters]);
  const needsAcknowledgement = detail && detail.integrity?.status !== "MATCH";

  useEffect(() => {
    if (detail?.status === "UNREVIEWED" && selectedId && !filteredQueue.some((item) => item.submission_id === selectedId)) {
      setSelectedId(null);
      setDetail(null);
      setDetailStatus("idle");
    }
  }, [filteredQueue, selectedId, detail]);

  const isDeciding = decisionStatus === "submitting";

  useEffect(() => {
    let isMounted = true;
    setQueueStatus("loading");
    getPendingReviews()
      .then((submissions) => {
        if (!isMounted) {
          return;
        }
        setQueue(submissions);
        setQueueStatus("success");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setQueueError(error.message || "Unable to load review queue.");
        setQueueStatus("error");
      });
    getReviewHistory().then((items) => { if (isMounted) setHistory(items); }).catch(() => { if (isMounted) setHistory(null); });

    return () => {
      isMounted = false;
    };
  }, []);

  async function openSubmission(submissionId) {
    setSelectedId(submissionId);
    setDetail(null);
    setDetailError("");
    setDecisionNotice("");
    setReason("");
    setPendingDecision(null);
    setAcknowledged(false);
    setDetailStatus("loading");

    try {
      const submission = await getReviewDetail(submissionId);
      setDetail(submission);
      setDetailStatus("success");
    } catch (error) {
      setDetailError(error.message || "Unable to load submission.");
      setDetailStatus("error");
    }
  }

  async function submitDecision(decision) {
    if (!detail || isDeciding) {
      return;
    }
    if (decision === "REJECTED" && !reason.trim()) {
      setDecisionNotice("Enter a reason before rejecting this submission.");
      setDecisionStatus("error");
      return;
    }
    if (decision === "APPROVED" && needsAcknowledgement && !acknowledged) {
      setDecisionNotice("Acknowledge the integrity warning before approving.");
      setDecisionStatus("error");
      return;
    }

    setDecisionStatus("submitting");
    setDecisionNotice("");

    try {
      const result = await decideSubmission(detail.submission_id, decision, reason.trim() || null);
      setDetail((currentDetail) => (currentDetail ? { ...currentDetail, status: result.status } : currentDetail));
      setQueue((currentQueue) => currentQueue.filter((item) => item.submission_id !== detail.submission_id));
      setDecisionNotice(result.reason ? `${result.message} Reason: ${result.reason}` : result.message);
      setDecisionStatus("success");
      setPendingDecision(null);
      if (isMockMode) getReviewHistory().then(setHistory);
    } catch (error) {
      setDecisionNotice(error.message || "Review decision could not be saved.");
      setDecisionStatus("error");
    }
  }

  async function downloadEvidence(path, label) {
    try {
      const response = await fetch(evidenceUrl(path), { credentials: "include" });
      if (!response.ok) throw new Error(`Evidence download failed (${response.status}).`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = label || "evidence";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setDetailError("");
    } catch (error) {
      setDetailError(error.message || "Evidence could not be downloaded.");
    }
  }

  return (
    <section className="page-panel review-page">
      <div className="page-heading">
        <p className="eyebrow">Auditor Workspace</p>
        <h1>Auditor Review</h1>
        {isMockMode && <p className="demo-label">Demo data · Browser session only</p>}
      </div>

      <div className="review-layout">
        <section className="review-queue" aria-label="Pending review queue">
          <h2>Pending submissions <small>({filteredQueue.length} of {queue.length})</small></h2>
          <div className="review-filters" aria-label="Queue filters">
            <label>Project<select value={filters.project} onChange={(event) => setFilters({ ...filters, project: event.target.value })}><option value="">All projects</option>{[...new Set(queue.map((item) => item.project_name))].sort().map((name) => <option key={name}>{name}</option>)}</select></label>
            <label>Organisation<select value={filters.organisation} onChange={(event) => setFilters({ ...filters, organisation: event.target.value })}><option value="">All organisations</option>{[...new Set(queue.map((item) => item.organisation))].sort().map((name) => <option key={name}>{name}</option>)}</select></label>
            <label>Period<select value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value })}><option value="">All periods</option>{[...new Set(queue.map((item) => item.reporting_period))].sort().map((period) => <option key={period}>{period}</option>)}</select></label>
            <label>Search<input type="search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Project or submission ID" /></label>
          </div>
          {queueStatus === "loading" && <p>Loading submissions...</p>}
          {queueStatus === "error" && (
            <div className="form-error" role="status">
              {queueError}
            </div>
          )}
          {queueStatus === "success" && queue.length === 0 && <p>No pending submissions.</p>}
          {queueStatus === "success" && queue.length > 0 && filteredQueue.length === 0 && <p>No submissions match these filters.</p>}
          {filteredQueue.length > 0 && (
            <div className="review-list">
              {filteredQueue.map((submission) => (
                <article className="review-list-item" key={submission.submission_id}>
                  <div>
                    <h3>{submission.project_name} <small>#{submission.submission_id}</small></h3>
                    <p>{submission.organisation}</p>
                    <dl>
                      <div>
                        <dt>Period</dt>
                        <dd>{submission.reporting_period}</dd>
                      </div>
                      <div>
                        <dt>Submitted</dt>
                        <dd>{formatDate(submission.submitted_at)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="review-list-actions">
                    <span className={statusClass(submission.status)}>{submission.status}</span>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => openSubmission(submission.submission_id)}
                    >
                      Open Review
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="review-detail" aria-label="Submission review detail">
          {!selectedId && <p>Select a pending submission to review.</p>}
          {detailStatus === "loading" && <p>Loading submission...</p>}
          {detailStatus === "error" && (
            <div className="form-error" role="status">
              {detailError}
            </div>
          )}
          {detail && (
            <>
              <div className="detail-header">
                <div>
                  <h2>{detail.project_name} <small>Submission #{detail.submission_id}</small></h2>
                  <p>{detail.organisation}</p>
                  {detail.project_id && <Link to={`/projects/${detail.project_id}`}>View project</Link>}
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
                  <dd>{detail.submitted_by?.name || detail.submitted_by?.email || "Not available"}</dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>{formatDate(detail.submitted_at)}</dd>
                </div>
                <div>
                  <dt>Integrity</dt>
                  <dd>{detail.integrity?.status || "UNAVAILABLE"}</dd>
                </div>
              </dl>
              <p className="integrity-note">A matching SHA-256 checks file consistency, not whether reported measurements are true.</p>
              {needsAcknowledgement && <p className="form-warning" role="alert">Integrity is {detail.integrity?.status || "UNAVAILABLE"}. Inspect the evidence before approving.</p>}
              {detailError && <div className="form-error" role="status">{detailError}</div>}

              <div className="evidence-actions">
                {detail.evidence?.original?.url && evidenceUrl(detail.evidence.original.url)
                  ? <button type="button" className="secondary-button" onClick={() => downloadEvidence(detail.evidence.original.url, detail.evidence.original.label)}>Download original</button>
                  : <span>Original file unavailable</span>}
                {detail.evidence?.processed?.url && evidenceUrl(detail.evidence.processed.url)
                  ? <button type="button" className="secondary-button" onClick={() => downloadEvidence(detail.evidence.processed.url, detail.evidence.processed.label)}>Download processed</button>
                  : <span>Processed file unavailable</span>}
              </div>
              {isMockMode && detail.simulated_evidence && <div className="simulated-evidence"><h3>Simulated evidence preview</h3><p>Derived from demo metrics. This is not the uploaded file or an immutable artifact.</p><div><div><h4>Original-style rows</h4><pre>{detail.simulated_evidence.original}</pre></div><div><h4>Processed-style rows</h4><pre>{detail.simulated_evidence.processed}</pre></div></div></div>}

              <h3>Processed Metrics</h3>
              <div className="metrics-table-wrap">
                <table className="metrics-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Value</th>
                      <th>Unit</th>
                      <th>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.metrics.filter((metric) => metricDefinition(metric.metric_name)).map((metric) => (
                      <tr key={`${metric.metric_name}-${metric.unit}`}>
                        <td>{metric.metric_name}</td>
                        <td>{Number(metric.value).toLocaleString("en-MY")}</td>
                        <td>{metric.unit}</td>
                        <td>{metric.category || "Uncategorised"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detail.metrics.some((metric) => !metricDefinition(metric.metric_name)) && <p className="form-warning">Additional metrics exist in this submission but are outside the three-metric review table. Inspect the source evidence before deciding.</p>}

              {detail.status === "UNREVIEWED" && (
                <div className="decision-panel">
                  <label htmlFor="rejection-reason">Decision reason</label>
                  <textarea
                    id="rejection-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={isDeciding}
                    rows="3"
                  />
                  {needsAcknowledgement && <label className="review-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> I acknowledge that integrity is not verified and have inspected the available evidence.</label>}
                  <div className="decision-actions">
                    <button className="primary-button" type="button" onClick={() => setPendingDecision("APPROVED")} disabled={isDeciding}>
                      {isDeciding ? "Saving..." : "Approve"}
                    </button>
                    <button className="danger-button" type="button" onClick={() => setPendingDecision("REJECTED")} disabled={isDeciding}>
                      Reject
                    </button>
                  </div>
                  {pendingDecision && <div className="decision-confirm" role="group" aria-label={`Confirm ${pendingDecision.toLowerCase()}`}>
                    <p>{pendingDecision === "REJECTED" ? "Reject" : "Approve"} submission #{detail.submission_id}? {pendingDecision === "REJECTED" && "A reason is required."}</p>
                    <button type="button" className={pendingDecision === "REJECTED" ? "danger-button" : "primary-button"} onClick={() => submitDecision(pendingDecision)} disabled={isDeciding}>Confirm {pendingDecision === "REJECTED" ? "rejection" : "approval"}</button>
                    <button type="button" className="secondary-button" onClick={() => setPendingDecision(null)} disabled={isDeciding}>Cancel</button>
                  </div>}
                </div>
              )}

              {decisionNotice && (
                <div className={decisionStatus === "success" ? "form-success" : "form-error"} role="status">
                  {decisionNotice}
                </div>
              )}
              {decisionStatus === "success" && detail.project_id && <Link to={`/projects/${detail.project_id}`}>View recorded outcome</Link>}
            </>
          )}
        </section>
      </div>
      {isMockMode && history?.length > 0 && <section className="review-history" aria-labelledby="review-history-heading"><h2 id="review-history-heading">Demo review history</h2><div className="review-history-list">{history.map((item) => <div key={item.submission_id}><strong>#{item.submission_id} · {item.project_name}</strong><span>{item.status}</span><span>{item.review?.reviewer_email || "Demo auditor"}</span><time>{formatDate(item.reviewed_at)}</time><span>{item.reason || "No reason recorded"}</span></div>)}</div></section>}
    </section>
  );
}
