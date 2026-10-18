import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import { DEMO_ORGANISATIONS } from "../mocks/identity.js";
import { createMockBuilding, getOwnedMockBuilding, updateMockBuilding } from "../services/dataService.js";

export function BuildingFormPage() {
  const { buildingId } = useParams();
  const isEditing = Boolean(buildingId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(isEditing ? "loading" : "ready");
  const [error, setError] = useState("");
  const organisation = DEMO_ORGANISATIONS.find((item) => item.id === user?.organisation_id);

  useEffect(() => {
    if (!isEditing) return;
    let active = true;
    getOwnedMockBuilding(buildingId).then((building) => {
      if (!active) return;
      setName(building.project_name);
      setLocation(building.location || "");
      setDescription(building.description || "");
      setStatus("ready");
    }).catch((failure) => {
      if (active) { setError(failure.message || "Unable to load building."); setStatus("error"); }
    });
    return () => { active = false; };
  }, [buildingId, isEditing]);

  async function handleSave(event) {
    event.preventDefault();
    setError("");
    if (!name.trim()) { setError("Building name is required."); return; }
    setStatus("saving");
    try {
      const fields = { project_name: name, location, description };
      if (isEditing) await updateMockBuilding(buildingId, fields);
      else await createMockBuilding(fields);
      navigate("/my-buildings", { replace: true });
    } catch (failure) {
      setError(failure.message || "Unable to save building.");
      setStatus("ready");
    }
  }

  return <section className="page-panel company-page">
    <div className="page-heading"><p className="eyebrow">Company workspace</p><h1>{isEditing ? "Edit Building" : "Create Building"}</h1><p className="demo-label">Demo data · Browser session only</p></div>
    <Link to="/my-buildings" className="text-button">Back to My Buildings</Link>
    {status === "loading" && <p>Loading building...</p>}
    {status === "error" && <div className="form-error" role="alert">{error}</div>}
    {(status === "ready" || status === "saving") && <form className="building-form" onSubmit={handleSave} noValidate>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div><span className="building-form-label">Organisation</span><p>{organisation?.name || "Demo organisation"}</p></div>
      <label htmlFor="building-name">Building name</label>
      <input id="building-name" value={name} maxLength={255} onChange={(event) => setName(event.target.value)} disabled={status === "saving"} required />
      <label htmlFor="building-location">Location</label>
      <input id="building-location" value={location} maxLength={255} onChange={(event) => setLocation(event.target.value)} disabled={status === "saving"} />
      <label htmlFor="building-description">Description</label>
      <textarea id="building-description" value={description} maxLength={1000} rows={4} onChange={(event) => setDescription(event.target.value)} disabled={status === "saving"} />
      <div className="decision-actions"><button className="primary-button" type="submit" disabled={status === "saving"}>{status === "saving" ? "Saving..." : isEditing ? "Save changes" : "Create building"}</button><Link className="secondary-button" to="/my-buildings">Cancel</Link></div>
    </form>}
  </section>;
}
