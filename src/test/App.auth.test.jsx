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

const uploader = {
  id: "uploader-id",
  name: "GreenChain Uploader",
  email: "uploader@greenchain.test",
  role: "UPLOADER",
  organisation_id: "demo-org",
};

const auditor = {
  id: "auditor-id",
  name: "GreenChain Auditor",
  email: "auditor@greenchain.test",
  role: "AUDITOR",
  organisation_id: null,
};

const emptyProjectCatalogue = {
  projects: [],
  page: 1,
  page_size: 12,
  total_items: 0,
  total_pages: 0,
  filters: { organisations: [], locations: [], statuses: [], reporting_periods: [] },
};

const emptyDiscovery = {
  recently_updated: [],
  featured: [],
  new_projects: [],
  featured_rule: "No explicit featured flag exists.",
};

const emptyHighlights = { projects: [] };

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function noContentResponse() {
  return new Response(null, { status: 204 });
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

function renderApp(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function renderWithRestoredUser(user, route = "/") {
  const responses = [{ response: jsonResponse(200, { user }) }];
  if (route === "/") {
    responses.push({ response: jsonResponse(200, emptyDiscovery) });
  }
  if (route.startsWith("/projects")) {
    responses.push({ response: jsonResponse(200, emptyProjectCatalogue) });
  }
  if (route.startsWith("/highlighted")) {
    responses.push({ response: jsonResponse(200, emptyHighlights) });
  }
  mockFetchQueue(responses);
  renderApp(route);
  await screen.findByText(user.name);
}

async function renderUnauthenticated(route = "/login") {
  mockFetchQueue([
    {
      response: jsonResponse(401, {
        error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." },
      }),
    },
  ]);
  renderApp(route);
  await screen.findByRole("heading", { name: /sign in/i });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("login", () => {
  test("login page renders", async () => {
    await renderUnauthenticated();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  test("required fields work", async () => {
    await renderUnauthenticated();

    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
  });

  test("login loading state appears", async () => {
    let resolveLogin;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });
    mockFetchQueue([
      {
        response: jsonResponse(401, {
          error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." },
        }),
      },
      {
        assert: (_url, options) => expect(options.credentials).toBe("include"),
        response: loginPromise,
      },
      { response: jsonResponse(200, emptyDiscovery) },
    ]);
    renderApp("/login");
    await screen.findByRole("heading", { name: /sign in/i });

    await userEvent.type(screen.getByLabelText(/email/i), "viewer@greenchain.test");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(screen.getByRole("button", { name: /logging in/i })).toBeDisabled();
    resolveLogin(jsonResponse(200, { user: viewer }));
    await screen.findByRole("heading", { name: "Home" });
  });

  test("invalid credentials display safe error", async () => {
    mockFetchQueue([
      {
        response: jsonResponse(401, {
          error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." },
        }),
      },
      {
        response: jsonResponse(401, {
          error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." },
        }),
      },
    ]);
    renderApp("/login");
    await screen.findByRole("heading", { name: /sign in/i });

    await userEvent.type(screen.getByLabelText(/email/i), "viewer@greenchain.test");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
  });

  test("valid login stores returned user in AuthContext", async () => {
    mockFetchQueue([
      {
        response: jsonResponse(401, {
          error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." },
        }),
      },
      {
        assert: (url, options) => {
          expect(url).toContain("/auth/login");
          expect(options.credentials).toBe("include");
        },
        response: jsonResponse(200, { user: uploader }),
      },
    ]);
    renderApp("/login");
    await screen.findByRole("heading", { name: /sign in/i });

    await userEvent.type(screen.getByLabelText(/email/i), "uploader@greenchain.test");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("GreenChain Uploader")).toBeInTheDocument();
    expect(screen.getByText("UPLOADER")).toBeInTheDocument();
  });
});

describe("auth restoration", () => {
  test("/auth/me success restores current user", async () => {
    await renderWithRestoredUser(auditor);

    expect(screen.getByText("GreenChain Auditor")).toBeInTheDocument();
    expect(screen.getByText("AUDITOR")).toBeInTheDocument();
  });

  test("/auth/me 401 leaves user unauthenticated", async () => {
    await renderUnauthenticated("/projects");

    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  test("loading state prevents premature redirect", () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    renderApp("/projects");

    expect(screen.getByText("Loading GreenChain...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /sign in/i })).not.toBeInTheDocument();
  });
});

describe("protected routes", () => {
  test("unauthenticated protected route redirects to login", async () => {
    await renderUnauthenticated("/projects");

    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  test("authenticated normal route renders", async () => {
    await renderWithRestoredUser(viewer, "/projects");

    expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
  });
});

describe("viewer role", () => {
  test("Viewer does not see Upload Data", async () => {
    await renderWithRestoredUser(viewer);

    expect(screen.queryByRole("link", { name: /upload data/i })).not.toBeInTheDocument();
  });

  test("Viewer does not see Review", async () => {
    await renderWithRestoredUser(viewer);

    expect(screen.queryByRole("link", { name: /^review$/i })).not.toBeInTheDocument();
  });

  test("Viewer cannot access /upload", async () => {
    await renderWithRestoredUser(viewer, "/upload");

    expect(screen.getByRole("heading", { name: /access denied/i })).toBeInTheDocument();
  });

  test("Viewer cannot access /review", async () => {
    await renderWithRestoredUser(viewer, "/review");

    expect(screen.getByRole("heading", { name: /access denied/i })).toBeInTheDocument();
  });
});

describe("uploader role", () => {
  test("Uploader sees Upload Data", async () => {
    await renderWithRestoredUser(uploader);

    expect(screen.getByRole("link", { name: /upload data/i })).toBeInTheDocument();
  });

  test("Uploader does not see Review", async () => {
    await renderWithRestoredUser(uploader);

    expect(screen.queryByRole("link", { name: /^review$/i })).not.toBeInTheDocument();
  });

  test("Uploader can access /upload", async () => {
    await renderWithRestoredUser(uploader, "/upload");

    expect(screen.getByRole("heading", { name: /upload data/i })).toBeInTheDocument();
  });

  test("Uploader cannot access /review", async () => {
    await renderWithRestoredUser(uploader, "/review");

    expect(screen.getByRole("heading", { name: /access denied/i })).toBeInTheDocument();
  });
});

describe("auditor role", () => {
  test("Auditor sees Review", async () => {
    await renderWithRestoredUser(auditor);

    expect(screen.getByRole("link", { name: /^review$/i })).toBeInTheDocument();
  });

  test("Auditor does not see Upload Data", async () => {
    await renderWithRestoredUser(auditor);

    expect(screen.queryByRole("link", { name: /upload data/i })).not.toBeInTheDocument();
  });

  test("Auditor can access /review", async () => {
    await renderWithRestoredUser(auditor, "/review");

    expect(screen.getByRole("heading", { name: /auditor review/i })).toBeInTheDocument();
  });

  test("Auditor cannot access /upload", async () => {
    await renderWithRestoredUser(auditor, "/upload");

    expect(screen.getByRole("heading", { name: /access denied/i })).toBeInTheDocument();
  });
});

describe("logout", () => {
  test("logout calls backend", async () => {
    mockFetchQueue([
      { response: jsonResponse(200, { user: viewer }) },
      { response: jsonResponse(200, emptyDiscovery) },
      {
        assert: (url, options) => {
          expect(url).toContain("/auth/logout");
          expect(options.method).toBe("POST");
          expect(options.credentials).toBe("include");
        },
        response: noContentResponse(),
      },
    ]);
    renderApp("/");
    await screen.findByText("GreenChain Viewer");

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test("logout clears current user", async () => {
    mockFetchQueue([
      { response: jsonResponse(200, { user: viewer }) },
      { response: jsonResponse(200, emptyDiscovery) },
      { response: noContentResponse() },
    ]);
    renderApp("/");
    await screen.findByText("GreenChain Viewer");

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => {
      expect(screen.queryByText("GreenChain Viewer")).not.toBeInTheDocument();
    });
  });

  test("logout redirects to login", async () => {
    mockFetchQueue([
      { response: jsonResponse(200, { user: viewer }) },
      { response: jsonResponse(200, emptyDiscovery) },
      { response: noContentResponse() },
    ]);
    renderApp("/");
    await screen.findByText("GreenChain Viewer");

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });
});
