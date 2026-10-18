import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { exportMockPreparationPackage, getMockPreparationPackage } from "../services/dataService.js";
import { renderPreparationPackageHtml } from "../mocks/preparationPackage.js";

export function PreparationPackagePage() {
  const { buildingId } = useParams();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    setLoading(true); setSnapshot(null); setError(""); setNotice("");
    try { setSnapshot(await getMockPreparationPackage(buildingId)); }
    catch (failure) { setSnapshot(null); setError(failure.message || "Unable to generate preparation preview."); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, [buildingId]);

  const download = async () => {
    if (!snapshot || String(snapshot.building.project_id) !== buildingId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { filename, html } = await exportMockPreparationPackage(buildingId, snapshot);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice("Standalone HTML report downloaded.");
    } catch (failure) { setError(failure.message || "Unable to export preparation package."); }
    finally { setBusy(false); }
  };

  return <section className="page-panel company-page package-page">
    <div className="package-toolbar"><div><Link to={`/my-buildings/${buildingId}/preparation`}>← Preparation workspace</Link><h1>Preparation Package</h1><p className="demo-label">Unofficial internal report · Mock data</p></div>
      {snapshot && String(snapshot.building.project_id) === buildingId && <div className="package-actions"><button className="secondary-button" type="button" disabled={loading || busy} onClick={refresh}>Refresh preview</button><button className="primary-button" type="button" disabled={loading || busy} onClick={download}>{busy ? "Preparing..." : "Download HTML report"}</button></div>}
    </div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {notice && <p role="status">{notice}</p>}
    {loading && <p>Generating current preparation snapshot...</p>}
    {!loading && snapshot && String(snapshot.building.project_id) === buildingId && <iframe className="package-preview" title="Unofficial certification preparation report preview" sandbox="" srcDoc={renderPreparationPackageHtml(snapshot)} />}
  </section>;
}
