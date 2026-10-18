import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getOwnedMockBuildings } from "../services/dataService.js";

export function MyBuildingsPage() {
  const [buildings, setBuildings] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getOwnedMockBuildings().then((items) => {
      if (active) { setBuildings(items); setStatus("success"); }
    }).catch((failure) => {
      if (active) { setError(failure.message || "Unable to load buildings."); setStatus("error"); }
    });
    return () => { active = false; };
  }, []);

  return <section className="page-panel company-page">
    <div className="page-heading company-heading">
      <div><p className="eyebrow">Company workspace</p><h1>My Buildings</h1><p className="demo-label">Demo data · Browser session only</p></div>
      <Link className="primary-button" to="/my-buildings/new">Create building</Link>
    </div>
    {status === "loading" && <p>Loading your buildings...</p>}
    {status === "error" && <div className="form-error" role="alert">{error}</div>}
    {status === "success" && buildings.length === 0 && <div className="company-empty"><p>No buildings in your demo organisation yet.</p><Link to="/my-buildings/new" className="secondary-button">Create building</Link></div>}
    {status === "success" && buildings.length > 0 && <div className="company-list" role="list" aria-label="Your buildings">
      {buildings.map((building) => <article className="company-list-row" role="listitem" key={building.project_id}>
        <div className="company-list-main"><h2>{building.project_name}</h2><p>{building.location || "Location not set"} · {building.organisation}</p>{building.description && <p className="company-description">{building.description}</p>}</div>
        <div className="company-list-summary"><strong>{building.submission_count}</strong><span>submission{building.submission_count === 1 ? "" : "s"}</span><small>{building.latest_submission ? `Latest: ${building.latest_submission.reporting_period} · ${building.latest_submission.status}` : "No submissions yet"}</small></div>
        <div className="company-row-actions"><Link className="secondary-button" to={`/projects/${building.project_id}`}>View</Link><Link className="secondary-button" to={`/my-buildings/${building.project_id}/edit`}>Edit</Link><Link className="secondary-button" to={`/upload?building=${building.project_id}`}>Upload</Link><Link className="secondary-button" to={`/my-buildings/${building.project_id}/preparation`}>Preparation</Link></div>
      </article>)}
    </div>}
  </section>;
}
