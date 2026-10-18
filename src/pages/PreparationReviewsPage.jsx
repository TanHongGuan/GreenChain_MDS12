import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAssignedMockPreparation, getAssignedMockPreparations, reviewMockPreparationCriterion } from "../services/dataService.js";

function ReviewCriterion({ criterion, response, review, submissions, onSave }) {
  const [outcome, setOutcome] = useState(review.current?.outcome || "");
  const [feedback, setFeedback] = useState(review.current?.feedback || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const linked = submissions.filter((item) => response.submission_ids.includes(item.submission_id));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setSaved(false);
    try { await onSave(criterion.id, outcome, feedback); setSaved(true); }
    catch (failure) { setError(failure.message || "Unable to save internal review."); }
    finally { setBusy(false); }
  };
  return <form className="prep-criterion" onSubmit={submit}>
    <div className="prep-criterion-heading"><h3>{criterion.id} · {criterion.title}</h3><span className="prep-status">{review.status.replaceAll("_", " ")}</span></div>
    <p>{criterion.summary}</p><p><strong>Evidence guidance:</strong> {criterion.guidance}</p><p className="prep-source">Source: {criterion.source_page}</p>
    <div className="prep-review-note"><strong>Company evidence:</strong> {response.status.replaceAll("_", " ")}<p>{response.note || "No company note."}</p>
      <strong>Linked submissions</strong>{linked.length ? <ul>{linked.map((item) => <li key={item.submission_id}>#{item.submission_id} · {item.reporting_period} · {item.status} · {item.metrics.join(", ")}</li>)}</ul> : <p>No current submission links.</p>}
      {response.stale_submission_ids.length > 0 && <p>Unavailable references: {response.stale_submission_ids.join(", ")}</p>}
    </div>
    {review.outdated && <p className="prep-outdated">Earlier review is outdated; this evidence requires a fresh internal review.</p>}
    {review.history.length > 0 && <details><summary>Internal review history ({review.history.length})</summary>{review.history.map((item) => <p key={item.id}>{item.reviewer_name} · {item.outcome.replaceAll("_", " ")} · {item.feedback || "No note"} · {new Date(item.reviewed_at).toLocaleString()}</p>)}</details>}
    <label>Internal review outcome<select value={outcome} onChange={(event) => { setOutcome(event.target.value); setSaved(false); }} required><option value="">Select outcome</option><option value="ACCEPTED_FOR_PREPARATION">Accepted for Preparation</option><option value="NEEDS_REVISION">Needs Revision</option></select></label>
    <label>Consultant feedback<textarea rows={3} maxLength={2000} value={feedback} onChange={(event) => { setFeedback(event.target.value); setSaved(false); }} required={outcome === "NEEDS_REVISION"} /></label>
    <div className="prep-actions"><button className="secondary-button" disabled={busy} type="submit">{busy ? "Saving..." : "Save internal review"}</button>{saved && <span role="status">Saved</span>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}

export function PreparationReviewsPage() {
  const { preparationId } = useParams();
  const [data, setData] = useState(null);
  const [categoryId, setCategoryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setData(null);
    const request = preparationId ? getAssignedMockPreparation(preparationId) : getAssignedMockPreparations();
    request.then((result) => { if (active) { setData(result); setLoading(false); } })
      .catch((failure) => { if (active) { setError(failure.message || "Unable to load preparation reviews."); setLoading(false); } });
    return () => { active = false; };
  }, [preparationId]);
  const save = async (criterionId, outcome, feedback) => {
    const updated = await reviewMockPreparationCriterion(preparationId, criterionId, outcome, feedback);
    setData(updated);
  };
  if (loading || (!error && (preparationId ? data?.preparation?.id !== Number(preparationId) : !Array.isArray(data)))) return <section className="page-panel company-page"><p>Loading preparation reviews...</p></section>;
  if (error) return <section className="page-panel company-page"><div className="form-error" role="alert">{error}</div><Link to="/preparation-reviews">Preparation Reviews</Link></section>;
  if (!preparationId) return <section className="page-panel company-page"><div className="page-heading"><p className="eyebrow">Consultant workspace · Mock</p><h1>Preparation Reviews</h1></div><p className="demo-label">Internal evidence review only. This is not an official GBI or GreenRE assessment.</p>
    {!data.length ? <p>No certification preparations are currently assigned to you.</p> : <div className="company-list" role="list" aria-label="Assigned preparations">{data.map((item) => <article className="company-list-row" role="listitem" key={item.preparation_id}><div className="company-list-main"><h2>{item.building.project_name}</h2><p>{item.building.organisation} · {item.scheme.abbreviation} · {item.scheme.version}</p><p>Updated {new Date(item.updated_at).toLocaleDateString()}</p></div><div className="company-list-summary"><strong>{item.summary.percent}%</strong><span>evidence preparation</span><small>{item.review_summary.pending} pending · {item.review_summary.needs_revision} need revision</small></div><Link className="secondary-button" to={`/preparation-reviews/${item.preparation_id}`}>Open review</Link></article>)}</div>}
  </section>;
  const category = data.scheme.categories.find((item) => item.id === categoryId) || data.scheme.categories[0];
  return <section className="page-panel company-page prep-page"><Link to="/preparation-reviews">← Preparation Reviews</Link><div className="page-heading"><p className="eyebrow">Internal consultant review · Mock</p><h1>{data.building.project_name}</h1><p>{data.building.organisation} · {data.scheme.abbreviation} · {data.scheme.version}</p></div><p className="demo-label">Internal preparation feedback only. No official certification result or score is issued.</p>
    <div className="prep-overview"><div><p className="eyebrow">Company evidence preparation</p><strong>{data.summary.percent}%</strong><p>{data.summary.provided} provided · {data.summary.missing} missing · {data.summary.needs_attention} needs attention</p></div><div><p className="eyebrow">Internal review</p><p>{data.review_summary.accepted} accepted for preparation · {data.review_summary.needs_revision} need revision · {data.review_summary.pending} pending</p></div></div>
    <div className="prep-layout"><nav aria-label="Preparation categories" className="prep-categories">{data.scheme.categories.map((item) => <button key={item.id} type="button" className={item.id === category.id ? "active" : ""} onClick={() => setCategoryId(item.id)}>{item.id} · {item.name} <span>{item.criteria.length}</span></button>)}</nav><div className="prep-content"><h2>{category.name}</h2>{category.criteria.map((criterion) => <ReviewCriterion key={`${data.preparation.id}-${criterion.id}`} criterion={criterion} response={data.responses[criterion.id]} review={data.reviews[criterion.id]} submissions={data.submissions} onSave={save} />)}</div></div>
  </section>;
}
