import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AppRoutes } from "../App.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";

const viewer = {
  id: "viewer-id",
  name: "GreenChain Viewer",
  email: "viewer@greenchain.test",
  role: "VIEWER",
  organisation_id: null,
};

const cataloguePayload = {
  projects: [
    {
      project_id: 1,
      project_name: "Alpha Solar",
      organisation: "Acme Renewables",
      location: "Johor",
      status: "APPROVED",
      reporting_period: "2026-Q1",
      submission_id: 10,
      submitted_at: "2026-01-02T09:00:00Z",
      updated_at: "2026-01-02T09:00:00Z",
    },
  ],
  page: 1,
  page_size: 12,
  total_items: 1,
  total_pages: 1,
  filters: {
    locations: [
      { value: "Johor", count: 1 },
      { value: "Penang", count: 1 },
    ],
    organisations: [
      { value: "Acme Renewables", count: 1 },
      { value: "Blue Utilities", count: 1 },
    ],
    statuses: [
      { value: "APPROVED", count: 1 },
      { value: "UNREVIEWED", count: 1 },
      { value: "REJECTED", count: 1 },
    ],
    reporting_periods: [
      { value: "2026-Q1", count: 1 },
      { value: "2026-Q2", count: 1 },
    ],
  },
};

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderProjects(route = "/projects", payload = cataloguePayload) {
  global.fetch = vi.fn((url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/auth/me")) {
      return Promise.resolve(jsonResponse(200, { user: viewer }));
    }
    if (requestUrl.includes("/projects")) {
      return Promise.resolve(jsonResponse(200, payload));
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

describe("projects catalogue", () => {
  test("renders project cards from the real catalogue payload", async () => {
    renderProjects();

    expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /alpha solar/i })).toHaveAttribute("href", "/projects/1");
    expect(screen.getByText("Acme Renewables")).toBeInTheDocument();
    expect(screen.getByText("Johor")).toBeInTheDocument();
    expect(screen.getAllByText("APPROVED").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1 project")).toBeInTheDocument();
  });

  test("loads from URL-backed filters", async () => {
    renderProjects("/projects?search=solar&location=Johor&organisation=Acme%20Renewables&reporting_period=2026-Q1&status=APPROVED,UNREVIEWED&sort=project_name_asc&page=2");

    await screen.findByRole("heading", { name: "Projects" });

    await waitFor(() => {
      const projectCall = global.fetch.mock.calls.find(([url]) => String(url).includes("/projects?"));
      expect(String(projectCall[0])).toContain("search=solar");
      expect(String(projectCall[0])).toContain("location=Johor");
      expect(String(projectCall[0])).toContain("organisation=Acme+Renewables");
      expect(String(projectCall[0])).toContain("reporting_period=2026-Q1");
      expect(String(projectCall[0])).toContain("status=APPROVED%2CUNREVIEWED");
      expect(String(projectCall[0])).toContain("sort=project_name_asc");
      expect(String(projectCall[0])).toContain("page=2");
    });
    expect(await screen.findByRole("link", { name: /alpha solar/i })).toHaveAttribute(
      "href",
      "/projects/1?search=solar&location=Johor&organisation=Acme+Renewables"
        + "&reporting_period=2026-Q1&status=APPROVED%2CUNREVIEWED&sort=project_name_asc&page=2",
    );
  });

  test("filter changes request page one with updated query", async () => {
    renderProjects("/projects?page=3");
    await screen.findByRole("heading", { name: "Projects" });
    await screen.findByText("Penang (1)");

    await userEvent.selectOptions(screen.getByLabelText("Location"), "Penang");

    await waitFor(() => {
      const latestCall = global.fetch.mock.calls.at(-1)[0];
      expect(String(latestCall)).toContain("location=Penang");
      expect(String(latestCall)).not.toContain("page=3");
    });
  });

  test("pagination controls request the next page", async () => {
    renderProjects("/projects", { ...cataloguePayload, total_items: 24, total_pages: 2 });
    await screen.findByRole("heading", { name: "Projects" });

    await userEvent.click(await screen.findByRole("button", { name: "Next" }));

    await waitFor(() => {
      const latestCall = global.fetch.mock.calls.at(-1)[0];
      expect(String(latestCall)).toContain("page=2");
    });
  });
});
