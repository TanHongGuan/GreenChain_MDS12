import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Panel } from "../components/Panel.jsx";
import {
  assignSubmissionAuditors, createOwnedBuilding, getAvailableAuditors, getOwnedBuildings,
  getProjectSubmissions, updateOwnedBuilding,
} from "../services/dataService.js";
import { displayDate } from "../utils/display.js";

// Building administration, kept apart from uploading evidence. A company creates
// and corrects its buildings here, and reads back what has been submitted against
// each one. Nothing on this page can change a submission or remove anything.

function statusClass(status) {
  return `status-pill status-${String(status || "").toLowerCase()}`;
}

// Who reviews one submission. Per submission rather than per building: a quarter
// is what gets reviewed, a company may want different people on different
// quarters, and more than one may be appointed to the same one.
//
// Pick-then-add rather than a tick per auditor: the list of auditors grows with
// the platform, and a column of fifty tick boxes in every table row does not.
// The dropdown is a placeholder for a search by name or email once the list is
// long enough to need one.
function SubmissionAuditors({ submission, auditors, onChanged }) {
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const assigned = submission.auditors || [];
  const assignedIds = assigned.map((item) => item.id);
  const available = auditors.filter((auditor) => !assignedIds.includes(auditor.id));

  async function save(next) {
    setSaving(true);
    setError("");
    try {
      const result = await assignSubmissionAuditors(submission.submission_id, next);
      onChanged(submission.submission_id, result.auditors);
      setChoice("");
    } catch (problem) {
      setError(problem.message || "The auditors could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  const selectId = `add-auditor-${submission.submission_id}`;
  return (
    <div className="submission-auditors">
      {assigned.length > 0 && (
        <ul className="assigned-auditors">
          {assigned.map((auditor) => (
            <li key={auditor.id}>
              <span className="assigned-auditor-name">{auditor.name}</span>
              <button type="button" className="link-button" disabled={saving}
                aria-label={`Remove ${auditor.name} from submission ${submission.submission_id}`}
                onClick={() => save(assignedIds.filter((id) => id !== auditor.id))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {assigned.length === 0 && (
        <p className="submission-auditors-none">Nobody assigned — this cannot be reviewed yet.</p>
      )}
      {available.length > 0 && (
        <div className="auditor-add">
          <label className="visually-hidden" htmlFor={selectId}>
            Add an auditor to submission {submission.submission_id}
          </label>
          <select id={selectId} value={choice} disabled={saving}
            onChange={(event) => setChoice(event.target.value)}>
            <option value="">Select an auditor</option>
            {available.map((auditor) => (
              <option key={auditor.id} value={auditor.id}>{auditor.name} ({auditor.email})</option>
            ))}
          </select>
          <button type="button" className="secondary-button" disabled={saving || !choice}
            onClick={() => save([...assignedIds, choice])}>
            Add as auditor
          </button>
        </div>
      )}
      {error && <p className="form-error" role="status">{error}</p>}
    </div>
  );
}


function BuildingDetail({ building, auditors, onSaved }) {
  const [name, setName] = useState(building.project_name);
  const [location, setLocation] = useState(building.location || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [historyStatus, setHistoryStatus] = useState("loading");

  useEffect(() => {
    let active = true;
    setHistoryStatus("loading");
    getProjectSubmissions(building.project_id).then((records) => {
      if (active) { setSubmissions(records); setHistoryStatus("ready"); }
    }).catch(() => {
      if (active) { setSubmissions([]); setHistoryStatus("error"); }
    });
    return () => { active = false; };
  }, [building.project_id]);

  function updateAuditors(submissionId, assigned) {
    setSubmissions((records) => records.map((record) => record.submission_id === submissionId
      ? { ...record, auditors: assigned } : record));
  }

  const changed = name.trim() !== building.project_name
    || location.trim() !== (building.location || "");

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateOwnedBuilding(building.project_id, {
        name: name.trim(), location: location.trim() || null,
      });
      setNotice("Building details saved.");
      onSaved(updated);
    } catch (problem) {
      setError(problem.message || "Building could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="building-detail">
      <form className="building-edit-form" onSubmit={save}>
        <h3>Building details</h3>
        <p className="building-edit-note">
          Only the name and address can be changed. Submitted data, reporting periods and uploaded
          evidence stay exactly as they were filed.
        </p>
        <div className="building-edit-fields">
          <div className="mapping-field">
            <label htmlFor="building-name">Building name</label>
            <input id="building-name" value={name} onChange={(event) => setName(event.target.value)}
              disabled={saving} maxLength={255} required />
          </div>
          <div className="mapping-field">
            <label htmlFor="building-location">Address / location</label>
            <input id="building-location" value={location} onChange={(event) => setLocation(event.target.value)}
              disabled={saving} maxLength={255} />
          </div>
        </div>
        {error && <p className="form-error" role="status">{error}</p>}
        {notice && <p className="form-success" role="status">{notice}</p>}
        <div className="decision-actions">
          <button type="submit" className="primary-button" disabled={saving || !changed || !name.trim()}>
            {saving ? "Saving..." : "Save changes"}
          </button>
          <Link to={`/projects/${building.project_id}`} className="secondary-button">
            View public project page
          </Link>
        </div>
      </form>

      <h3>Submission history</h3>
      {historyStatus === "loading" && <p>Loading submissions...</p>}
      {historyStatus === "error" && <p className="form-error" role="status">Submission history could not be loaded.</p>}
      {historyStatus === "ready" && submissions.length === 0 && (
        <p>Nothing has been submitted for this building yet. <Link to="/upload">Upload data</Link>.</p>
      )}
      {historyStatus === "ready" && submissions.length > 0 && (
        <div className="metrics-table-wrap">
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Submission</th>
                <th>Period</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Auditors</th>
                <th><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((record) => (
                <tr key={record.submission_id}>
                  <td>#{record.submission_id}</td>
                  <td>{record.reporting_period}</td>
                  <td>{displayDate(record.submitted_at)}</td>
                  <td><span className={statusClass(record.status)}>{record.status}</span></td>
                  <td>
                    <SubmissionAuditors submission={record} auditors={auditors}
                      onChanged={updateAuditors} />
                  </td>
                  <td>
                    <Link to={`/projects/${building.project_id}?submission=${record.submission_id}`}>
                      View details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ManageBuildingsPage() {
  const [buildings, setBuildings] = useState([]);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState(null);

  const [auditors, setAuditors] = useState([]);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    let active = true;
    getOwnedBuildings().then((items) => {
      if (active) { setBuildings(items); setStatus("ready"); }
    }).catch((error) => {
      if (active) { setLoadError(error.message); setStatus("error"); }
    });
    // A failure here leaves the picker empty rather than breaking the page; the
    // rest of building administration does not depend on it.
    getAvailableAuditors().then((items) => {
      if (active) setAuditors(items);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function create(event) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      // The same endpoint the upload page used before; the logic is not duplicated.
      const building = await createOwnedBuilding({
        name: newName.trim(), location: newLocation.trim() || null,
      });
      setBuildings((items) => [...items, building].sort((a, b) => a.project_name.localeCompare(b.project_name)));
      setNewName("");
      setNewLocation("");
      setOpenId(building.project_id);
    } catch (error) {
      setCreateError(error.message || "Building could not be created.");
    } finally {
      setCreating(false);
    }
  }

  function replaceBuilding(updated) {
    setBuildings((items) => items.map((item) => item.project_id === updated.project_id
      ? { ...item, ...updated } : item));
  }

  const open = buildings.find((item) => item.project_id === openId) || null;

  return (
    <section className="page-panel manage-buildings-page">
      <div className="page-heading">
        <p className="eyebrow">Company Workspace</p>
        <h1>Manage Buildings</h1>
        <p>
          The buildings your organisation reports on. Upload evidence against one of them from{" "}
          <Link to="/upload">Upload Data</Link>.
        </p>
      </div>

      <Panel id="create-building" title="Add a building" note="Name and address" level={2}>
        <form className="building-create-form" onSubmit={create}>
          <div className="building-edit-fields">
            <div className="mapping-field">
              <label htmlFor="new-building-name">New building name</label>
              <input id="new-building-name" value={newName} onChange={(event) => setNewName(event.target.value)}
                disabled={creating} maxLength={255} required />
            </div>
            <div className="mapping-field">
              <label htmlFor="new-building-location">New building address</label>
              <input id="new-building-location" value={newLocation} maxLength={255}
                onChange={(event) => setNewLocation(event.target.value)} disabled={creating} />
            </div>
          </div>
          {createError && <p className="form-error" role="status">{createError}</p>}
          <button type="submit" className="primary-button" disabled={creating || !newName.trim()}>
            {creating ? "Creating..." : "Create building"}
          </button>
        </form>
      </Panel>

      <h2 className="detail-subheading">Your buildings</h2>
      {status === "loading" && <p>Loading buildings...</p>}
      {status === "error" && <p className="form-error" role="status">{loadError}</p>}
      {status === "ready" && buildings.length === 0 && (
        <p>No buildings yet. Add one above to start reporting.</p>
      )}
      {status === "ready" && buildings.length > 0 && (
        <ul className="building-list">
          {buildings.map((building) => (
            <li key={building.project_id} className="building-row">
              <div className="building-row-identity">
                <h3>{building.project_name}</h3>
                <p>{building.location || "No address recorded"}</p>
                <p className="building-row-meta">
                  {building.submission_count === 0
                    ? "No submissions yet"
                    : `${building.submission_count} submission${building.submission_count === 1 ? "" : "s"}`}
                  {building.latest_submission && <>
                    {" · latest "}{building.latest_submission.reporting_period}{" "}
                    <span className={statusClass(building.latest_submission.status)}>
                      {building.latest_submission.status}
                    </span>
                  </>}
                </p>

              </div>
              <button type="button" className="secondary-button"
                aria-expanded={openId === building.project_id}
                onClick={() => setOpenId(openId === building.project_id ? null : building.project_id)}>
                {openId === building.project_id ? "Close" : "Open"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <BuildingDetail key={open.project_id} building={open} auditors={auditors}
        onSaved={replaceBuilding} />}
    </section>
  );
}
