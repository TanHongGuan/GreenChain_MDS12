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

    await userEvent.type(screen.getByLabelText(/project \/ building name/i), "Tower A");
    await userEvent.type(screen.getByLabelText(/organisation/i), "GreenChain Demo Organisation");
    await userEvent.type(screen.getByLabelText(/reporting period/i), "2026-Q1");
    await userEvent.upload(
      screen.getByLabelText(/submission file/i),
      new File(["meter,kwh\nA-1,10\n"], "energy.csv", { type: "text/csv" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /upload submission/i }));

    expect(await screen.findByText("Submission #123 is UNREVIEWED.")).toBeInTheDocument();
  });

  test("frontend validation blocks missing fields and file", async () => {
    await renderUpload();

    await userEvent.click(screen.getByRole("button", { name: /upload submission/i }));

    expect(screen.getByText("Project / Building name is required.")).toBeInTheDocument();
    expect(screen.getByText("Organisation is required.")).toBeInTheDocument();
    expect(screen.getByText("Reporting period is required.")).toBeInTheDocument();
    expect(screen.getByText("Choose a CSV or XLSX file.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("frontend validation blocks unsupported file type", async () => {
    await renderUpload();

    await userEvent.type(screen.getByLabelText(/project \/ building name/i), "Tower A");
    await userEvent.type(screen.getByLabelText(/organisation/i), "GreenChain Demo Organisation");
    await userEvent.type(screen.getByLabelText(/reporting period/i), "2026-Q1");
    await userEvent.upload(
      screen.getByLabelText(/submission file/i),
      new File(["hello"], "notes.txt", { type: "text/plain" }),
      { applyAccept: false },
    );
    await userEvent.click(screen.getByRole("button", { name: /upload submission/i }));

    expect(screen.getByText("Only CSV and XLSX files are supported.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
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
    await userEvent.type(screen.getByLabelText(/reporting period/i), "2026-Q1");
    await userEvent.upload(
      screen.getByLabelText(/submission file/i),
      new File(["meter,kwh\n"], "energy.csv", { type: "text/csv" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /upload submission/i }));

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
    await userEvent.type(screen.getByLabelText(/reporting period/i), "2026-Q1");
    await userEvent.upload(
      screen.getByLabelText(/submission file/i),
      new File(["meter,kwh\n"], "energy.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /upload submission/i }));

    expect(screen.getByRole("button", { name: /uploading/i })).toBeDisabled();
    resolveUpload(
      jsonResponse(201, {
        submission_id: 124,
        status: "UNREVIEWED",
        message: "Submission uploaded successfully",
      }),
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /upload submission/i })).not.toBeDisabled());
  });
});
