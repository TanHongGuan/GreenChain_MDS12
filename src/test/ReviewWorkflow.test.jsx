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

const pendingSubmission = {
  submission_id: 7,
  project_name: "Green Tower",
  organisation: "Acme Corp",
  reporting_period: "2026-Q1",
  submitted_by: {
    id: "uploader-id",
    name: "GreenChain Uploader",
    email: "uploader@greenchain.test",
  },
  submitted_at: "2026-09-02T10:00:00+00:00",
  status: "UNREVIEWED",
};

const detailSubmission = {
  ...pendingSubmission,
  original_sha256: "a".repeat(64),
  metrics: [
    {
      metric_name: "Electricity",
      value: 120.5,
      unit: "kWh",
      category: "Energy",
    },
  ],
  evidence: {
    original: { label: "report.csv", url: "/reviews/submissions/7/evidence/original" },
    processed: { label: "report.csv", url: "/reviews/submissions/7/evidence/processed" },
  },
  integrity: { status: "MATCH", sha256: "a".repeat(64) },
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

async function renderReview(responses) {
  mockFetchQueue([{ response: jsonResponse(200, { user: auditor }) }, ...responses]);
  render(
    <MemoryRouter initialEntries={["/review"]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: /auditor review/i });
}

async function openDetail() {
  await userEvent.click(await screen.findByRole("button", { name: /open review/i }));
  const detail = screen.getByLabelText("Submission review detail");
  await within(detail).findByRole("heading", { name: "Green Tower" });
  return detail;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auditor review workflow", () => {
  test("auditor can load pending review queue", async () => {
    await renderReview([{ response: jsonResponse(200, { submissions: [pendingSubmission] }) }]);

    expect(await screen.findByText("Green Tower")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("2026-Q1")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("auditor can open detail with processed metrics and evidence actions", async () => {
    await renderReview([
      { response: jsonResponse(200, { submissions: [pendingSubmission] }) },
      { response: jsonResponse(200, { submission: detailSubmission }) },
    ]);

    const detail = await openDetail();

    expect(within(detail).getByText("Electricity")).toBeInTheDocument();
    expect(within(detail).getByText("120.5")).toBeInTheDocument();
    expect(within(detail).getByText("MATCH")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /original evidence/i })).toHaveAttribute(
      "href",
      "http://localhost:8000/reviews/submissions/7/evidence/original",
    );
    expect(screen.getByRole("link", { name: /processed evidence/i })).toHaveAttribute(
      "href",
      "http://localhost:8000/reviews/submissions/7/evidence/processed",
    );
  });

  test("approve updates the UI from the server response", async () => {
    await renderReview([
      { response: jsonResponse(200, { submissions: [pendingSubmission] }) },
      { response: jsonResponse(200, { submission: detailSubmission }) },
      {
        assert: (url, options) => {
          expect(url).toContain("/reviews/submissions/7/decision");
          expect(options.method).toBe("POST");
          expect(options.credentials).toBe("include");
          expect(JSON.parse(options.body)).toEqual({ decision: "APPROVED", reason: null });
        },
        response: jsonResponse(200, {
          submission_id: 7,
          status: "APPROVED",
          reason: null,
          message: "Submission approved successfully.",
        }),
      },
    ]);
    await openDetail();

    await userEvent.click(screen.getByRole("button", { name: /approve/i }));

    expect(await screen.findByText("Submission approved successfully.")).toBeInTheDocument();
    expect(screen.getByText("APPROVED")).toBeInTheDocument();
  });

  test("reject sends and displays the provided reason", async () => {
    await renderReview([
      { response: jsonResponse(200, { submissions: [pendingSubmission] }) },
      { response: jsonResponse(200, { submission: detailSubmission }) },
      {
        assert: (_url, options) => {
          expect(JSON.parse(options.body)).toEqual({
            decision: "REJECTED",
            reason: "Source values do not match evidence.",
          });
        },
        response: jsonResponse(200, {
          submission_id: 7,
          status: "REJECTED",
          reason: "Source values do not match evidence.",
          message: "Submission rejected successfully.",
        }),
      },
    ]);
    await openDetail();

    await userEvent.type(screen.getByLabelText(/decision reason/i), "Source values do not match evidence.");
    await userEvent.click(screen.getByRole("button", { name: /reject/i }));

    expect(
      await screen.findByText("Submission rejected successfully. Reason: Source values do not match evidence."),
    ).toBeInTheDocument();
    expect(screen.getByText("REJECTED")).toBeInTheDocument();
  });

  test("duplicate decision clicks are prevented while request is active", async () => {
    let resolveDecision;
    const decisionPromise = new Promise((resolve) => {
      resolveDecision = resolve;
    });
    await renderReview([
      { response: jsonResponse(200, { submissions: [pendingSubmission] }) },
      { response: jsonResponse(200, { submission: detailSubmission }) },
      { response: decisionPromise },
    ]);
    await openDetail();

    await userEvent.click(screen.getByRole("button", { name: /approve/i }));

    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /reject/i })).toBeDisabled();
    expect(global.fetch).toHaveBeenCalledTimes(4);

    resolveDecision(
      jsonResponse(200, {
        submission_id: 7,
        status: "APPROVED",
        reason: null,
        message: "Submission approved successfully.",
      }),
    );
    await waitFor(() => expect(screen.getByText("APPROVED")).toBeInTheDocument());
  });
});
