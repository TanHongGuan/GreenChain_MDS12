import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { createSubmission, isMockMode } from "../services/dataService.js";
import { parseCsv, readTextFile } from "../utils/uploadPreview.js";

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

export function UploadPlaceholder() {
  const [projectName, setProjectName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [reportingPeriod, setReportingPeriod] = useState("");
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [notice, setNotice] = useState("");
  const [stage, setStage] = useState("form");
  const [previewRows, setPreviewRows] = useState([]);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const isBusy = status === "validating" || status === "uploading";

  function selectFile(nextFile) {
    setFile(nextFile || null);
    setNotice("");
    setErrors((currentErrors) => ({ ...currentErrors, file: undefined }));
    setPreviewRows([]);
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
      if (fileExtension(file.name) === ".csv") {
        setPreviewRows(parseCsv(await readTextFile(file)));
      } else if (isMockMode) {
        throw new Error("Demo upload needs a CSV file so its metrics can be previewed. XLSX is available in real mode.");
      } else setPreviewRows([]);
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
        previewRows,
      });
      setStatus("success");
      setNotice(`Submission #${result.submission_id} is ${result.status}.`);
      setResult(result);
      setStage("success");
      setProjectName("");
      setOrganisation("");
      setReportingPeriod("");
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (error) {
      setStatus("error");
      setNotice(error.message || "Unable to upload submission.");
    }
  }

  return (
    <section className="page-panel upload-page">
      <div className="page-heading">
        <p className="eyebrow">Uploader Workspace</p>
        <h1>Upload Data</h1>
        {isMockMode && <p className="demo-label">Demo data · Browser session only</p>}
      </div>

      {stage === "success" ? <div className="upload-result" role="status">
        <p className="form-success">{notice}</p>
        <p>{isMockMode ? "This demo submission is available in the mock review queue only." : "Your submission was accepted by the backend."}</p>
        {result?.project_id && <Link to={`/projects/${result.project_id}`} className="secondary-button">View project</Link>}
        <button type="button" className="secondary-button" onClick={() => { setStage("form"); setNotice(""); setResult(null); }}>New submission</button>
      </div> : null}

      {stage === "confirm" && <section className="upload-confirm" aria-labelledby="confirm-heading">
        <h2 id="confirm-heading">Confirm submission</h2>
        <dl className="detail-grid"><div><dt>Project</dt><dd>{projectName}</dd></div><div><dt>Organisation</dt><dd>{organisation}</dd></div><div><dt>Period</dt><dd>{reportingPeriod}</dd></div><div><dt>File</dt><dd>{file?.name} ({(file?.size / 1024).toFixed(1)} KB)</dd></div></dl>
        <p>Frontend preview only. The backend validates the final upload.</p>
        {previewRows.length ? <div className="metrics-table-wrap"><table className="metrics-table"><thead><tr><th>Metric</th><th>Value</th><th>Unit</th><th>Category</th></tr></thead><tbody>
          {previewRows.map((row, index) => <tr key={`${row.metric_name}-${index}`}><td>{row.metric_name}</td><td>{row.value}</td><td>{row.unit}</td><td>{row.category || "—"}</td></tr>)}
        </tbody></table></div> : <p>XLSX preview is unavailable in the browser; backend validation runs on confirmation.</p>}
        {notice && <div className="form-error" role="status">{notice}</div>}
        <div className="decision-actions"><button type="button" className="primary-button" onClick={confirmUpload} disabled={isBusy}>{isBusy ? "Uploading..." : "Confirm upload"}</button><button type="button" className="secondary-button" onClick={() => { setStage("form"); setStatus("idle"); }} disabled={isBusy}>Back</button></div>
      </section>}

      {stage === "form" &&
      <form className="upload-form" onSubmit={handleSubmit} noValidate>
        {notice && (
          <div className={status === "success" ? "form-success" : "form-error"} role="status">
            {notice}
          </div>
        )}

        <label htmlFor="project-name">Project / Building name</label>
        <input
          id="project-name"
          name="project-name"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          disabled={isBusy}
        />
        {errors.projectName && <span className="field-error">{errors.projectName}</span>}

        <label htmlFor="organisation">Organisation</label>
        <input
          id="organisation"
          name="organisation"
          value={organisation}
          onChange={(event) => setOrganisation(event.target.value)}
          disabled={isBusy}
        />
        {errors.organisation && <span className="field-error">{errors.organisation}</span>}

        <label htmlFor="reporting-period">Reporting period</label>
        <input
          id="reporting-period"
          name="reporting-period"
          value={reportingPeriod}
          onChange={(event) => setReportingPeriod(event.target.value)}
          disabled={isBusy}
          placeholder="2026-Q1"
        />
        {errors.reportingPeriod && <span className="field-error">{errors.reportingPeriod}</span>}

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
          <p>{file ? file.name : "Drop a CSV or XLSX file here, or choose one."}</p>
          {file && <button type="button" className="text-button" onClick={() => { selectFile(null); if (inputRef.current) inputRef.current.value = ""; }}>Remove file · {(file.size / 1024).toFixed(1)} KB</button>}
        </div>
        {errors.file && <span className="field-error">{errors.file}</span>}

        <button className="primary-button" type="submit" disabled={isBusy}>
          {status === "validating" ? "Checking..." : "Upload Submission"}
        </button>
      </form>
      }
    </section>
  );
}
