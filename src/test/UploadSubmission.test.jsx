import { render, screen, waitFor } from "@testing-library/react";
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
      return Promise.resolve(jsonResponse(200, { buildings: [] }));
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

    await userEvent.type(screen.getByLabelText(/project \/ building name/i), "Tower A");
    await userEvent.type(screen.getByLabelText(/organisation/i), "GreenChain Demo Organisation");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(
      screen.getByLabelText(/submission file/i),
      new File(["metric_name,value,unit\nElectricity,10,kWh\n"], "energy.csv", { type: "text/csv" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));
    expect(await screen.findByText(/1 parsed row/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /confirm upload/i }));

    expect(await screen.findByText("Submission #123 is UNREVIEWED.")).toBeInTheDocument();
  });

  test("frontend validation blocks missing fields and file", async () => {
    await renderUpload();

    await userEvent.click(screen.getByRole("button", { name: /review file/i }));

    expect(screen.getByText("Project / Building name is required.")).toBeInTheDocument();
    expect(screen.getByText("Organisation is required.")).toBeInTheDocument();
    expect(screen.getByText("Reporting period is required.")).toBeInTheDocument();
    expect(screen.getByText("Choose a CSV or XLSX file.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("frontend validation blocks unsupported file type", async () => {
    await renderUpload();

    await userEvent.type(screen.getByLabelText(/project \/ building name/i), "Tower A");
    await userEvent.type(screen.getByLabelText(/organisation/i), "GreenChain Demo Organisation");
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

    await userEvent.type(screen.getByLabelText(/project \/ building name/i), "Tower A");
    await userEvent.type(screen.getByLabelText(/organisation/i), "GreenChain Demo Organisation");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(
      screen.getByLabelText(/submission file/i),
      new File(["invalid workbook"], "energy.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));
    await userEvent.click(await screen.findByRole("button", { name: /confirm upload/i }));

    expect(await screen.findByText("CSV is missing required columns.")).toBeInTheDocument();
  });

  test("upload button is disabled while request is active", async () => {
    let resolveUpload;
    const uploadPromise = new Promise((resolve) => {
      resolveUpload = resolve;
    });
    mockFetchQueue([{ response: jsonResponse(200, { user: uploader }) }, { response: uploadPromise }]);
    renderUploadShell();
    await screen.findByRole("heading", { name: /upload data/i });

    await userEvent.type(screen.getByLabelText(/project \/ building name/i), "Tower A");
    await userEvent.type(screen.getByLabelText(/organisation/i), "GreenChain Demo Organisation");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(
      screen.getByLabelText(/submission file/i),
      new File(["meter,kwh\n"], "energy.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
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
    await userEvent.selectOptions(screen.getByLabelText("Owned building"), "42");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(screen.getByLabelText(/submission file/i), new File([
      "reporting_period,electricity_kwh,water_m3,co2_tco2e\n2026-01,1200,4,0.5\n",
    ], "monthly.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));
    expect(await screen.findByText(/1 parsed row/)).toBeInTheDocument();
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
    await userEvent.selectOptions(screen.getByLabelText("Owned building"), "42");
    await userEvent.type(screen.getByLabelText(/reporting year/i), "2026");
    await userEvent.selectOptions(screen.getByLabelText(/quarter/i), "Q1");
    await userEvent.upload(screen.getByLabelText(/submission file/i), new File([
      `${headers.join(",")}\nJan 2026,30,850000,14200\n`,
    ], "unknown.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /review file/i }));
    expect(await screen.findByRole("heading", { name: "Review detected columns" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to confirmation" })).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/I verified the four columns/i));
    await userEvent.click(screen.getByRole("button", { name: "Continue to confirmation" }));
    await userEvent.click(screen.getByRole("button", { name: /confirm upload/i }));
    expect(await screen.findByText("Submission #56 is UNREVIEWED.")).toBeInTheDocument();
  });
});
