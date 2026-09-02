import { useEffect, useState } from "react";

import { decideSubmission, evidenceUrl, getPendingReviews, getReviewDetail } from "../api/reviewsApi.js";

function formatDate(value) {
  if (!value) {
    return "Not available";
  }
  return new Intl.DateTimeFormat(undefined, {
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

    setDecisionStatus("submitting");
    setDecisionNotice("");

    try {
      const result = await decideSubmission(detail.submission_id, decision, reason.trim() || null);
      setDetail((currentDetail) => (currentDetail ? { ...currentDetail, status: result.status } : currentDetail));
      setQueue((currentQueue) => currentQueue.filter((item) => item.submission_id !== detail.submission_id));
      setDecisionNotice(result.reason ? `${result.message} Reason: ${result.reason}` : result.message);
      setDecisionStatus("success");
    } catch (error) {
      setDecisionNotice(error.message || "Review decision could not be saved.");
      setDecisionStatus("error");
    }
  }

  return (
    <section className="page-panel review-page">
      <div className="page-heading">
        <p className="eyebrow">Auditor Workspace</p>
        <h1>Auditor Review</h1>
      </div>

      <div className="review-layout">
        <section className="review-queue" aria-label="Pending review queue">
          <h2>Pending Submissions</h2>
          {queueStatus === "loading" && <p>Loading submissions...</p>}
          {queueStatus === "error" && (
            <div className="form-error" role="status">
              {queueError}
            </div>
          )}
          {queueStatus === "success" && queue.length === 0 && <p>No pending submissions.</p>}
          {queue.length > 0 && (
            <div className="review-list">
              {queue.map((submission) => (
                <article className="review-list-item" key={submission.submission_id}>
                  <div>
                    <h3>{submission.project_name}</h3>
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
                  <h2>{detail.project_name}</h2>
                  <p>{detail.organisation}</p>
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
                  <dd>{detail.integrity?.status || "Not available"}</dd>
                </div>
              </dl>

              <div className="evidence-actions">
                <a className="secondary-button" href={evidenceUrl(detail.evidence.original.url)} target="_blank" rel="noreferrer">
                  Original Evidence
                </a>
                <a className="secondary-button" href={evidenceUrl(detail.evidence.processed.url)} target="_blank" rel="noreferrer">
                  Processed Evidence
                </a>
              </div>

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
                    {detail.metrics.map((metric) => (
                      <tr key={`${metric.metric_name}-${metric.unit}`}>
                        <td>{metric.metric_name}</td>
                        <td>{metric.value}</td>
                        <td>{metric.unit}</td>
                        <td>{metric.category || "Uncategorised"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
                  <div className="decision-actions">
                    <button className="primary-button" type="button" onClick={() => submitDecision("APPROVED")} disabled={isDeciding}>
                      {isDeciding ? "Saving..." : "Approve"}
                    </button>
                    <button className="danger-button" type="button" onClick={() => submitDecision("REJECTED")} disabled={isDeciding}>
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {decisionNotice && (
                <div className={decisionStatus === "success" ? "form-success" : "form-error"} role="status">
                  {decisionNotice}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
