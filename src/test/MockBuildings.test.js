import { beforeEach, describe, expect, it } from "vitest";
import * as mock from "../mocks/mockService.js";
import { clearMockStoreCache, getStore, resetMockStore } from "../mocks/store.js";
import { clearDemoUser, findDemoUserByEmail, setDemoUser } from "../mocks/identity.js";

const civic = () => setDemoUser(findDemoUserByEmail("uploader@demo.greenchain.test"));
const future = () => setDemoUser(findDemoUserByEmail("future-uploader@demo.greenchain.test"));
const file = new File(["metric_name,value,unit\nElectricity,42,kWh\n"], "demo.csv", { type: "text/csv" });

beforeEach(() => { sessionStorage.clear(); resetMockStore(); });

describe("company building mock service", () => {
  it("lists only the signed-in uploader's organisation and rejects other roles", async () => {
    await expect(mock.getOwnedBuildings()).rejects.toMatchObject({ status: 401 });
    civic();
    expect((await mock.getOwnedBuildings()).map((item) => item.project_id)).toEqual([101, 102, 105, 106]);
    expect((await mock.getOwnedBuildings()).find((item) => item.project_id === 101)).toMatchObject({ submission_count: 3, latest_submission: { submission_id: 1003 } });
    future();
    expect((await mock.getOwnedBuildings()).map((item) => item.project_id)).toEqual([103, 104, 107, 108]);
    setDemoUser(findDemoUserByEmail("viewer@demo.greenchain.test"));
    await expect(mock.createBuilding({ project_name: "Denied" })).rejects.toMatchObject({ status: 403 });
  });

  it("creates stable owned buildings, trims fields and preserves them across reloads/persona switches", async () => {
    civic();
    const created = await mock.createBuilding({ project_name: "  Civic Workshop  ", location: "  Selangor  ", description: "  Demo site  ", organisation_id: "demo-future-works" });
    expect(created).toMatchObject({ project_id: 109, organisation_id: "demo-civic-trust", project_name: "Civic Workshop", location: "Selangor", description: "Demo site" });
    expect((await mock.getOwnedBuildings()).some((item) => item.project_id === 109)).toBe(true);
    future();
    expect((await mock.getOwnedBuildings()).some((item) => item.project_id === 109)).toBe(false);
    clearMockStoreCache();
    civic();
    expect((await mock.getOwnedBuilding(109)).project_name).toBe("Civic Workshop");
    expect(getStore().nextProjectId).toBe(110);
  });

  it("rejects missing names and case-insensitive duplicates within one organisation", async () => {
    civic();
    await expect(mock.createBuilding({ project_name: "   " })).rejects.toMatchObject({ status: 400 });
    await expect(mock.createBuilding({ project_name: " riverview learning centre " })).rejects.toMatchObject({ status: 409 });
    await mock.createBuilding({ project_name: "Shared Name" });
    await expect(mock.createBuilding({ project_name: "  SHARED NAME  " })).rejects.toMatchObject({ status: 409 });
    future();
    expect((await mock.createBuilding({ project_name: "shared name" })).organisation_id).toBe("demo-future-works");
  });

  it("edits only owned metadata, retaining IDs, submissions, decisions and metric values", async () => {
    civic();
    const historyBefore = structuredClone(getStore().submissions.filter((item) => item.project_id === 101));
    const updated = await mock.updateBuilding(101, { project_name: "Riverview Campus", location: "Johor", description: "Updated", organisation_id: "demo-future-works", project_id: 777 });
    expect(updated).toMatchObject({ project_id: 101, organisation_id: "demo-civic-trust", project_name: "Riverview Campus", location: "Johor" });
    expect(getStore().submissions.filter((item) => item.project_id === 101)).toEqual(historyBefore);
    expect((await mock.getMetricHistory(101, "Electricity")).points.some((point) => point.value === 124000)).toBe(true);
    await expect(mock.updateBuilding(102, { project_name: "riverview campus" })).rejects.toMatchObject({ status: 409 });
    future();
    await expect(mock.updateBuilding(101, { project_name: "Stolen" })).rejects.toMatchObject({ status: 404 });
    expect(getStore().projects.find((item) => item.project_id === 101).organisation_id).toBe("demo-civic-trust");
  });

  it("associates selected uploads with the owned stable ID and denies foreign selection", async () => {
    civic();
    const building = await mock.createBuilding({ project_name: "New Campus" });
    const result = await mock.createSubmission({ projectId: building.project_id, projectName: "Ignored", organisation: "Demo Future Works", reportingPeriod: "2026-Q3", file, previewRows: [{ metric_name: "Electricity", value: 42, unit: "kWh" }] });
    expect(result.project_id).toBe(building.project_id);
    expect(getStore().projects).toHaveLength(9);
    expect((await mock.getProjectSubmissions(building.project_id))[0]).toMatchObject({ submission_id: result.submission_id, project_name: "New Campus", organisation: "Demo Civic Trust" });
    expect((await mock.getOwnedBuildings()).find((item) => item.project_id === building.project_id).submission_count).toBe(1);
    await expect(mock.createSubmission({ projectId: 103, reportingPeriod: "2026-Q3", file, previewRows: [] })).rejects.toMatchObject({ status: 403 });
    await expect(mock.createSubmission({ projectName: "Canopy Research Hall", organisation: "Demo Future Works", reportingPeriod: "2026-Q3", file, previewRows: [] })).rejects.toMatchObject({ status: 403 });
    clearDemoUser();
    await expect(mock.createSubmission({ projectId: building.project_id, reportingPeriod: "2026-Q3", file, previewRows: [] })).rejects.toMatchObject({ status: 401 });
  });
});
