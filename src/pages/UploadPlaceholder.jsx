import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Panel } from "../components/Panel.jsx";

import { createOwnedBuilding, createSubmission, getOwnedBuildings, previewSubmissionMapping } from "../services/dataService.js";
import { parseUploadCsv, readTextFile } from "../utils/uploadPreview.js";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx"];
const MAPPING_FIELDS = [
  ["reporting_period", "Reporting month", ["month"]],
  ["electricity_kwh", "Electricity", ["kWh", "MWh"]],
  ["water_m3", "Water", ["m3", "L"]],
  ["co2_tco2e", "CO₂ emissions", ["tCO2e", "kgCO2e"]],
];

function fileExtension(filename) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex === -1 ? "" : filename.slice(dotIndex).toLowerCase();
}

function validateForm({ projectName, organisation, reportingPeriod, file }) {
  const errors = {};

  if (!projectName.trim()) {
    errors.projectName = "Project / Building name is required.";
  }
  if (!organisation.trim()) {
    errors.organisation = "Organisation is required.";
  }
  if (!reportingPeriod.trim()) {
    errors.reportingPeriod = "Reporting period is required.";
  } else if (!/^\d{4}-Q[1-4]$/.test(reportingPeriod.trim())) {
    errors.reportingPeriod = "Use a quarterly period such as 2026-Q1.";
  }
  if (!file) {
    errors.file = "Choose a CSV or XLSX file.";
  } else if (!ACCEPTED_EXTENSIONS.includes(fileExtension(file.name))) {
    errors.file = "Only CSV and XLSX files are supported.";
  } else if (file.size > 25 * 1024 * 1024) {
    errors.file = "File must be 25 MB or smaller.";
  }

  return errors;
}

export function UploadPlaceholder() {
  const [projectName, setProjectName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [year, setYear] = useState("");
  const [quarter, setQuarter] = useState("");
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [notice, setNotice] = useState("");
  const [stage, setStage] = useState("form");
  const [previewRows, setPreviewRows] = useState([]);
  const [result, setResult] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [buildingsStatus, setBuildingsStatus] = useState("loading");
  const [projectId, setProjectId] = useState("");
  const [newBuildingName, setNewBuildingName] = useState("");
  const [newBuildingLocation, setNewBuildingLocation] = useState("");
  const [showNewBuilding, setShowNewBuilding] = useState(false);
  const [buildingError, setBuildingError] = useState("");
  const [preview, setPreview] = useState({ kind: "legacy", rows: [] });
  const [mappingPreview, setMappingPreview] = useState(null);
  const [mappingDraft, setMappingDraft] = useState([]);
  const [mappingReviewed, setMappingReviewed] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    getOwnedBuildings().then((items) => {
      if (active) { setBuildings(items); setBuildingsStatus("ready"); }
    }).catch((error) => {
      if (active) { setBuildingError(error.message); setBuildingsStatus("error"); }
    });
    return () => { active = false; };
  }, []);

  const isBusy = status === "validating" || status === "uploading";
  const reportingPeriod = year && quarter ? `${year}-${quarter}` : "";
  const duplicateNames = [...new Set(previewRows.map((row) => row.metric_name).filter((name, index) => previewRows.findIndex((row) => row.metric_name === name) !== index))];

  function chooseBuilding(value) {
    setProjectId(value);
    const building = buildings.find((item) => String(item.project_id) === value);
    if (building) {
      setProjectName(building.project_name);
      setOrganisation(building.organisation);
    }
  }

  async function addBuilding() {
    setBuildingError("");
    try {
      const building = await createOwnedBuilding({ name: newBuildingName.trim(), location: newBuildingLocation.trim() });
      setBuildings((items) => [...items, building]);
      setProjectId(String(building.project_id));
      setProjectName(building.project_name);
      setOrganisation(building.organisation);
      setShowNewBuilding(false);
      setNewBuildingName("");
      setNewBuildingLocation("");
    } catch (error) {
      setBuildingError(error.message || "Building could not be created.");
    }
  }

  function selectFile(nextFile) {
    setFile(nextFile || null);
    setNotice("");
    setErrors((currentErrors) => ({ ...currentErrors, file: undefined }));
    setPreviewRows([]);
    setPreview({ kind: "legacy", rows: [] });
    setMappingPreview(null);
    setMappingDraft([]);
    setMappingReviewed(false);
    setStage("form");
  }

  function handleDrop(event) {
    event.preventDefault();
    if (isBusy) {
      return;
    }
    selectFile(event.dataTransfer.files?.[0]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isBusy) {
      return;
    }

    setStatus("validating");
    setNotice("");
    const nextErrors = validateForm({ projectName, organisation, reportingPeriod, file });
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setStatus("error");
      return;
    }

    try {
      let needsMappingPreview = fileExtension(file.name) === ".xlsx" && Boolean(projectId);
      if (fileExtension(file.name) === ".csv") {
        try {
          const parsed = parseUploadCsv(await readTextFile(file));
          if (parsed.kind === "monthly" && !projectId) throw new Error("Select an owned building for monthly data.");
          setPreview(parsed);
          setPreviewRows(parsed.rows);
        } catch (error) {
          if (!projectId) throw error;
          needsMappingPreview = true;
        }
      } else setPreviewRows([]);
      if (needsMappingPreview) {
        const proposed = await previewSubmissionMapping(file);
        if (proposed.kind === "ai_mapping") {
          setMappingPreview(proposed);
          setMappingDraft(MAPPING_FIELDS.map(([field]) => proposed.mapping.mappings.find((item) => item.field === field) || {
            field, worksheet: "", header_row: 1, header: "", source_unit: "", missing: true, ambiguous: true,
          }));
          setStatus("idle");
          setStage("mapping");
          return;
        }
      }
      setStatus("idle");
      setStage("confirm");
    } catch (error) {
      setStatus("error");
      setErrors({ file: error.message || "File could not be previewed." });
    }
  }

  async function confirmUpload() {
    setStatus("uploading");
    setNotice("");
    try {
      const result = await createSubmission({
        projectName: projectName.trim(),
        organisation: organisation.trim(),
        reportingPeriod: reportingPeriod.trim(),
        file,
        projectId: projectId || null,
        confirmedMapping: mappingPreview ? { mappings: mappingDraft.map((item) => ({ ...item, missing: false, ambiguous: false })), warnings: mappingPreview.mapping.warnings } : null,
      });
      setStatus("success");
      setNotice(`Submission #${result.submission_id} is ${result.status}.`);
      setResult(result);
      setStage("success");
      setProjectName("");
      setOrganisation("");
      setProjectId("");
      setYear("");
      setQuarter("");
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (error) {
      setStatus("error");
      setNotice(error.message || "Unable to upload submission.");
    }
  }

  function updateMapping(field, changes) {
    setMappingDraft((items) => items.map((item) => item.field === field ? { ...item, ...changes } : item));
    setMappingReviewed(false);
  }

  const mappingOptions = mappingPreview?.sheets.flatMap((sheet) => sheet.candidates.flatMap((candidate) =>
    candidate.columns.map((column) => ({ worksheet: sheet.worksheet, header_row: candidate.header_row, ...column })))) || [];
  const mappingReferences = mappingDraft.map((item) => `${item.worksheet}|${item.header_row}|${item.column_ref}`);
  const mappingComplete = mappingDraft.length === 4 && mappingDraft.every((item) => item.worksheet && item.header && item.column_ref && item.source_unit &&
    (item.field === "reporting_period" || item.period_column_ref)) && new Set(mappingReferences).size === 4;

  return (
    <section className="page-panel upload-page">
      <div className="page-heading">
        <p className="eyebrow">Uploader Workspace</p>
        <h1>Upload Data</h1>
      </div>

      {stage === "success" ? <div className="upload-result" role="status">
        <p className="form-success">{notice}</p>
        <p>{result?.input_format?.startsWith("MONTHLY") && result?.processing_status === "COMPLETED" ? `Processed ${result.monthly_record_count} monthly record${result.monthly_record_count === 1 ? "" : "s"} from ${result.input_format}. ` : "Your submission was accepted by the backend. "}Awaiting auditor review.</p>
        {result?.project_id && <Link to={`/projects/${result.project_id}`} className="secondary-button">View project</Link>}
        <button type="button" className="secondary-button" onClick={() => { setStage("form"); setNotice(""); setResult(null); }}>New submission</button>
      </div> : null}

      {stage === "mapping" && <section className="upload-confirm" aria-labelledby="mapping-heading">
        <h2 id="mapping-heading">Review detected columns</h2>
        <p>Suggested by {mappingPreview.model}. Check every source column and unit before processing. No measurements have been uploaded yet.</p>
        {mappingPreview.mapping.warnings.map((warning, index) => <p className="form-warning" key={index}>{warning}</p>)}
        <div className="upload-mapping-grid">
          {MAPPING_FIELDS.map(([field, label, units]) => {
            const item = mappingDraft.find((entry) => entry.field === field);
            const reference = mappingOptions.find((option) => option.worksheet === item.worksheet && option.header_row === item.header_row && option.column_ref === item.column_ref);
            const periodOptions = mappingOptions.filter((option) => option.worksheet === item.worksheet && option.header_row === item.header_row && /date|month|period|year/i.test(option.header));
            return <div key={field} className="upload-mapping-row">
              <label htmlFor={`mapping-${field}`}>{label}</label>
              <select id={`mapping-${field}`} value={reference ? JSON.stringify(reference) : ""} onChange={(event) => updateMapping(field, event.target.value ? { ...JSON.parse(event.target.value), period_column_ref: "", missing: false, ambiguous: false } : { worksheet: "", header: "", column_ref: "", period_column_ref: "", missing: true })}>
                <option value="">Select source column</option>
                {mappingOptions.map((option) => <option key={`${option.worksheet}-${option.header_row}-${option.column_ref}`} value={JSON.stringify(option)}>{option.worksheet} · {option.header} ({option.column_ref})</option>)}
              </select>
              {field !== "reporting_period" && <><label htmlFor={`period-${field}`}>Period column on this worksheet</label>
                <select id={`period-${field}`} value={item.period_column_ref || ""} onChange={(event) => updateMapping(field, { period_column_ref: event.target.value })}>
                  <option value="">Select month column</option>
                  {periodOptions.map((option) => <option key={option.column_ref} value={option.column_ref}>{option.header} ({option.column_ref})</option>)}
                </select></>}
              <label htmlFor={`unit-${field}`}>Source unit</label>
              <select id={`unit-${field}`} value={units.includes(item.source_unit) ? item.source_unit : ""} onChange={(event) => updateMapping(field, { source_unit: event.target.value, ambiguous: false })}>
                <option value="">Select unit</option>{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
              {(item.missing || item.ambiguous) && <span className="field-error">AI marked this field as uncertain. Verify the selection.</span>}
            </div>;
          })}
        </div>
        <h3>Sample rows (read-only)</h3>
        {mappingPreview.sheets.filter((sheet) => sheet.candidates.length).map((sheet) => sheet.candidates.map((candidate) =>
          <div key={`${sheet.worksheet}-${candidate.header_row}`} className="metrics-table-wrap"><h4>{sheet.worksheet}</h4>
            <table className="metrics-table"><thead><tr>{candidate.columns.map((column) => <th key={column.column_ref}>{column.header} ({column.column_ref})</th>)}</tr></thead>
              <tbody>{candidate.sample_rows.map((row, rowIndex) => <tr key={rowIndex}>{candidate.columns.map((column) => <td key={column.column_ref}>{row[[...column.column_ref].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0) - 1] || "—"}</td>)}</tr>)}</tbody></table>
          </div>))}
        <p className="form-warning">Daily readings and cumulative meters need explicit aggregation rules and cannot be processed by this monthly mapper. An incoming total must not be added to its submeters.</p>
        <label className="mapping-review-check"><input type="checkbox" checked={mappingReviewed} onChange={(event) => setMappingReviewed(event.target.checked)} /> I verified the four columns and their units against my file.</label>
        {!mappingComplete && <p className="field-error">Select four distinct columns, their units, and a month column for each metric worksheet.</p>}
        <div className="decision-actions"><button type="button" className="primary-button" disabled={!mappingComplete || !mappingReviewed} onClick={() => setStage("confirm")}>Continue to confirmation</button><button type="button" className="secondary-button" onClick={() => setStage("form")}>Back / edit</button></div>
      </section>}

      {stage === "confirm" && <section className="upload-confirm" aria-labelledby="confirm-heading">
        <h2 id="confirm-heading">Confirm submission</h2>
        <dl className="detail-grid"><div><dt>Project</dt><dd>{projectName}</dd></div><div><dt>Organisation</dt><dd>{organisation}</dd></div><div><dt>Period</dt><dd>{reportingPeriod}</dd></div><div><dt>File</dt><dd>{file?.name} ({(file?.size / 1024).toFixed(1)} KB)</dd></div></dl>
        <p>Frontend preview only. The backend validates the final upload. {fileExtension(file?.name || "") === ".csv" ? `${previewRows.length} parsed row${previewRows.length === 1 ? "" : "s"}.` : ""}</p>
        {mappingPreview && <p>Confirmed AI-assisted mapping for {mappingDraft.length} fields. The backend will validate all rows and perform unit conversions.</p>}
        {duplicateNames.length > 0 && <p className="form-warning" role="status">Repeated metric names: {duplicateNames.join(", ")}. Review these rows before submitting.</p>}
        {previewRows.length ? <div className="metrics-table-wrap"><table className="metrics-table"><thead><tr>{(preview.kind === "monthly" ? preview.columns : ["Metric", "Value", "Unit", "Category"]).map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>
          {previewRows.slice(0, 10).map((row, index) => <tr key={index}>{(preview.kind === "monthly" ? preview.columns.map((name) => row[name]) : [row.metric_name, row.value, row.unit, row.category || "—"]).map((value, column) => <td key={column}>{value}</td>)}</tr>)}
        </tbody></table></div> : <p>{mappingPreview ? "The backend will extract data using the confirmed mapping." : "XLSX preview is unavailable in the browser; backend validation runs on confirmation."}</p>}
        {previewRows.length > 10 && <p>Showing the first 10 of {previewRows.length} rows.</p>}
        {notice && <div className="form-error" role="status">{notice}</div>}
        <div className="decision-actions"><button type="button" className="primary-button" onClick={confirmUpload} disabled={isBusy}>{isBusy ? "Uploading..." : "Confirm upload"}</button><button type="button" className="secondary-button" onClick={() => { setStage("form"); setStatus("idle"); }} disabled={isBusy}>Back / edit</button><button type="button" className="secondary-button" onClick={() => { setStage("form"); selectFile(null); if (inputRef.current) inputRef.current.value = ""; }} disabled={isBusy}>Cancel</button></div>
      </section>}

      {stage === "form" &&
      <form className="upload-form" onSubmit={handleSubmit} noValidate>
        {notice && (
          <div className={status === "success" ? "form-success" : "form-error"} role="status">
            {notice}
          </div>
        )}

        <label htmlFor="owned-building">Owned building</label>
        <select id="owned-building" value={projectId} onChange={(event) => chooseBuilding(event.target.value)} disabled={isBusy || buildingsStatus === "loading"}>
          <option value="">Use legacy project name below</option>
          {buildings.map((building) => <option key={building.project_id} value={building.project_id}>{building.project_name}</option>)}
        </select>
        {buildingsStatus === "loading" && <p>Loading owned buildings...</p>}
        {buildingsStatus === "error" && <p className="form-error" role="status">{buildingError}</p>}
        {buildingsStatus === "ready" && !buildings.length && <p>No owned buildings yet. Create one to upload monthly data.</p>}
        <button type="button" className="secondary-button" onClick={() => setShowNewBuilding((value) => !value)}>Create building</button>
        {showNewBuilding && <div className="upload-building-fields">
          <label htmlFor="new-building-name">Building name</label><input id="new-building-name" value={newBuildingName} onChange={(event) => setNewBuildingName(event.target.value)} />
          <label htmlFor="new-building-location">Location</label><input id="new-building-location" value={newBuildingLocation} onChange={(event) => setNewBuildingLocation(event.target.value)} />
          <button type="button" className="secondary-button" onClick={addBuilding} disabled={!newBuildingName.trim()}>Save building</button>
          {buildingError && <p className="form-error" role="status">{buildingError}</p>}
        </div>}

        <label htmlFor="project-name">Project / Building name</label>
        <input
          id="project-name"
          name="project-name"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          disabled={isBusy || Boolean(projectId)}
        />
        {errors.projectName && <span className="field-error">{errors.projectName}</span>}

        <label htmlFor="organisation">Organisation</label>
        <input
          id="organisation"
          name="organisation"
          value={organisation}
          onChange={(event) => setOrganisation(event.target.value)}
          disabled={isBusy || Boolean(projectId)}
        />
        {errors.organisation && <span className="field-error">{errors.organisation}</span>}

        <div className="period-fields"><label htmlFor="reporting-year">Reporting year<input id="reporting-year" inputMode="numeric" type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} disabled={isBusy} placeholder="2026" /></label><label htmlFor="reporting-quarter">Quarter<select id="reporting-quarter" value={quarter} onChange={(event) => setQuarter(event.target.value)} disabled={isBusy}><option value="">Select quarter</option>{[1, 2, 3, 4].map((number) => <option key={number} value={`Q${number}`}>Q{number}</option>)}</select></label></div>
        {reportingPeriod && <p>Reporting period: {reportingPeriod}</p>}
        {errors.reportingPeriod && <span className="field-error">{errors.reportingPeriod}</span>}

        <Panel id="file-requirements-heading" title="File requirements" note="CSV or XLSX · up to 25 MiB"><p>Monthly standard: <code>reporting_period,electricity_kwh,water_m3,co2_tco2e</code>. Alternative: <code>Month,Electricity (MWh),Water (Litres),Carbon (kgCO2e)</code>. Select an owned building; all months must match the selected quarter. XLSX monthly data must be on a <code>Monthly_Data</code> sheet.</p><p>Legacy format remains available: <code>metric_name,value,unit</code> with optional <code>category</code>.</p><a href="/greenchain-sample.csv" download className="secondary-button">Download legacy sample CSV</a></Panel>
        <label htmlFor="submission-file">Submission file</label>
        <div
          className="drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          data-has-file={file ? "true" : "false"}
        >
          <input
            ref={inputRef}
            id="submission-file"
            name="submission-file"
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => selectFile(event.target.files?.[0])}
            disabled={isBusy}
          />
          <p>{file ? `${file.name} · ${fileExtension(file.name).toUpperCase()} · ${(file.size / 1024).toFixed(1)} KB` : "Drop a CSV or XLSX file here, or choose one."}</p>
          {file && <button type="button" className="text-button" onClick={() => { selectFile(null); if (inputRef.current) inputRef.current.value = ""; }}>Remove file · {(file.size / 1024).toFixed(1)} KB</button>}
        </div>
        {errors.file && <span className="field-error">{errors.file}</span>}

        <button className="primary-button" type="submit" disabled={isBusy}>
          {status === "validating" ? "Checking..." : "Review file"}
        </button>
      </form>
      }
    </section>
  );
}
