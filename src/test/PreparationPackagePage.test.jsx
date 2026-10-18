import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/dataService.js", async () => {
  const mock = await import("../mocks/mockService.js");
  return { getMockPreparationPackage: mock.getPreparationPackage, exportMockPreparationPackage: mock.exportPreparationPackage };
});

import { PreparationPackagePage } from "../pages/PreparationPackagePage.jsx";
import * as mock from "../mocks/mockService.js";
import { findDemoUserByEmail, setDemoUser } from "../mocks/identity.js";
import { resetMockStore } from "../mocks/store.js";

beforeEach(() => { sessionStorage.clear(); resetMockStore(); setDemoUser(findDemoUserByEmail("uploader@demo.greenchain.test")); });

const renderPage = () => render(<MemoryRouter initialEntries={["/my-buildings/101/package"]}><Routes><Route path="/my-buildings/:buildingId/package" element={<PreparationPackagePage />} /></Routes></MemoryRouter>);

describe("preparation package page", () => {
  it("shows scheme prerequisite, then previews and downloads the same document", async () => {
    const user = userEvent.setup();
    const view = renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Select a preparation scheme");
    view.unmount();
    await mock.selectBuildingScheme(101, "GBI_NREB");
    const create = vi.fn(() => "blob:test-package");
    const revoke = vi.fn();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderPage();
    const frame = await screen.findByTitle("Unofficial certification preparation report preview");
    expect(frame.getAttribute("srcdoc")).toContain("GBI_NREB");
    await user.click(screen.getByRole("button", { name: "Download HTML report" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Standalone HTML report downloaded");
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });
});
