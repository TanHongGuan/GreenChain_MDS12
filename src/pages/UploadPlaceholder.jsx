import { useRef, useState } from "react";

import { createSubmission } from "../api/submissionsApi.js";

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
  }
  if (!file) {
    errors.file = "Choose a CSV or XLSX file.";
  } else if (!ACCEPTED_EXTENSIONS.includes(fileExtension(file.name))) {
    errors.file = "Only CSV and XLSX files are supported.";
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
  const inputRef = useRef(null);

  const isBusy = status === "validating" || status === "uploading";

  function selectFile(nextFile) {
    setFile(nextFile || null);
    setNotice("");
    setErrors((currentErrors) => ({ ...currentErrors, file: undefined }));
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
      setStatus("uploading");
      const result = await createSubmission({
        projectName: projectName.trim(),
        organisation: organisation.trim(),
        reportingPeriod: reportingPeriod.trim(),
        file,
      });
      setStatus("success");
      setNotice(`Submission #${result.submission_id} is ${result.status}.`);
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
      </div>

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
        </div>
        {errors.file && <span className="field-error">{errors.file}</span>}

        <button className="primary-button" type="submit" disabled={isBusy}>
          {status === "uploading" ? "Uploading..." : "Upload Submission"}
        </button>
      </form>
    </section>
  );
}
