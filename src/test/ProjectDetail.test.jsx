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

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetchQueue(responses) {
  global.fetch = vi.fn((url) => {
    const next = responses.shift();
    if (!next) {
      throw new Error(`Unexpected fetch call: ${url}`);
    }
    return Promise.resolve(next);
  });
}

async function renderProjectDetail(responses, projectId = "42") {
  mockFetchQueue([jsonResponse(200, { user: auditor }), ...responses]);
  render(
    <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
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
    await renderProjectDetail([jsonResponse(200, projectDetail), jsonResponse(200, electricityHistory)]);

    expect(await screen.findByRole("heading", { name: "Green Tower" })).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("kWh")).toBeInTheDocument();
    expect(screen.getByText("Approved period: 2026-Q2")).toBeInTheDocument();
  });

  test("shows previous-period comparison", async () => {
    await renderProjectDetail([jsonResponse(200, projectDetail), jsonResponse(200, electricityHistory)]);

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
    await renderProjectDetail([
      jsonResponse(200, singlePeriod),
      jsonResponse(200, { metric_name: "Water", points: [{ submission_id: 1, reporting_period: "2026-Q1", value: 20, unit: "kL", status: "APPROVED" }] }),
    ]);

    await screen.findByRole("heading", { name: "Green Tower" });
    expect(screen.getByText("No previous approved period")).toBeInTheDocument();
  });

  test("no approved data shows a safe empty state, not fabricated values", async () => {
    await renderProjectDetail([jsonResponse(200, { project: projectDetail.project, metrics: [] })]);

    await screen.findByRole("heading", { name: "Green Tower" });
    expect(screen.getByText("No approved sustainability data yet for this project.")).toBeInTheDocument();
  });

  test("switching metric tabs loads that metric's own history", async () => {
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
    const waterHistory = {
      metric_name: "Water",
      points: [{ submission_id: 11, reporting_period: "2026-Q2", value: 40, unit: "kL", status: "APPROVED" }],
    };

    await renderProjectDetail([
      jsonResponse(200, twoMetricDetail),
      jsonResponse(200, electricityHistory),
      jsonResponse(200, waterHistory),
    ]);

    await screen.findByRole("heading", { name: "Green Tower" });
    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.click(screen.getByRole("tab", { name: "Water" }));

    const table = await screen.findByRole("table");
    expect(within(table).getByText("2026-Q2")).toBeInTheDocument();
  });

  test("invalid project id is handled safely", async () => {
    await renderProjectDetail([
      jsonResponse(404, { error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." } }),
    ]);

    expect(await screen.findByText("Project was not found.")).toBeInTheDocument();
  });
});
