import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Panel } from "../components/Panel.jsx";
import {
  assignBuildingAuditor, createOwnedBuilding, getAvailableAuditors, getOwnedBuildings,
  getProjectSubmissions, updateOwnedBuilding,
} from "../services/dataService.js";
import { displayDate } from "../utils/display.js";

// Building administration, kept apart from uploading evidence. A company creates
// and corrects its buildings here, and reads back what has been submitted against
// each one. Nothing on this page can change a submission or remove anything.

function statusClass(status) {
  return `status-pill status-${String(status || "").toLowerCase()}`;
}

// Appointing the auditor is its own control, not part of the name-and-address
// form: it decides who may review this building's evidence, and until it is set
// the building's submissions reach nobody's queue.
function AuditorAppointment({ building, auditors, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const appointed = building.auditor?.id || "";

  async function choose(auditorId) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await assignBuildingAuditor(building.project_id, auditorId || null);
      onSaved(updated);
      setNotice(updated.auditor
        ? `${updated.auditor.name} will review this building.`
        : "Auditor removed. This building's submissions now reach nobody until you appoint one.");
    } catch (problem) {
      setError(problem.message || "The auditor could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auditor-appointment">
      <h3>Auditor</h3>
      <div className="mapping-field">
        <label htmlFor="building-auditor">Who reviews this building</label>
        <select id="building-auditor" value={appointed} disabled={saving || !auditors.length}
          onChange={(event) => choose(event.target.value)}>
          <option value="">No auditor appointed</option>
          {auditors.map((auditor) => (
            <option key={auditor.id} value={auditor.id}>{auditor.name} ({auditor.email})</option>
          ))}
        </select>
      </div>
      {!appointed && <p className="form-warning" role="status">
        Submissions for this building will not appear in any auditor&apos;s queue, and cannot be
        approved, until you appoint one.
      </p>}
      {error && <p className="form-error" role="status">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
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

      <AuditorAppointment building={building} auditors={auditors} onSaved={onSaved} />

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
                <p className="building-row-meta">
                  {building.auditor
                    ? <>Auditor: {building.auditor.name}</>
                    : <span className="building-row-unassigned">No auditor appointed</span>}
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
