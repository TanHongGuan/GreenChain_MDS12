import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AppRoutes } from "../App.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";

const auditor = {
  id: "auditor-id",
  name: "GreenChain Auditor",
  email: "auditor@greenchain.test",
  role: "AUDITOR",
  organisation_id: null,
};

const projectDetail = {
  project: { project_id: 42, project_name: "Green Tower", organisation: "Acme Corp" },
  metrics: [
    {
      metric_name: "Electricity",
      latest: {
        submission_id: 10,
        reporting_period: "2026-Q2",
        value: 150,
        unit: "kWh",
        category: "Energy",
        status: "APPROVED",
      },
      previous: {
        submission_id: 9,
        reporting_period: "2026-Q1",
        value: 100,
        unit: "kWh",
        category: "Energy",
        status: "APPROVED",
      },
    },
  ],
};

const electricityHistory = {
  metric_name: "Electricity",
  points: [
    { submission_id: 9, reporting_period: "2026-Q1", value: 100, unit: "kWh", status: "APPROVED" },
    { submission_id: 10, reporting_period: "2026-Q2", value: 150, unit: "kWh", status: "APPROVED" },
  ],
};

const submissionHistory = [
  {
    submission_id: 10,
    project_id: 42,
    project_name: "Green Tower",
    organisation: "Acme Corp",
    reporting_period: "2026-Q2",
    status: "APPROVED",
    submitted_by: { id: "uploader-id", name: "GreenChain Uploader", email: "uploader@greenchain.test" },
    submitted_at: "2026-09-02T10:00:00Z",
    review: {
      decision: "APPROVED",
      reason: "verified",
      reviewer_name: "GreenChain Auditor",
      reviewer_email: "auditor@greenchain.test",
      reviewed_at: "2026-09-02T12:00:00Z",
    },
    evidence: {
      original: {
        available: true,
        filename: "report.csv",
        size_bytes: 64,
        sha256: "abc123",
        integrity: { status: "MATCH", matches: true },
      },
      processed: { available: true, filename: "processed-10-report.csv", size_bytes: 72 },
      audit_report: { available: true, filename: "audit-report-submission-10.txt", size_bytes: 120 },
    },
    previous_submission: null,
    corrected_by: [],
  },
];

const submissionDetail = {
  ...submissionHistory[0],
  metrics: [
    {
      metric_name: "Electricity",
      value: 150,
      unit: "kWh",
      category: "Energy",
      submission_id: 10,
      reporting_period: "2026-Q2",
      status: "APPROVED",
    },
  ],
};

const consistencyReport = {
  project_id: 42,
  metrics: ["Electricity"],
  periods: ["2026-Q1", "2026-Q2"],
  cells: [
    { metric_name: "Electricity", reporting_period: "2026-Q1", state: "APPROVED", value: 100, unit: "kWh", submission_id: 9 },
    { metric_name: "Electricity", reporting_period: "2026-Q2", state: "APPROVED", value: 150, unit: "kWh", submission_id: 10 },
  ],
  approved_cells: 2,
  total_cells: 2,
  approved_coverage_percent: 100,
};

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function renderProjectDetail(
  {
    projectResponse = jsonResponse(200, projectDetail),
    submissionsResponse = jsonResponse(200, { submissions: submissionHistory }),
    submissionResponse = jsonResponse(200, { submission: submissionDetail }),
    histories = { Electricity: jsonResponse(200, electricityHistory) },
  } = {},
  projectId = "42",
  route = `/projects/${projectId}`,
) {
  global.fetch = vi.fn((url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/auth/me")) {
      return Promise.resolve(jsonResponse(200, { user: auditor }));
    }
    if (requestUrl.includes(`/projects/${projectId}/metrics/`)) {
      const metricName = decodeURIComponent(requestUrl.split(`/projects/${projectId}/metrics/`)[1].split("/")[0]);
      const response = histories[metricName];
      if (!response) {
        throw new Error(`Unexpected metric history call: ${requestUrl}`);
      }
      return Promise.resolve(response.clone());
    }
    if (requestUrl.endsWith(`/insights/projects/${projectId}/consistency`)) {
      return Promise.resolve(jsonResponse(200, consistencyReport));
    }
    if (requestUrl.endsWith(`/submissions/projects/${projectId}`)) {
      return Promise.resolve(submissionsResponse.clone());
    }
    if (requestUrl.endsWith(`/projects/${projectId}`)) {
      return Promise.resolve(projectResponse.clone());
    }
    if (/\/submissions\/\d+$/.test(requestUrl)) {
      return Promise.resolve(submissionResponse.clone());
    }
    throw new Error(`Unexpected fetch call: ${requestUrl}`);
  });
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("project detail page", () => {
  test("metric selector shows one honest scaled chart at a time", async () => {
    await renderProjectDetail();
    expect(await screen.findByRole("img", { name: /Electricity approved trend.*vertical axis/ })).toBeInTheDocument();
    expect(screen.getByText(/axis is scaled to the observed range/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Water" }));
    expect(screen.getByRole("tab", { name: "Water" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("img", { name: /Electricity approved trend/ })).not.toBeInTheDocument();
    expect(screen.getByText("No values are available for this metric under the selected review states.")).toBeInTheDocument();
  });

  test("loads real project header and latest approved metric", async () => {
    await renderProjectDetail();

    expect(await screen.findByRole("heading", { name: "Green Tower" })).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("kWh", { selector: ".metric-card-unit" })).toBeInTheDocument();
    expect(screen.getByText("Approved period: 2026-Q2")).toBeInTheDocument();
  });

  test("back link preserves catalogue query string", async () => {
    await renderProjectDetail({}, "42", "/projects/42?search=solar&location=Johor&page=2");

    await screen.findByRole("heading", { name: "Green Tower" });
    expect(screen.getByRole("link", { name: /back to projects/i })).toHaveAttribute(
      "href",
      "/projects?search=solar&location=Johor&page=2",
    );
  });

  test("shows previous-period comparison", async () => {
    await renderProjectDetail();

    await screen.findByRole("heading", { name: "Green Tower" });
    expect(screen.getByText(/vs 2026-Q1/)).toBeInTheDocument();
  });

  test("single approved period shows no comparison instead of fabricating one", async () => {
    const singlePeriod = {
      project: projectDetail.project,
      metrics: [
        {
          metric_name: "Water",
          latest: {
            submission_id: 1,
            reporting_period: "2026-Q1",
            value: 20,
            unit: "kL",
            category: "Water",
            status: "APPROVED",
          },
          previous: null,
        },
      ],
    };
    await renderProjectDetail({
      projectResponse: jsonResponse(200, singlePeriod),
      histories: {
        Water: jsonResponse(200, {
          metric_name: "Water",
          points: [{ submission_id: 1, reporting_period: "2026-Q1", value: 20, unit: "kL", status: "APPROVED" }],
        }),
      },
    });

    await screen.findByRole("heading", { name: "Green Tower" });
    expect(screen.getByText("No previous approved period")).toBeInTheDocument();
  });

  test("no approved data shows a safe empty state, not fabricated values", async () => {
    await renderProjectDetail({
      projectResponse: jsonResponse(200, { project: projectDetail.project, metrics: [] }),
      submissionsResponse: jsonResponse(200, { submissions: [] }),
    });

    await screen.findByRole("heading", { name: "Green Tower" });
    expect(screen.getByText("No approved sustainability data yet for this project.")).toBeInTheDocument();
  });

  test("renders multiple metric cards with a selectable visualization tab", async () => {
    const twoMetricDetail = {
      project: projectDetail.project,
      metrics: [
        projectDetail.metrics[0],
        {
          metric_name: "Water",
          latest: {
            submission_id: 11,
            reporting_period: "2026-Q2",
            value: 40,
            unit: "kL",
            category: "Water",
            status: "APPROVED",
          },
          previous: null,
        },
      ],
    };

    await renderProjectDetail({
      projectResponse: jsonResponse(200, twoMetricDetail),
    });

    await screen.findByRole("heading", { name: "Green Tower" });
    expect(screen.getByRole("heading", { name: "Water" })).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("kL")).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Water" })).toBeInTheDocument();
  });

  test("invalid project id is handled safely", async () => {
    await renderProjectDetail({
      projectResponse: jsonResponse(404, { error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." } }),
      submissionsResponse: jsonResponse(404, {
        error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." },
      }),
    });

    expect(await screen.findByText("Project was not found.")).toBeInTheDocument();
  });

  test("shows submission records, detail, evidence links, and metric trace", async () => {
    await renderProjectDetail();

    expect(await screen.findByRole("heading", { name: "Submission #10" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Submission Records" })).toBeInTheDocument();
    expect(screen.getByText("Original MATCH / Processed Available")).toBeInTheDocument();
    expect(screen.getByText("Submission #10, 2026-Q2, APPROVED")).toBeInTheDocument();
    expect(screen.getByText("GreenChain Uploader (uploader@greenchain.test)")).toBeInTheDocument();
    expect(screen.getByText("GreenChain Auditor (auditor@greenchain.test)")).toBeInTheDocument();
    expect(screen.queryByText("Show unreviewed submissions (dashed)")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Metric history over time" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Original uploaded file" })).toHaveAttribute(
      "href",
      `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/submissions/10/evidence/original`,
    );
    // Only the original file is downloadable. The processed records and the audit
    // trail are still held and still reported - just not as download buttons.
    expect(screen.queryByRole("link", { name: "Processed data" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Audit report" })).not.toBeInTheDocument();
    expect(screen.queryByText("Audit report unavailable")).not.toBeInTheDocument();
    expect(screen.getByText("Review and integrity")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader", { name: "Metric" }).length).toBeGreaterThan(0);
  });
  test("renders the reporting consistency section, and no benchmark section", async () => {
    await renderProjectDetail();

    expect(await screen.findByRole("heading", { name: "Reporting Consistency" })).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Performance vs Benchmark" })).not.toBeInTheDocument();
  });

  test("review-state selector controls what is requested and how it is drawn", async () => {
    // Approved-only must not ask the backend for unreviewed rows at all, and
    // unreviewed values must never be drawn as a confirmed part of the trend.
    const requested = [];
    const mixed = {
      metric_name: "Electricity",
      points: [
        { submission_id: 9, reporting_period: "2026-Q1", value: 100, unit: "kWh", status: "APPROVED" },
        { submission_id: 10, reporting_period: "2026-Q2", value: 150, unit: "kWh", status: "APPROVED" },
        { submission_id: 11, reporting_period: "2026-Q3", value: 180, unit: "kWh", status: "UNREVIEWED" },
      ],
    };
    const original = global.fetch;
    await renderProjectDetail();
    const previous = global.fetch;
    global.fetch = vi.fn((url, options) => {
      const request = String(url);
      if (request.includes("/metrics/")) {
        requested.push(request.includes("include_unreviewed=true"));
        const approvedOnly = { ...mixed, points: mixed.points.filter((p) => p.status === "APPROVED") };
        return Promise.resolve(jsonResponse(200, request.includes("include_unreviewed=true") ? mixed : approvedOnly));
      }
      return previous(url, options);
    });

    await screen.findByRole("heading", { name: "Performance by quarter" });
    const filter = await screen.findByRole("group", { name: /review state shown/i });
    const approved = within(filter).getByRole("checkbox", { name: "Approved" });
    const unreviewed = within(filter).getByRole("checkbox", { name: "Unreviewed" });
    // Both ticked by default, so unreviewed points are requested from the start.
    expect(approved).toBeChecked();
    expect(unreviewed).toBeChecked();
    await waitFor(() => expect(requested.some(Boolean)).toBe(true));
    expect(await screen.findByText(/drawn with a dashed line/i)).toBeInTheDocument();

    await userEvent.click(unreviewed);
    await waitFor(() => expect(requested.at(-1)).toBe(false));
    expect(screen.queryByText(/drawn with a dashed line/i)).not.toBeInTheDocument();

    await userEvent.click(approved);
    expect(await screen.findByText(/tick at least one review state/i)).toBeInTheDocument();
    global.fetch = original;
  });
});
