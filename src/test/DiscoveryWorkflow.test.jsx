import { render, screen, waitFor, within } from "@testing-library/react";
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

const baseProject = {
  project_id: 7,
  project_name: "Discovery Solar",
  organisation: "Acme Renewables",
  location: "Johor",
  status: "APPROVED",
  latest_reporting_period: "2026-Q2",
  updated_at: "2026-09-03T09:00:00Z",
  created_at: "2026-08-01T09:00:00Z",
  highlighted: false,
  trusted_metric: {
    metric_name: "Electricity",
    value: 120,
    unit: "kWh",
    category: "Energy",
    reporting_period: "2026-Q2",
    submission_id: 17,
  },
};

const pendingProject = {
  ...baseProject,
  project_id: 8,
  project_name: "Discovery Pending",
  status: "UNREVIEWED",
  trusted_metric: null,
};

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function discoveryPayload(highlighted = false) {
  const project = { ...baseProject, highlighted };
  return {
    recently_updated: [project, pendingProject],
    featured: [project],
    new_projects: [pendingProject, project],
    featured_rule: "No explicit featured flag exists.",
  };
}

function setupFetch({ highlighted = false, highlightedProjects = [] } = {}) {
  let isHighlighted = highlighted;
  global.fetch = vi.fn((url, options = {}) => {
    const requestUrl = String(url);
    const method = options.method || "GET";
    if (requestUrl.endsWith("/auth/me")) {
      return Promise.resolve(jsonResponse(200, { user: viewer }));
    }
    if (requestUrl.endsWith("/discovery/home")) {
      return Promise.resolve(jsonResponse(200, discoveryPayload(isHighlighted)));
    }
    if (requestUrl.endsWith("/highlighted/projects") && method === "GET") {
      const projects = highlightedProjects.length ? highlightedProjects : isHighlighted ? [{ ...baseProject, highlighted: true }] : [];
      return Promise.resolve(jsonResponse(200, { projects }));
    }
    if (requestUrl.endsWith("/highlighted/projects/7") && method === "POST") {
      isHighlighted = true;
      return Promise.resolve(jsonResponse(200, { project: { ...baseProject, highlighted: true } }));
    }
    if (requestUrl.endsWith("/highlighted/projects/7") && method === "DELETE") {
      isHighlighted = false;
      return Promise.resolve(jsonResponse(200, { project_id: 7, highlighted: false, removed: true }));
    }
    throw new Error(`Unexpected fetch call: ${requestUrl}`);
  });
}

function renderApp(route = "/") {
  return render(
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

describe("Sprint 7 discovery and highlighted workflow", () => {
  test("home sections load real data and preset links target the catalogue", async () => {
    setupFetch();
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect((await screen.findAllByText("Discovery Solar")).length).toBeGreaterThan(0);
    const recently = screen.getByRole("region", { name: "Recently Updated" });
    const featured = screen.getByRole("region", { name: "Featured Sustainable Projects" });
    const newest = screen.getByRole("region", { name: "New Projects" });

    expect(within(recently).getByText("Discovery Solar")).toBeInTheDocument();
    expect(within(featured).getByText("Electricity: 120 kWh")).toBeInTheDocument();
    expect(within(newest).getByText("Discovery Pending")).toBeInTheDocument();
    expect(within(recently).getByRole("link", { name: "View All" })).toHaveAttribute(
      "href",
      "/projects?sort=updated_desc",
    );
    expect(within(featured).getByRole("link", { name: "View All" })).toHaveAttribute(
      "href",
      "/projects?status=APPROVED&sort=period_desc",
    );
    expect(within(newest).getByRole("link", { name: "View All" })).toHaveAttribute(
      "href",
      "/projects?sort=created_desc",
    );
  });

  test("project card link opens detail while star toggles without navigation", async () => {
    setupFetch();
    renderApp("/");
    await screen.findByRole("heading", { name: "Home" });
    expect((await screen.findAllByText("Discovery Solar")).length).toBeGreaterThan(0);

    const cardLink = screen.getAllByRole("link", { name: /Discovery Solar/ })[0];
    expect(cardLink).toHaveAttribute("href", "/projects/7");

    await userEvent.click(screen.getAllByRole("button", { name: "Add Discovery Solar to Highlighted" })[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:8000/highlighted/projects/7",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
    });
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Submission Records" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove Discovery Solar from Highlighted" }).length).toBeGreaterThan(0);
  });

  test("highlighted page lists saved projects and removes them", async () => {
    setupFetch({ highlighted: true });
    renderApp("/highlighted");

    expect(await screen.findByRole("heading", { name: "Highlighted" })).toBeInTheDocument();
    expect(await screen.findByText("Discovery Solar")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove Discovery Solar from Highlighted" }));

    await waitFor(() => {
      expect(screen.getByText("No highlighted projects yet.")).toBeInTheDocument();
    });
  });

  test("highlighted page has an empty state", async () => {
    setupFetch({ highlighted: false });
    renderApp("/highlighted");

    expect(await screen.findByText("No highlighted projects yet.")).toBeInTheDocument();
  });

  test("refresh reloads highlighted state from the server", async () => {
    setupFetch({ highlighted: true });
    const firstRender = renderApp("/");
    expect((await screen.findAllByRole("button", { name: "Remove Discovery Solar from Highlighted" })).length).toBeGreaterThan(0);

    firstRender.unmount();
    renderApp("/");

    expect((await screen.findAllByRole("button", { name: "Remove Discovery Solar from Highlighted" })).length).toBeGreaterThan(0);
  });
});
