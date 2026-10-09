import { render, screen, within } from "@testing-library/react";
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
  test("loads real project header and latest approved metric", async () => {
    await renderProjectDetail();

    expect(await screen.findByRole("heading", { name: "Green Tower" })).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("kWh")).toBeInTheDocument();
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

  test("renders multiple metric cards without visualization tabs", async () => {
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
    expect(screen.queryByRole("tab", { name: "Water" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "Original data" })).toHaveAttribute(
      "href",
      "http://localhost:8000/submissions/10/evidence/original",
    );
    expect(screen.getByRole("link", { name: "Processed data" })).toHaveAttribute(
      "href",
      "http://localhost:8000/submissions/10/evidence/processed",
    );
    expect(screen.getByRole("link", { name: "Audit report" })).toHaveAttribute(
      "href",
      "http://localhost:8000/submissions/10/evidence/audit_report",
    );
  });
});
