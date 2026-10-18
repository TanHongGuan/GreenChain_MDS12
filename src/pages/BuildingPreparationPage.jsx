import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { assignMockPreparationConsultant, getMockBuildingPreparation, saveMockCriterionPreparation, selectMockBuildingScheme } from "../services/dataService.js";

function CriterionEditor({ criterion, response, review, submissions, onSave }) {
  const [status, setStatus] = useState(response.status);
  const [note, setNote] = useState(response.note);
  const [links, setLinks] = useState(response.submission_ids);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setSaved(false);
    try { await onSave(criterion.id, { status, note, submission_ids: links }); setSaved(true); }
    catch (failure) { setError(failure.message || "Unable to save evidence availability."); }
    finally { setBusy(false); }
  };
  return <form className="prep-criterion" onSubmit={submit}>
    <div className="prep-criterion-heading"><div><h3>{criterion.id} · {criterion.title}</h3><p>{criterion.summary}</p></div><span className={`prep-status prep-status-${response.status.toLowerCase()}`}>{response.status.replace("_", " ")}</span></div>
    <p><strong>Evidence to prepare:</strong> {criterion.guidance}</p>
    <p className="prep-source">Source: {criterion.source_page}</p>
    <div className="prep-review-note"><strong>Internal preparation review:</strong> {review.status.replaceAll("_", " ")}{review.outdated && " (outdated - another review required)"}
      {review.latest?.feedback && <p>{review.outdated ? "Earlier feedback" : "Consultant feedback"} from {review.latest.reviewer_name}: {review.latest.feedback}</p>}
      {review.history.length > 1 && <details><summary>Review history ({review.history.length})</summary>{review.history.map((item) => <p key={item.id}>{item.reviewer_name} · {item.outcome.replaceAll("_", " ")} · {item.feedback || "No note"}</p>)}</details>}
    </div>
    <label>Evidence availability
      <select value={status} onChange={(event) => { setStatus(event.target.value); setSaved(false); }}>
        <option value="MISSING">Missing</option><option value="PROVIDED">Provided</option><option value="NEEDS_ATTENTION">Needs Attention</option>
      </select>
    </label>
    <fieldset className="prep-evidence"><legend>Supporting submissions from this building</legend>
      {submissions.length ? submissions.map((item) => <label className="prep-submission" key={item.submission_id}>
        <input type="checkbox" checked={links.includes(item.submission_id)} onChange={(event) => { setLinks((current) => event.target.checked ? [...current, item.submission_id] : current.filter((id) => id !== item.submission_id)); setSaved(false); }} />
        <span className="prep-submission-details"><span>#{item.submission_id} · {item.reporting_period} · {item.status}</span><small>{item.metrics.join(" · ")}</small></span>
      </label>) : <p>No submissions for this building yet. Upload data separately, then return to link it.</p>}
    </fieldset>
    {response.stale_submission_ids.length > 0 && <p className="form-error" role="alert">Saved submission reference no longer exists: {response.stale_submission_ids.join(", ")}. Save to remove it.</p>}
    <label>Company note<textarea value={note} maxLength={2000} onChange={(event) => { setNote(event.target.value); setSaved(false); }} rows={3} /></label>
    <div className="prep-actions"><button className="secondary-button" disabled={busy} type="submit">{busy ? "Saving..." : "Save evidence"}</button>{saved && <span role="status">Saved</span>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}

export function BuildingPreparationPage() {
  const { buildingId } = useParams();
  const [data, setData] = useState(null);
  const [categoryId, setCategoryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [consultantId, setConsultantId] = useState("");
  useEffect(() => {
    let active = true;
    getMockBuildingPreparation(buildingId).then((result) => { if (active) { setData(result); setLoading(false); } })
      .catch((failure) => { if (active) { setError(failure.message || "Unable to load preparation."); setLoading(false); } });
    return () => { active = false; };
  }, [buildingId]);

  const selectScheme = async (schemeId) => {
    const confirmed = data.preparation && data.preparation.scheme_id !== schemeId
      ? window.confirm("Change preparation scheme? Existing responses will be kept under the previous scheme and will not carry over.") : false;
    if (data.preparation && data.preparation.scheme_id !== schemeId && !confirmed) return;
    setError("");
    try { const result = await selectMockBuildingScheme(buildingId, schemeId, confirmed); setData(result); setCategoryId(null); }
    catch (failure) { setError(failure.message || "Unable to select scheme."); }
  };
  const saveCriterion = async (criterionId, input) => {
    const result = await saveMockCriterionPreparation(buildingId, criterionId, input);
    setData(result);
  };
  const assignConsultant = async () => {
    const selected = Number(consultantId);
    if (!selected) { setError("Select a demo consultant first."); return; }
    const confirmed = data.assignment && data.assignment.consultant_id !== selected
      ? window.confirm("Reassign this preparation? The former consultant will lose access and existing reviews will require a fresh review.") : false;
    if (data.assignment && data.assignment.consultant_id !== selected && !confirmed) return;
    setError("");
    try { setData(await assignMockPreparationConsultant(buildingId, selected, confirmed)); setConsultantId(""); }
    catch (failure) { setError(failure.message || "Unable to assign consultant."); }
  };
  if (loading) return <section className="page-panel company-page"><p>Loading preparation workspace...</p></section>;
  if (!data) return <section className="page-panel company-page"><div className="form-error" role="alert">{error}</div><Link to="/my-buildings">My Buildings</Link></section>;
  const activeCategory = data.scheme?.categories.find((item) => item.id === categoryId) || data.scheme?.categories[0];
  return <section className="page-panel company-page prep-page">
    <Link to="/my-buildings">← My Buildings</Link>
    <div className="page-heading"><p className="eyebrow">Company workspace · Demo preparation</p><h1>{data.building.project_name}</h1><p>{data.building.organisation}</p></div>
    <p className="demo-label">Evidence preparation only. No official assessment, score, eligibility or certification is calculated.</p>
    {error && <div className="form-error" role="alert">{error}</div>}
    {!data.scheme ? <div className="prep-select"><h2>Select a preparation scheme</h2><p>Choose a source version for this building. This does not submit an application.</p>
      {data.schemes.map((scheme) => <div className="prep-scheme" key={scheme.id}><div><h3>{scheme.abbreviation}</h3><p>{scheme.name}</p><small>{scheme.version}</small></div><button className="secondary-button" onClick={() => selectScheme(scheme.id)}>Select</button></div>)}
    </div> : <>
      <div className="prep-overview"><div><p className="eyebrow">Selected scheme</p><h2>{data.scheme.abbreviation}</h2><p>{data.scheme.version}</p></div><div><p className="eyebrow">Evidence preparation progress</p><strong>{data.summary.percent}%</strong><p>{data.summary.provided} provided · {data.summary.missing} missing · {data.summary.needs_attention} needs attention · {data.summary.total} representative items</p></div></div>
      <div className="prep-package-entry"><Link className="secondary-button" to={`/my-buildings/${buildingId}/package`}>Preview Preparation Package</Link></div>
      <section className="prep-assignment" aria-label="Consultant assignment"><div><h2>Internal consultant review</h2><p>{data.assignment ? `${data.assignment.consultant_name} · Assigned ${new Date(data.assignment.assigned_at).toLocaleDateString()}` : "Unassigned"}</p><p>{data.review_summary.accepted} accepted for preparation · {data.review_summary.needs_revision} need revision · {data.review_summary.pending} pending review</p></div>
        <div className="prep-assign-controls"><label htmlFor="prep-consultant">Demo consultant</label><select id="prep-consultant" value={consultantId} onChange={(event) => setConsultantId(event.target.value)}><option value="">Select consultant</option>{data.consultants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="secondary-button" type="button" onClick={assignConsultant}>{data.assignment ? "Reassign" : "Assign"}</button></div>
      </section>
      <details className="prep-change"><summary>Change preparation scheme</summary>{data.schemes.filter((item) => item.id !== data.scheme.id).map((scheme) => <button className="secondary-button" key={scheme.id} onClick={() => selectScheme(scheme.id)}>{scheme.abbreviation} · {scheme.version}</button>)}</details>
      <div className="prep-layout"><nav aria-label="Preparation categories" className="prep-categories">{data.scheme.categories.map((category) => <button key={category.id} type="button" className={category.id === activeCategory.id ? "active" : ""} onClick={() => setCategoryId(category.id)}><span className="prep-category-name">{category.id} · {category.name}</span><span className="prep-category-count">{category.criteria.length}</span></button>)}</nav>
        <div className="prep-content"><h2>{activeCategory.name}</h2>{activeCategory.alternate_name && <p>Also labelled “{activeCategory.alternate_name}” in the source allocation table.</p>}{activeCategory.criteria.map((criterion) => <CriterionEditor key={`${data.preparation.id}-${criterion.id}`} criterion={criterion} response={data.responses[criterion.id]} review={data.reviews[criterion.id]} submissions={data.submissions} onSave={saveCriterion} />)}</div></div>
      <p className="prep-disclaimer">Source: {data.scheme.source}. These are representative preparation prompts, not the complete official criteria or an assessment result.</p>
    </>}
  </section>;
}
