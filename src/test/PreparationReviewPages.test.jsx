import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../services/dataService.js", async () => {
  const mock = await import("../mocks/mockService.js");
  return {
    getMockBuildingPreparation: mock.getBuildingPreparation,
    selectMockBuildingScheme: mock.selectBuildingScheme,
    saveMockCriterionPreparation: mock.saveCriterionPreparation,
    assignMockPreparationConsultant: mock.assignPreparationConsultant,
    getAssignedMockPreparations: mock.getAssignedPreparations,
    getAssignedMockPreparation: mock.getAssignedPreparation,
    reviewMockPreparationCriterion: mock.reviewPreparationCriterion,
  };
});
import { BuildingPreparationPage } from "../pages/BuildingPreparationPage.jsx";
import { PreparationReviewsPage } from "../pages/PreparationReviewsPage.jsx";
import { findDemoUserByEmail, setDemoUser } from "../mocks/identity.js";
import { resetMockStore } from "../mocks/store.js";

const as = (email) => setDemoUser(findDemoUserByEmail(email));
const renderAt = (path) => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/my-buildings/:buildingId/preparation" element={<BuildingPreparationPage />} />
  <Route path="/preparation-reviews" element={<PreparationReviewsPage />} />
  <Route path="/preparation-reviews/:preparationId" element={<PreparationReviewsPage />} />
</Routes></MemoryRouter>);
beforeEach(() => { sessionStorage.clear(); resetMockStore(); as("uploader@demo.greenchain.test"); });

describe("mock preparation review pages", () => {
  it("lets the company assign, consultant request revision, and company see feedback", async () => {
    const user = userEvent.setup();
    let page = renderAt("/my-buildings/101/preparation");
    await screen.findByRole("heading", { name: "Select a preparation scheme" });
    await user.click(screen.getAllByRole("button", { name: "Select" })[0]);
    await user.selectOptions(screen.getByLabelText("Demo consultant"), "3");
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(await screen.findByText(/Demo Auditor · Assigned/)).toBeInTheDocument();
    page.unmount();

    as("auditor@demo.greenchain.test");
    page = renderAt("/preparation-reviews");
    expect(await screen.findByRole("heading", { name: "Riverview Learning Centre" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Open review" }));
    const ee5 = within((await screen.findByText(/EE5 · Advanced or Improved/)).closest("form"));
    expect(ee5.getByText(/Company evidence:/)).toBeInTheDocument();
    await user.selectOptions(ee5.getByLabelText("Internal review outcome"), "NEEDS_REVISION");
    await user.type(ee5.getByLabelText("Consultant feedback"), "Please provide the BEI calculation.");
    await user.click(ee5.getByRole("button", { name: "Save internal review" }));
    expect(await ee5.findByRole("status")).toHaveTextContent("Saved");
    page.unmount();

    as("uploader@demo.greenchain.test");
    page = renderAt("/my-buildings/101/preparation");
    const companyEe5 = within((await screen.findByText(/EE5 · Advanced or Improved/)).closest("form"));
    expect(companyEe5.getByText(/Please provide the BEI calculation/)).toBeInTheDocument();
    await user.type(companyEe5.getByLabelText("Company note"), "Calculation requested");
    await user.click(companyEe5.getByRole("button", { name: "Save evidence" }));
    expect(await companyEe5.findByText(/outdated - another review required/)).toBeInTheDocument();
    page.unmount();
  });

  it("shows an empty queue for an unassigned consultant", async () => {
    as("second-auditor@demo.greenchain.test");
    renderAt("/preparation-reviews");
    expect(await screen.findByText(/No certification preparations are currently assigned/)).toBeInTheDocument();
  });
});
