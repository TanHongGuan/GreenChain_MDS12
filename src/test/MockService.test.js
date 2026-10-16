import { beforeEach, describe, expect, it } from "vitest";
import * as mock from "../mocks/mockService.js";
import { resetMockStore } from "../mocks/store.js";

describe("mock service contract", () => {
  beforeEach(() => { sessionStorage.clear(); resetMockStore(); });

  it("derives overview counts from the same projects and submissions", async () => {
    const home = await mock.getHomeDiscovery();
    expect(home.summary).toMatchObject({ total_projects: 4, total_organisations: 2, total_submissions: 7, approved_submissions: 5, unreviewed_submissions: 1 });
    expect(home.recently_updated.every((item) => item.project_id)).toBe(true);
  });

  it("combines search, filters, sorting and pagination", async () => {
    const result = await mock.getProjectCatalogue({ search: "library", organisation: "Demo Future Works", status: ["APPROVED"], sort: "project_name_asc", page: 1, page_size: 1 });
    expect(result.total_items).toBe(1);
    expect(result.projects[0].project_name).toBe("Harbour Community Library");
  });

  it("never includes rejected values in approved history", async () => {
    const history = await mock.getMetricHistory(102, "Electricity");
    expect(history.points.map((point) => point.value)).toEqual([88500]);
  });

  it("updates highlights without touching fetch", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => { throw new Error("Network used in mock mode"); };
    try {
      await mock.addHighlightedProject(101);
      expect((await mock.getHighlightedProjects()).projects.map((item) => item.project_id)).toEqual([101]);
      await mock.removeHighlightedProject(101);
      expect((await mock.getHighlightedProjects()).projects).toEqual([]);
    } finally { globalThis.fetch = originalFetch; }
  });
});
