import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { ComparePage } from "../pages/ComparePage.jsx";

vi.mock("../services/comparisonService.js", () => ({ getComparisonSnapshot: vi.fn(async () => ({
  projects: [
    { project_id: 1, project_name: "Alpha Hall", organisation: "Civic Trust" },
    { project_id: 2, project_name: "Beta Hall", organisation: "Civic Trust" },
  ],
  submissions: [
    { submission_id: 1, project_id: 1, reporting_period: "2025-Q4", status: "APPROVED", metrics: [{ metric_name: "Electricity", value: 100, unit: "kWh" }] },
    { submission_id: 2, project_id: 1, reporting_period: "2026-Q1", status: "APPROVED", metrics: [{ metric_name: "Electricity", value: 120, unit: "kWh" }, { metric_name: "Water", value: 12, unit: "m3" }] },
    { submission_id: 3, project_id: 2, reporting_period: "2026-Q1", status: "UNREVIEWED", metrics: [{ metric_name: "Electricity", value: 900, unit: "kWh" }] },
  ],
})) }));

describe("Compare page", () => {
  test("switches views, metrics, quarters, and building selections", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ComparePage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Electricity by building" })).toBeInTheDocument();
    expect(screen.getByText("No approved submission")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Metric"), "water");
    expect(screen.getByRole("heading", { name: "Water by building" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Beta Hall" }));
    expect(screen.getByText("Select one more building for a comparison.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Organisation Performance" }));
    expect(screen.getAllByText(/1 of 2 buildings reporting/).length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText("Reporting quarter"), "2025-Q4");
    expect(screen.getAllByText(/2025-Q4 · 1 of 2 buildings reporting/).length).toBeGreaterThan(0);
  });
});
