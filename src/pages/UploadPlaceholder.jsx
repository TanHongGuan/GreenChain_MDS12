import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Panel } from "../components/Panel.jsx";
import { MetricMappingRow } from "../components/MetricMappingRow.jsx";
import {
  MAPPING_FIELDS, attentionFields, duplicateLabels, mappingOptionsFrom,
  measurementOptionKeys, optionKey, reviewReasons,
} from "../utils/mappingReview.js";

import { createOwnedBuilding, createSubmission, getOwnedBuildings, previewSubmissionMapping } from "../services/dataService.js";
import { parseUploadCsv, readTextFile } from "../utils/uploadPreview.js";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx"];

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

// The backend contract still carries reporting_period as a canonical field, and
// process_confirmed_mapping uses it as the reference period set that every metric
// must align to. The uploader no longer answers that question twice: the quarter is
// chosen once on the form, and each metric already names the date column on its own
// worksheet. So the reporting_period mapping is derived from the first metric rather
// than asked for again. Backend validation is unchanged.
function buildConfirmedMapping(draft, preview) {
  const metrics = draft.map((item) => ({ ...item, missing: false, ambiguous: false }));
  const first = metrics[0];
  const period = first && {
    field: "reporting_period",
    worksheet: first.worksheet,
    header_row: first.header_row,
    header: (preview.sheets
      .find((sheet) => sheet.worksheet === first.worksheet)?.candidates
      .find((candidate) => candidate.header_row === first.header_row)?.columns
      .find((column) => column.column_ref === first.period_column_ref)?.header) || "",
    column_ref: first.period_column_ref,
    period_column_ref: "",
    source_unit: "month",
    missing: false,
    ambiguous: false,
  };
  return { mappings: period ? [period, ...metrics] : metrics, warnings: preview.mapping.warnings };
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
  const [fileIssues, setFileIssues] = useState([]);
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
  // Which metric rows are expanded. Seeded from what needs the uploader when the
  // suggestion arrives, then controlled by them - a row never closes itself
  // while it is being edited.
  const [openRows, setOpenRows] = useState([]);
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
          const draft = MAPPING_FIELDS.map(([field]) => proposed.mapping.mappings.find((item) => item.field === field) || {
            field, worksheet: "", header_row: 1, header: "", source_unit: "", missing: true, ambiguous: true,
          });
          setMappingPreview(proposed);
          setMappingDraft(draft);
          setOpenRows(attentionFields(draft, { period: reportingPeriod }));
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
    setFileIssues([]);
    try {
      const result = await createSubmission({
        projectName: projectName.trim(),
        organisation: organisation.trim(),
        reportingPeriod: reportingPeriod.trim(),
        file,
        projectId: projectId || null,
        confirmedMapping: mappingPreview ? buildConfirmedMapping(mappingDraft, mappingPreview) : null,
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
      const issues = error.issues || [];
      setFileIssues(issues);
      // With a list to show, the message's own bullet lines would be repeated, so
      // only its headline is kept.
      setNotice(issues.length ? (error.message || "").split("\n")[0] : (error.message || "Unable to upload submission."));
    }
  }

  function updateMapping(field, changes) {
    setMappingDraft((items) => items.map((item) => item.field === field ? { ...item, ...changes } : item));
    setMappingReviewed(false);
  }

  const allOptions = mappingOptionsFrom(mappingPreview);
  // Columns that hold no number in any sampled row cannot be measurements, so
  // they are left out - roughly half of a typical workbook is record ids,
  // invoice refs and notes. Whatever is already chosen stays listed, and the
  // date picker draws on the unfiltered list because dates are not numbers.
  const measurementKeys = measurementOptionKeys(mappingPreview);
  const chosenKeys = new Set(mappingDraft.map(optionKey));
  const mappingOptions = allOptions.filter((option) => measurementKeys.has(optionKey(option))
    || chosenKeys.has(optionKey(option)));
  const duplicates = duplicateLabels(mappingDraft, MAPPING_FIELDS);
  const metricRows = MAPPING_FIELDS.map(([field, label, units]) => {
    const item = mappingDraft.find((entry) => entry.field === field)
      || { field, worksheet: "", header_row: 1, header: "", source_unit: "", missing: true };
    return {
      field, label, units, item,
      ...reviewReasons(item, { units, duplicateOf: duplicates.get(field), period: reportingPeriod }),
    };
  });
  const needingAction = metricRows.filter((row) => row.blocking.length > 0);
  const mappingComplete = mappingDraft.length === MAPPING_FIELDS.length && needingAction.length === 0;

  function revealRow(field) {
    setOpenRows((fields) => fields.includes(field) ? fields : [...fields, field]);
    requestAnimationFrame(() => document.getElementById(`mapping-${field}`)?.scrollIntoView?.({ block: "center" }));
  }

  return (
    <section className={`page-panel upload-page${stage === "mapping" ? " upload-page-wide" : ""}`}>
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

      {stage === "mapping" && <section className="upload-confirm upload-review" aria-labelledby="mapping-heading">
        <ol className="upload-steps" aria-label="Upload progress">
          <li>File</li>
          <li aria-current="step">Check columns</li>
          <li>Confirm</li>
        </ol>
        <h2 id="mapping-heading">Check what we found in your file</h2>
        <p className="upload-context">
          {projectName} · {reportingPeriod} · {file?.name} · {mappingPreview.sheets.filter((sheet) => sheet.candidates.length).length} worksheets
        </p>
        <p className="upload-detection">
          Found {metricRows.filter((row) => row.item.column_ref).length} of {MAPPING_FIELDS.length} measurements.{" "}
          {needingAction.length
            ? <strong>{needingAction.length} {needingAction.length === 1 ? "needs" : "need"} your decision.</strong>
            : "Nothing needs changing — check the lines below and continue."}
        </p>
        <p className="mapping-hint">
          Suggested by {mappingPreview.model} from your column headings and notes. A suggestion to check against your
          file, not a verified reading of it. No measurements have been uploaded yet.
        </p>

        {needingAction.length > 0 && <div className="needs-you">
          <h3>Needs you</h3>
          <ul>
            {needingAction.map((row) => <li key={row.field}>
              <span>{row.label} — {row.blocking[0]}</span>
              <button type="button" className="link-button" onClick={() => revealRow(row.field)}>Fix</button>
            </li>)}
          </ul>
        </div>}

        {mappingPreview.mapping.warnings.map((warning, index) => <p className="mapping-hint" key={index}>{warning}</p>)}

        <div className="metric-rows">
          {metricRows.map((row) => <MetricMappingRow
            key={row.field}
            field={row.field}
            label={row.label}
            units={row.units}
            item={row.item}
            preview={mappingPreview}
            options={mappingOptions}
            allOptions={allOptions}
            period={reportingPeriod}
            blocking={row.blocking}
            advisory={row.advisory}
            expanded={openRows.includes(row.field)}
            onToggle={() => setOpenRows((fields) => fields.includes(row.field)
              ? fields.filter((name) => name !== row.field) : [...fields, row.field])}
            onChange={(changes) => updateMapping(row.field, changes)}
          />)}
        </div>

        <div className="upload-confirm-bar">
          <label className="mapping-review-check">
            <input type="checkbox" checked={mappingReviewed} onChange={(event) => setMappingReviewed(event.target.checked)} />
            I checked each column against my file.
          </label>
          <div className="decision-actions">
            <button type="button" className="primary-button" disabled={!mappingComplete || !mappingReviewed}
              onClick={() => setStage("confirm")}>Continue to confirmation</button>
            <button type="button" className="secondary-button" onClick={() => setStage("form")}>Back / edit</button>
          </div>
        </div>
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
        {fileIssues.length > 0 && <ul className="upload-issues">
          {fileIssues.map((issue, index) => <li key={`${issue.worksheet}-${issue.row}-${issue.column}-${index}`}>
            <span className="upload-issue-where">{issue.worksheet} &middot; row {issue.row}{issue.row_date ? ` \u00b7 ${issue.row_date}` : ""}</span>
            <span className="upload-issue-what"><strong>{issue.column}</strong> {issue.detail}</span>
          </li>)}
        </ul>}
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
