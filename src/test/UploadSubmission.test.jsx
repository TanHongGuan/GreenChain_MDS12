import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AppRoutes } from "../App.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";

const uploader = {
  id: "uploader-id",
  name: "GreenChain Uploader",
  email: "uploader@greenchain.test",
  role: "UPLOADER",
  organisation_id: "demo-org",
};

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetchQueue(responses) {
  global.fetch = vi.fn((url, options = {}) => {
    if (String(url).endsWith("/projects/owned") && !options.method) {
      // Uploading now requires one of the organisation's own buildings; the name
      // and organisation on the submission come from it rather than being typed.
      return Promise.resolve(jsonResponse(200, { buildings: [
        { project_id: 42, project_name: "Tower A", organisation: "GreenChain Demo Organisation" },
      ] }));
    }
    const next = responses.shift();
    if (!next) {
      throw new Error(`Unexpected fetch call: ${url}`);
    }
    if (next.assert) {
      next.assert(url, options);
    }
    return Promise.resolve(next.response);
  });
}

function renderUploadShell() {
  render(
    <MemoryRouter initialEntries={["/upload"]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function renderUpload() {
  mockFetchQueue([{ response: jsonResponse(200, { user: uploader }) }]);
  renderUploadShell();
  await screen.findByRole("heading", { name: /upload data/i });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("upload submission", () => {
  test("valid submission posts multipart form data", async () => {
    mockFetchQueue([
      { response: jsonResponse(200, { user: uploader }) },
      {
        assert: (url, options) => {
          expect(url).toContain("/submissions");
          expect(options.method).toBe("POST");
          expect(options.credentials).toBe("include");
          expect(options.body).toBeInstanceOf(FormData);
          expect(options.body.get("project_name")).toBe("Tower A");
          expect(options.body.get("organisation")).toBe("GreenChain Demo Organisation");
          expect(options.body.get("reporting_period")).toBe("2026-Q1");
          expect(options.body.get("file").name).toBe("energy.csv");
        },
        response: jsonResponse(201, {
          submission_id: 123,
          status: "UNREVIEWED",
          message: "Submission uploaded successfully",
        }),
      },
    ]);
    renderUploadShell();
    await screen.findByRole("heading", { name: /upload data/i });
    expect(screen.getByRole("link", { name: /download legacy sample csv/i })).toHaveAttribute("href", "/greenchain-sample.csv");

    await userEvent.selectOptions(await screen.findByLabelText("Building"), "42");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(
      screen.getByLabelText(/submission file/i),
      new File(["metric_name,value,unit\nElectricity,10,kWh\n"], "energy.csv", { type: "text/csv" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));
    expect(await screen.findByRole("heading", { name: "Confirm submission" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Electricity" })).toBeInTheDocument();
    expect(screen.queryByText(/frontend preview only/i)).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /confirm upload/i }));

    expect(await screen.findByText("Submission #123 is UNREVIEWED.")).toBeInTheDocument();
  });

  test("frontend validation blocks missing fields and file", async () => {
    await renderUpload();

    await userEvent.click(screen.getByRole("button", { name: /review file/i }));

    expect(screen.getByText("Select one of your buildings.")).toBeInTheDocument();
    // The free-text name and organisation fields are gone, so a submission can no
    // longer name a building this account does not own.
    expect(screen.queryByLabelText(/project \/ building name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create building/i })).not.toBeInTheDocument();
    expect(screen.getByText("Reporting period is required.")).toBeInTheDocument();
    expect(screen.getByText("Choose a CSV or XLSX file.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("frontend validation blocks unsupported file type", async () => {
    await renderUpload();

    await userEvent.selectOptions(await screen.findByLabelText("Building"), "42");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(
      screen.getByLabelText(/submission file/i),
      new File(["hello"], "notes.txt", { type: "text/plain" }),
      { applyAccept: false },
    );
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));

    expect(screen.getByText("Only CSV and XLSX files are supported.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("upload displays backend error message", async () => {
    mockFetchQueue([
      { response: jsonResponse(200, { user: uploader }) },
      {
        response: jsonResponse(400, {
          error: "INVALID_FILE",
          message: "CSV is missing required columns.",
        }),
      },
    ]);
    renderUploadShell();
    await screen.findByRole("heading", { name: /upload data/i });

    await userEvent.selectOptions(await screen.findByLabelText("Building"), "42");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(
      screen.getByLabelText(/submission file/i),
      new File(["metric_name,value,unit\nElectricity,10,kWh\n"], "energy.csv", { type: "text/csv" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));
    await userEvent.click(await screen.findByRole("button", { name: /confirm upload/i }));

    expect(await screen.findByText("CSV is missing required columns.")).toBeInTheDocument();
  });

  test("every row-level fault in a refusal is listed against its own row", async () => {
    // A refusal naming several faults must show all of them: stopping at the
    // first meant one re-upload per fault.
    mockFetchQueue([
      { response: jsonResponse(200, { user: uploader }) },
      {
        response: jsonResponse(400, {
          error: "INVALID_FILE",
          message: "This file has 2 data problems to correct before it can be processed:\n- one\n- two",
          issues: [
            {
              worksheet: "Electricity_Log", row: 20, row_date: "2026-01-19",
              column: "Main Incoming Grid (kWh)", code: "INVALID_NUMERIC",
              detail: "'MISSING' is not numeric.",
            },
            {
              worksheet: "Water_Readings", row: 41, row_date: "2026-02-09",
              column: "Water Meter - cumulative (m3)", code: "DECREASING_CUMULATIVE",
              detail: "meter reading falls from 24410.55 to 24340.2.",
            },
          ],
        }),
      },
    ]);
    renderUploadShell();
    await screen.findByRole("heading", { name: /upload data/i });

    await userEvent.selectOptions(await screen.findByLabelText("Building"), "42");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(
      screen.getByLabelText(/submission file/i),
      new File(["metric_name,value,unit\nElectricity,10,kWh\n"], "energy.csv", { type: "text/csv" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));
    await userEvent.click(await screen.findByRole("button", { name: /confirm upload/i }));

    // The headline is shown once, without the message's own bullet lines repeating
    // the list below it.
    expect(await screen.findByText(/2 data problems to correct/)).toBeInTheDocument();
    expect(screen.queryByText(/- one/)).not.toBeInTheDocument();

    expect(screen.getByText(/Electricity_Log .* row 20 .* 2026-01-19/)).toBeInTheDocument();
    expect(screen.getByText(/'MISSING' is not numeric/)).toBeInTheDocument();
    expect(screen.getByText(/Water_Readings .* row 41 .* 2026-02-09/)).toBeInTheDocument();
    expect(screen.getByText(/meter reading falls from 24410.55/)).toBeInTheDocument();
  });

  test("upload button is disabled while request is active", async () => {
    let resolveUpload;
    const uploadPromise = new Promise((resolve) => {
      resolveUpload = resolve;
    });
    mockFetchQueue([{ response: jsonResponse(200, { user: uploader }) }, { response: uploadPromise }]);
    renderUploadShell();
    await screen.findByRole("heading", { name: /upload data/i });

    await userEvent.selectOptions(await screen.findByLabelText("Building"), "42");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(
      screen.getByLabelText(/submission file/i),
      new File(["metric_name,value,unit\nElectricity,10,kWh\n"], "energy.csv", { type: "text/csv" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));
    await userEvent.click(await screen.findByRole("button", { name: /confirm upload/i }));

    expect(screen.getByRole("button", { name: /uploading/i })).toBeDisabled();
    resolveUpload(
      jsonResponse(201, {
        submission_id: 124,
        status: "UNREVIEWED",
        message: "Submission uploaded successfully",
      }),
    );

    expect(await screen.findByText("Submission #124 is UNREVIEWED.")).toBeInTheDocument();
  });

  test("monthly upload uses the selected owned building and previews canonical rows", async () => {
    global.fetch = vi.fn((url, options = {}) => {
      if (String(url).endsWith("/auth/me")) return Promise.resolve(jsonResponse(200, { user: uploader }));
      if (String(url).endsWith("/projects/owned")) return Promise.resolve(jsonResponse(200, { buildings: [
        { project_id: 42, project_name: "Bayview", organisation: "Example Company" },
      ] }));
      if (String(url).endsWith("/submissions")) {
        expect(options.body.get("project_id")).toBe("42");
        expect(options.body.get("reporting_period")).toBe("2026-Q1");
        return Promise.resolve(jsonResponse(201, { submission_id: 55, status: "UNREVIEWED", project_id: 42, monthly_record_count: 1 }));
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    renderUploadShell();
    await screen.findByRole("option", { name: "Bayview" });
    await userEvent.selectOptions(screen.getByLabelText("Building"), "42");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(screen.getByLabelText(/submission file/i), new File([
      "reporting_period,electricity_kwh,water_m3,co2_tco2e\n2026-01,1200,4,0.5\n",
    ], "monthly.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));
    expect(await screen.findByRole("heading", { name: "Confirm submission" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2026-01" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /confirm upload/i }));
    expect(await screen.findByText("Submission #55 is UNREVIEWED.")).toBeInTheDocument();
  });

  test("unfamiliar CSV requires mapping review before upload", async () => {
    const headers = ["Billing Month", "TNB Usage (MWh)", "Water Bill (L)", "GHG Emissions (kgCO2e)"];
    const fields = ["reporting_period", "electricity_kwh", "water_m3", "co2_tco2e"];
    const units = ["month", "MWh", "L", "kgCO2e"];
    global.fetch = vi.fn((url, options = {}) => {
      if (String(url).endsWith("/auth/me")) return Promise.resolve(jsonResponse(200, { user: uploader }));
      if (String(url).endsWith("/projects/owned")) return Promise.resolve(jsonResponse(200, { buildings: [
        { project_id: 42, project_name: "Bayview", organisation: "Example Company" },
      ] }));
      if (String(url).endsWith("/submissions/mapping-preview")) return Promise.resolve(jsonResponse(200, {
        kind: "ai_mapping", model: "test-model", sheets: [{ worksheet: "CSV", candidates: [
          { header_row: 1, columns: headers.map((header, index) => ({ header, column_ref: "ABCD"[index] })), sample_rows: [["Jan 2026", "30", "850000", "14200"]] },
        ] }], mapping: { mappings: fields.map((field, index) => ({ field, worksheet: "CSV", header_row: 1,
          header: headers[index], column_ref: "ABCD"[index], period_column_ref: index ? "A" : "", source_unit: units[index], ambiguous: false, missing: false })), warnings: [] },
      }));
      if (String(url).endsWith("/submissions")) {
        expect(options.body.get("project_id")).toBe("42");
        expect(JSON.parse(options.body.get("confirmed_mapping")).mappings[1].header).toBe("TNB Usage (MWh)");
        return Promise.resolve(jsonResponse(201, { submission_id: 56, status: "UNREVIEWED", input_format: "MONTHLY_AI_MAPPED", monthly_record_count: 1, processing_status: "COMPLETED" }));
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    renderUploadShell();
    await screen.findByRole("option", { name: "Bayview" });
    await userEvent.selectOptions(screen.getByLabelText("Building"), "42");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(screen.getByLabelText(/submission file/i), new File([
      `${headers.join(",")}\nJan 2026,30,850000,14200\n`,
    ], "unknown.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));
    expect(await screen.findByRole("heading", { name: "Check what we found in your file" })).toBeInTheDocument();
    // Nothing is uncertain in this fixture, so every metric stays collapsed to one line.
    expect(screen.queryByLabelText(/which column holds this figure/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to confirmation" })).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/I checked each column against my file/i));
    await userEvent.click(screen.getByRole("button", { name: "Continue to confirmation" }));
    await userEvent.click(screen.getByRole("button", { name: /confirm upload/i }));
    expect(await screen.findByText("Submission #56 is UNREVIEWED.")).toBeInTheDocument();
  });

  test("only the measurement that needs a decision is opened, and it is listed at the top", async () => {
    // The point of the review step: a confident mapping collapses to one line, an
    // unresolved one is open and named before the uploader has to hunt for it.
    const headers = ["Billing Month", "TNB Usage (MWh)", "Water Bill (L)", "GHG Emissions (kgCO2e)", "Invoice Ref"];
    global.fetch = vi.fn((url) => {
      const request = String(url);
      if (request.endsWith("/auth/me")) return Promise.resolve(jsonResponse(200, { user: uploader }));
      if (request.endsWith("/projects/owned")) return Promise.resolve(jsonResponse(200, { buildings: [{ project_id: 42, project_name: "Bayview", organisation: "Acme" }] }));
      if (request.endsWith("/submissions/mapping-preview")) return Promise.resolve(jsonResponse(200, {
        kind: "ai_mapping", model: "test-model", sheets: [{ worksheet: "CSV", candidates: [{
          header_row: 1,
          columns: headers.map((header, index) => ({ header, column_ref: "ABCDE"[index] })),
          sample_rows: [["Jan 2026", "30", "850000", "14200", "INV-1"]],
        }] }],
        mapping: {
          mappings: ["reporting_period", "electricity_kwh", "water_m3", "co2_tco2e"].map((field, index) => ({
            field, worksheet: "CSV", header_row: 1, header: headers[index], column_ref: "ABCD"[index],
            period_column_ref: index ? "A" : "", aggregation: "MONTHLY",
            // Water's unit was not resolved; the other two were.
            source_unit: field === "water_m3" ? "" : ["month", "MWh", "L", "kgCO2e"][index],
            ambiguous: false, missing: false,
          })),
          warnings: [],
        },
      }));
      throw new Error(`Unexpected fetch call: ${request}`);
    });
    renderUploadShell();
    await screen.findByRole("option", { name: "Bayview" });
    await userEvent.selectOptions(screen.getByLabelText("Building"), "42");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(screen.getByLabelText(/submission file/i), new File([
      `${headers.join(",")}\nJan 2026,30,850000,14200,INV-1\n`,
    ], "unknown.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));
    await screen.findByRole("heading", { name: "Check what we found in your file" });

    // Water is open because its unit is unresolved; the other two are not.
    expect(screen.getByLabelText(/what the rows represent/i, { selector: "#aggregation-water_m3" })).toBeInTheDocument();
    expect(screen.queryByText("1 needs your decision.")).toBeInTheDocument();
    expect(document.querySelector("#aggregation-electricity_kwh")).toBeNull();
    expect(document.querySelector("#aggregation-co2_tco2e")).toBeNull();

    // The blocking reason is stated once at the top, naming the metric.
    expect(screen.getByText("Water — Confirm the unit.")).toBeInTheDocument();

    // The column picker drops the invoice reference, which holds no number.
    const columnPicker = screen.getByLabelText(/which column holds this figure/i);
    expect(within(columnPicker).queryByRole("option", { name: /Invoice Ref/ })).toBeNull();
    expect(within(columnPicker).getByRole("option", { name: /Water Bill \(L\)/ })).toBeInTheDocument();
    // A date column holds no numbers either, but it must stay selectable.
    expect(within(screen.getByLabelText(/date column on this worksheet/i))
      .getByRole("option", { name: /Billing Month/ })).toBeInTheDocument();

    // Answering the one open question clears the top block and unblocks Continue.
    // Units are spelled out for the reader; the value sent to the backend is not.
    const unitPicker = screen.getByLabelText(/source unit/i, { selector: "#unit-water_m3" });
    expect(within(unitPicker).getByRole("option", { name: "L (litres)" })).toHaveValue("L");
    expect(within(unitPicker).getByRole("option", { name: "m³ (cubic metres)" })).toHaveValue("m3");
    await userEvent.selectOptions(unitPicker, "L");
    expect(screen.queryByText("Water — Confirm the unit.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/I checked each column against my file/i));
    expect(screen.getByRole("button", { name: "Continue to confirmation" })).toBeEnabled();
  });

  test("choosing meter readings blocks upload until an opening reading is given", async () => {
    // Daily usage and cumulative meter readings look identical in a spreadsheet.
    // Picking the cumulative reading means the first month's usage depends on a
    // reading the file does not contain, so the upload must not proceed without it.
    const headers = ["Billing Month", "TNB Usage (MWh)", "Water Bill (L)", "GHG Emissions (kgCO2e)"];
    global.fetch = vi.fn((url, options = {}) => {
      const request = String(url);
      if (request.endsWith("/auth/me")) return Promise.resolve(jsonResponse(200, { user: uploader }));
      if (request.endsWith("/projects/owned")) return Promise.resolve(jsonResponse(200, { buildings: [{ project_id: 42, project_name: "Bayview", organisation: "Acme", location: "KL" }] }));
      if (request.endsWith("/submissions/mapping-preview")) return Promise.resolve(jsonResponse(200, {
        kind: "ai_mapping", model: "test-model", sheets: [{ worksheet: "CSV", candidates: [
          { header_row: 1, columns: headers.map((header, index) => ({ header, column_ref: "ABCD"[index] })), sample_rows: [["Jan 2026", "30", "850000", "14200"]] },
        ] }], mapping: { mappings: ["reporting_period", "electricity_kwh", "water_m3", "co2_tco2e"].map((field, index) => ({
          field, worksheet: "CSV", header_row: 1, header: headers[index], column_ref: "ABCD"[index],
          period_column_ref: index ? "A" : "", source_unit: ["month", "MWh", "L", "kgCO2e"][index],
          aggregation: "MONTHLY", ambiguous: false, missing: false })), warnings: [] },
      }));
      throw new Error(`Unexpected fetch call: ${request}`);
    });
    renderUploadShell();
    await screen.findByRole("option", { name: "Bayview" });
    await userEvent.selectOptions(screen.getByLabelText("Building"), "42");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(screen.getByLabelText(/submission file/i), new File([
      `${headers.join(",")}\nJan 2026,30,850000,14200\n`,
    ], "unknown.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));
    await screen.findByRole("heading", { name: "Check what we found in your file" });
    await userEvent.click(screen.getByLabelText(/I checked each column against my file/i));

    const continueButton = screen.getByRole("button", { name: "Continue to confirmation" });
    expect(continueButton).toBeEnabled();

    // The row is collapsed because nothing about it needed a decision; opening it
    // is how the uploader reaches the controls.
    await userEvent.click(screen.getByRole("button", { name: /edit water/i }));
    await userEvent.selectOptions(screen.getByLabelText(/what the rows represent/i, { selector: "#aggregation-water_m3" }), "DIFFERENCE_CUMULATIVE");
    expect(continueButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/meter reading before 2026-Q1/i), "23410");
    // Every edit clears the confirmation, so the uploader re-checks what they changed.
    expect(continueButton).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/I checked each column against my file/i));
    expect(continueButton).toBeEnabled();
  });
});
