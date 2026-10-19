import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AppRoutes } from "../App.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";

const accounts = [
  { id: "u-view", name: "GreenChain Viewer", email: "viewer@greenchain.test", role: "VIEWER", organisation_id: null },
  { id: "u-up", name: "GreenChain Uploader", email: "uploader@greenchain.test", role: "UPLOADER", organisation_id: "org-1" },
  { id: "u-aud", name: "GreenChain Auditor", email: "auditor@greenchain.test", role: "AUDITOR", organisation_id: null },
];

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function queue(responses) {
  global.fetch = vi.fn((url, options = {}) => {
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected fetch call: ${url}`);
    next.assert?.(url, options);
    return Promise.resolve(next.response);
  });
}

function renderLogin() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const unauthenticated = { response: json(401, { error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required." } }) };

afterEach(() => vi.restoreAllMocks());

describe("account-select login", () => {
  test("shows a dropdown of accounts and no password field", async () => {
    queue([unauthenticated, { assert: (url) => expect(url).toContain("/auth/accounts"), response: json(200, { accounts }) }]);
    renderLogin();

    const select = await screen.findByLabelText(/account/i);

    expect(select).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /GreenChain Auditor · Auditor/ })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(accounts.length + 1);
  });

  test("selecting an account and pressing Log In signs in as that account", async () => {
    queue([
      unauthenticated,
      { response: json(200, { accounts }) },
      {
        assert: (url, options) => {
          expect(url).toContain("/auth/select");
          expect(options.method).toBe("POST");
          expect(options.credentials).toBe("include");
          expect(JSON.parse(options.body)).toEqual({ user_id: "u-aud" });
        },
        response: json(200, { user: accounts[2] }),
      },
      { response: json(200, { summary: {}, recently_updated: [], featured: [], new_projects: [], sections: {} }) },
    ]);
    renderLogin();

    await userEvent.selectOptions(await screen.findByLabelText(/account/i), "u-aud");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("GreenChain Auditor")).toBeInTheDocument();
    expect(screen.getByText("AUDITOR")).toBeInTheDocument();
  });

  test("asks for an account before logging in", async () => {
    queue([unauthenticated, { response: json(200, { accounts }) }]);
    renderLogin();

    await screen.findByLabelText(/account/i);
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Choose an account.");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("falls back to email and password when account selection is disabled", async () => {
    queue([unauthenticated, { response: json(404, { error: { code: "NOT_FOUND", message: "Not found." } }) }]);
    renderLogin();

    expect(await screen.findByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/account/i)).not.toBeInTheDocument();
  });
});
