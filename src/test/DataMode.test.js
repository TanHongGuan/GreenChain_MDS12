import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); sessionStorage.clear(); });

describe("data mode boundary", () => {
  it("keeps mock login and discovery entirely local", async () => {
    vi.stubEnv("VITE_DATA_MODE", "mock");
    vi.resetModules();
    const service = await import("../services/dataService.js");
    global.fetch = vi.fn(() => { throw new Error("Mock mode used network"); });
    expect(service.isMockMode).toBe(true);
    expect((await service.login("uploader@demo.greenchain.test")).role).toBe("UPLOADER");
    expect((await service.getHomeDiscovery()).summary.total_projects).toBe(8);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not grant a role to arbitrary email prefixes and requires reset confirmation", async () => {
    vi.stubEnv("VITE_DATA_MODE", "mock");
    vi.resetModules();
    const service = await import("../services/dataService.js");
    global.fetch = vi.fn(() => { throw new Error("Mock mode used network"); });
    await expect(service.login("uploader-anyone@example.test", "demo")).rejects.toMatchObject({ status: 401 });
    await expect(service.getCurrentUser()).rejects.toMatchObject({ status: 401 });
    const uploader = await service.login("uploader@demo.greenchain.test", "demo");
    expect((await service.getOwnedMockBuildings()).every((project) => project.organisation_id === uploader.organisation_id)).toBe(true);
    expect(() => service.resetDemoData()).toThrow("Confirm demo reset first.");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("delegates real discovery to the existing API client", async () => {
    vi.stubEnv("VITE_DATA_MODE", "real");
    vi.resetModules();
    const service = await import("../services/dataService.js");
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ recently_updated: [], featured: [], new_projects: [], featured_rule: "" }), { status: 200 }));
    expect(service.isMockMode).toBe(false);
    await service.getHomeDiscovery();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/discovery/home"), { credentials: "include" });
    await expect(service.getOwnedMockBuildings()).rejects.toMatchObject({ status: 501 });
    await expect(service.createMockBuilding({ project_name: "No real endpoint" })).rejects.toMatchObject({ status: 501 });
    await expect(service.updateMockBuilding(1, { project_name: "No real endpoint" })).rejects.toMatchObject({ status: 501 });
    expect(() => service.resetDemoData(true)).toThrow("mock mode only");
  });
});
