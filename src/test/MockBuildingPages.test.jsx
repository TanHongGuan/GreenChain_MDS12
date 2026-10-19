import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getOwnedMockBuildings: vi.fn(), getOwnedMockBuilding: vi.fn(), createMockBuilding: vi.fn(), updateMockBuilding: vi.fn(), createSubmission: vi.fn(),
}));
const auth = vi.hoisted(() => ({ user: { id: 2, role: "UPLOADER", organisation_id: "demo-civic-trust" } }));
vi.mock("../services/dataService.js", () => ({ ...service, isMockMode: true }));
vi.mock("../auth/AuthContext.jsx", () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, isLoading: false, logout: async () => {} }) }));

import { MyBuildingsPage } from "../pages/MyBuildingsPage.jsx";
import { BuildingFormPage } from "../pages/BuildingFormPage.jsx";
import { UploadPlaceholder } from "../pages/UploadPlaceholder.jsx";
import { AppRoutes } from "../App.jsx";

const building = { project_id: 101, project_name: "Riverview Learning Centre", organisation: "Demo Civic Trust", organisation_id: "demo-civic-trust", location: "Kuala Lumpur", description: "Demo building", submission_count: 3, latest_submission: { reporting_period: "2026-Q1", status: "APPROVED" } };

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: 2, role: "UPLOADER", organisation_id: "demo-civic-trust" };
  service.getOwnedMockBuildings.mockResolvedValue([building]);
  service.getOwnedMockBuilding.mockResolvedValue(building);
  service.createMockBuilding.mockResolvedValue({ ...building, project_id: 109 });
  service.updateMockBuilding.mockResolvedValue(building);
  service.createSubmission.mockResolvedValue({ submission_id: 1116, project_id: 101, status: "UNREVIEWED" });
});

function renderRoute(path) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/my-buildings" element={<MyBuildingsPage />} /><Route path="/my-buildings/new" element={<BuildingFormPage />} /><Route path="/my-buildings/:buildingId/edit" element={<BuildingFormPage />} /><Route path="/upload" element={<UploadPlaceholder />} /></Routes></MemoryRouter>);
}

describe("mock company pages", () => {
  it("shows owned buildings with summary and view/edit/upload actions", async () => {
    renderRoute("/my-buildings");
    expect(await screen.findByRole("heading", { name: "Riverview Learning Centre" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Latest: 2026-Q1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload" })).toHaveAttribute("href", "/upload?building=101");
  });

  it("supports empty and error states", async () => {
    service.getOwnedMockBuildings.mockResolvedValueOnce([]);
    const view = renderRoute("/my-buildings");
    expect(await screen.findByText(/No buildings in your demo organisation/)).toBeInTheDocument();
    view.unmount();
    service.getOwnedMockBuildings.mockRejectedValueOnce(new Error("Service unavailable"));
    renderRoute("/my-buildings");
    expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable");
  });

  it("creates from the form and displays service validation errors", async () => {
    const user = userEvent.setup();
    renderRoute("/my-buildings/new");
    await user.click(screen.getByRole("button", { name: "Create building" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Building name is required");
    await user.type(screen.getByLabelText("Building name"), "  New Workshop  ");
    await user.type(screen.getByLabelText("Location"), "  Selangor  ");
    service.createMockBuilding.mockRejectedValueOnce(new Error("A building with this name already exists in your organisation."));
    await user.click(screen.getByRole("button", { name: "Create building" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    await user.click(screen.getByRole("button", { name: "Create building" }));
    await waitFor(() => expect(service.createMockBuilding).toHaveBeenLastCalledWith({ project_name: "  New Workshop  ", location: "  Selangor  ", description: "" }));
    expect(await screen.findByRole("heading", { name: "My Buildings" })).toBeInTheDocument();
  });

  it("loads editable fields and submits metadata against the same ID", async () => {
    const user = userEvent.setup();
    renderRoute("/my-buildings/101/edit");
    expect(await screen.findByDisplayValue("Riverview Learning Centre")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Location"));
    await user.type(screen.getByLabelText("Location"), "Johor");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(service.updateMockBuilding).toHaveBeenCalledWith("101", { project_name: "Riverview Learning Centre", location: "Johor", description: "Demo building" }));
  });

  it("selects an owned building and passes its stable ID through the upload confirmation", async () => {
    const user = userEvent.setup();
    renderRoute("/upload?building=101");
    await screen.findByRole("option", { name: "Riverview Learning Centre" });
    expect(screen.getByLabelText("Your building")).toHaveValue("101");
    await user.type(screen.getByLabelText("Reporting year"), "2026");
    await user.selectOptions(screen.getByLabelText("Quarter"), "Q3");
    await user.upload(screen.getByLabelText("Submission file"), new File(["metric_name,value,unit\nElectricity,42,kWh\n"], "demo.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: "Review file" }));
    expect(await screen.findByRole("heading", { name: "Confirm submission" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm upload" }));
    await waitFor(() => expect(service.createSubmission).toHaveBeenCalledWith(expect.objectContaining({ projectId: 101, projectName: "Riverview Learning Centre", organisation: "Demo Civic Trust", reportingPeriod: "2026-Q3" })));
  });

  it.each(["VIEWER", "AUDITOR"])("blocks %s from company mutation routes", async (role) => {
    auth.user = { id: role === "VIEWER" ? 1 : 3, role, organisation_id: null };
    render(<MemoryRouter initialEntries={["/my-buildings/new"]}><AppRoutes /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Access Denied" })).toBeInTheDocument();
    expect(service.createMockBuilding).not.toHaveBeenCalled();
  });

});
