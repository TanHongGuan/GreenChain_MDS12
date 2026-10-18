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
  };
});
import { BuildingPreparationPage } from "../pages/BuildingPreparationPage.jsx";
import { findDemoUserByEmail, setDemoUser } from "../mocks/identity.js";
import { resetMockStore } from "../mocks/store.js";

beforeEach(() => { sessionStorage.clear(); resetMockStore(); setDemoUser(findDemoUserByEmail("uploader@demo.greenchain.test")); });
const renderPage = (buildingId = 101) => render(<MemoryRouter initialEntries={[`/my-buildings/${buildingId}/preparation`]}><Routes><Route path="/my-buildings/:buildingId/preparation" element={<BuildingPreparationPage />} /></Routes></MemoryRouter>);

describe("company preparation workspace", () => {
  it("selects GBI, navigates categories, saves a building submission and reloads", async () => {
    const user = userEvent.setup();
    const view = renderPage();
    await screen.findByRole("heading", { name: "Select a preparation scheme" });
    await user.click(screen.getAllByRole("button", { name: "Select" })[0]);
    expect(await screen.findByText(/EE5 · Advanced or Improved/)).toBeInTheDocument();
    const ee5 = within(screen.getByText(/EE5 · Advanced or Improved/).closest("form"));
    await user.click(ee5.getByRole("checkbox", { name: /#1001/ }));
    await user.selectOptions(ee5.getByLabelText("Evidence availability"), "PROVIDED");
    await user.type(ee5.getByLabelText("Company note"), "Area record to follow");
    await user.click(ee5.getByRole("button", { name: "Save evidence" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByText("13%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /WE · Water Efficiency/ }));
    expect(screen.getByText(/WE5 · Metering/)).toBeInTheDocument();
    expect(screen.queryByText(/EE5 · Advanced/)).not.toBeInTheDocument();
    view.unmount();
    renderPage();
    expect(await screen.findByText("13%")).toBeInTheDocument();
    expect(within(screen.getByText(/EE5 · Advanced or Improved/).closest("form")).getByRole("checkbox", { name: /#1001/ })).toBeChecked();
  });

  it("shows a neutral scheme choice without claiming certification", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Select a preparation scheme" })).toBeInTheDocument();
    expect(screen.getByText(/No official assessment, score, eligibility or certification/)).toBeInTheDocument();
    expect(screen.getByText("V4.0 (February 2026)")).toBeInTheDocument();
  });

  it("toggles the intended submission from its label and retains multiple links", async () => {
    setDemoUser(findDemoUserByEmail("future-uploader@demo.greenchain.test"));
    const user = userEvent.setup();
    const view = renderPage(107);
    await screen.findByRole("heading", { name: "Select a preparation scheme" });
    await user.click(screen.getAllByRole("button", { name: "Select" })[1]);
    const criterion = within((await screen.findByText(/ENRB 1-9 · Energy Policy/)).closest("form"));
    const first = criterion.getByRole("checkbox", { name: /#1111/ });
    const second = criterion.getByRole("checkbox", { name: /#1110/ });
    await user.click(criterion.getByText(/#1111 · 2026-Q2/));
    expect(first).toBeChecked();
    expect(second).not.toBeChecked();
    await user.click(criterion.getByText(/#1110 · 2026-Q1/));
    expect(first).toBeChecked();
    expect(second).toBeChecked();
    await user.click(criterion.getByRole("button", { name: "Save evidence" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    view.unmount();
    renderPage(107);
    const reloaded = within((await screen.findByText(/ENRB 1-9 · Energy Policy/)).closest("form"));
    expect(reloaded.getByRole("checkbox", { name: /#1111/ })).toBeChecked();
    expect(reloaded.getByRole("checkbox", { name: /#1110/ })).toBeChecked();
  });
});
