import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AppRoutes } from "../App.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";

const company = {
  id: "company-id",
  name: "GreenChain Uploader",
  email: "uploader@greenchain.test",
  role: "UPLOADER",
  organisation_id: "demo-org",
};
const viewer = { ...company, id: "viewer-id", role: "VIEWER", email: "viewer@greenchain.test" };

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

const engineering = {
  project_id: 7, project_name: "Engineering Building", organisation: "Monash University Malaysia",
  organisation_id: "demo-org", location: "Bandar Sunway", country: null, property_type: null,
  submission_count: 2,
  latest_submission: { submission_id: 12, reporting_period: "2026-Q2", status: "UNREVIEWED", submitted_at: "2026-07-01T00:00:00Z" },
};
const pharmacy = {
  project_id: 8, project_name: "Pharmacy Building", organisation: "Monash University Malaysia",
  organisation_id: "demo-org", location: null, country: null, property_type: null,
  submission_count: 0, latest_submission: null,
};

function mockApi({ user = company, buildings = [engineering, pharmacy], onPatch, onPost } = {}) {
  global.fetch = vi.fn((url, options = {}) => {
    const request = String(url);
    const method = options.method || "GET";
    if (request.endsWith("/auth/me")) return Promise.resolve(jsonResponse(200, { user }));
    if (request.endsWith("/projects/owned") && method === "GET") {
      return Promise.resolve(jsonResponse(200, { buildings }));
    }
    if (request.endsWith("/projects/owned") && method === "POST") {
      return Promise.resolve(onPost ? onPost(options) : jsonResponse(201, { building: pharmacy }));
    }
    if (request.includes("/projects/owned/") && method === "PATCH") {
      return Promise.resolve(onPatch ? onPatch(request, options) : jsonResponse(200, { building: engineering }));
    }
    if (request.includes("/submissions/projects/")) {
      return Promise.resolve(jsonResponse(200, { submissions: [
        { submission_id: 11, reporting_period: "2026-Q1", status: "APPROVED", submitted_at: "2026-04-01T00:00:00Z" },
        { submission_id: 12, reporting_period: "2026-Q2", status: "UNREVIEWED", submitted_at: "2026-07-01T00:00:00Z" },
      ] }));
    }
    throw new Error(`Unexpected fetch call: ${method} ${request}`);
  });
}

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("manage buildings", () => {
  test("lists the organisation's buildings with their real submission counts", async () => {
    mockApi();
    renderAt("/buildings");

    expect(await screen.findByRole("heading", { name: "Manage Buildings" })).toBeInTheDocument();
    expect(await screen.findByText("Engineering Building")).toBeInTheDocument();
    expect(screen.getByText("Bandar Sunway")).toBeInTheDocument();
    const row = screen.getByText("Engineering Building").closest("li");
    expect(within(row).getByText(/2 submissions/)).toBeInTheDocument();
    expect(within(row).getByText("2026-Q2", { exact: false })).toBeInTheDocument();
    expect(within(row).getByText("UNREVIEWED")).toBeInTheDocument();
    // A building with nothing submitted says so rather than showing a fabricated period.
    expect(screen.getByText("No submissions yet")).toBeInTheDocument();
    expect(screen.getByText("No address recorded")).toBeInTheDocument();
  });

  test("opening a building shows its persisted submission history", async () => {
    mockApi();
    renderAt("/buildings");
    await screen.findByText("Engineering Building");

    const row = screen.getByText("Engineering Building").closest("li");
    await userEvent.click(within(row).getByRole("button", { name: "Open" }));

    const table = await screen.findByRole("table");
    expect(within(table).getByText("#11")).toBeInTheDocument();
    expect(within(table).getByText("2026-Q1")).toBeInTheDocument();
    expect(within(table).getByText("APPROVED")).toBeInTheDocument();
    expect(within(table).getAllByRole("link", { name: "View details" })).toHaveLength(2);
  });

  test("only the name and address can be edited, and that is all that is sent", async () => {
    let sent = null;
    mockApi({
      onPatch: (_request, options) => {
        sent = JSON.parse(options.body);
        return jsonResponse(200, { building: { ...engineering, project_name: "Engineering Building A", location: "Jalan Lagoon" } });
      },
    });
    renderAt("/buildings");
    await screen.findByText("Engineering Building");
    await userEvent.click(within(screen.getByText("Engineering Building").closest("li")).getByRole("button", { name: "Open" }));

    const name = await screen.findByLabelText("Building name");
    await userEvent.clear(name);
    await userEvent.type(name, "Engineering Building A");
    await userEvent.clear(screen.getByLabelText("Address / location"));
    await userEvent.type(screen.getByLabelText("Address / location"), "Jalan Lagoon");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Building details saved.")).toBeInTheDocument();
    expect(Object.keys(sent).sort()).toEqual(["location", "name"]);
    expect(sent).toEqual({ name: "Engineering Building A", location: "Jalan Lagoon" });
  });

  test("nothing on the page can delete a building, a submission or evidence", async () => {
    mockApi();
    renderAt("/buildings");
    await screen.findByText("Engineering Building");
    await userEvent.click(within(screen.getByText("Engineering Building").closest("li")).getByRole("button", { name: "Open" }));
    await screen.findByRole("table");

    for (const label of [/delete/i, /remove/i, /archive/i]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });

  test("a viewer gets neither the navigation link nor the page", async () => {
    mockApi({ user: viewer, buildings: [] });
    renderAt("/buildings");

    expect(await screen.findByRole("heading", { name: /access denied/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage Buildings" })).not.toBeInTheDocument();
  });

  test("a company sees the navigation link", async () => {
    mockApi();
    renderAt("/buildings");
    await screen.findByRole("heading", { name: "Manage Buildings" });

    expect(screen.getByRole("link", { name: "Manage Buildings" })).toHaveAttribute("href", "/buildings");
  });
});
