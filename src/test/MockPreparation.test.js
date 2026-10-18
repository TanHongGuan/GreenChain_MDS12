import { beforeEach, describe, expect, it } from "vitest";
import * as mock from "../mocks/mockService.js";
import { clearMockStoreCache, getStore, MOCK_STORAGE_KEY, resetMockStore, saveStore } from "../mocks/store.js";
import { findDemoUserByEmail, setDemoUser } from "../mocks/identity.js";

const civic = () => setDemoUser(findDemoUserByEmail("uploader@demo.greenchain.test"));
const future = () => setDemoUser(findDemoUserByEmail("future-uploader@demo.greenchain.test"));
beforeEach(() => { sessionStorage.clear(); resetMockStore(); civic(); });

describe("mock certification preparation", () => {
  it("selects either source version per building and keeps scheme criteria separate", async () => {
    const gbi = await mock.selectBuildingScheme(101, "GBI_NREB");
    expect(gbi.scheme.categories.map((item) => item.id)).toEqual(["EE", "EQ", "SM", "MR", "WE", "IN"]);
    expect(gbi.responses.EE5.status).toBe("MISSING");
    expect(gbi.responses["ENRB 1-9"]).toBeUndefined();
    expect(gbi.preparation.project_id).toBe(101);
    const greenre = await mock.selectBuildingScheme(102, "GREENRE_ENRB");
    expect(greenre.scheme.categories).toHaveLength(6);
    expect(greenre.responses["ENRB 1-9"].status).toBe("MISSING");
    expect(greenre.responses.EE5).toBeUndefined();
  });

  it("links and removes only same-building submissions; status and progress survive reload", async () => {
    await mock.selectBuildingScheme(101, "GBI_NREB");
    await expect(mock.saveCriterionPreparation(101, "EE5", { status: "PROVIDED", note: "wrong", submission_ids: [1004] })).rejects.toMatchObject({ status: 400 });
    let view = await mock.saveCriterionPreparation(101, "EE5", { status: "PROVIDED", note: "  BEI calculation pending  ", submission_ids: [1001, 1001] });
    expect(view.responses.EE5).toMatchObject({ status: "PROVIDED", note: "BEI calculation pending", submission_ids: [1001] });
    expect(view.summary).toMatchObject({ provided: 1, total: 8, percent: 13 });
    clearMockStoreCache();
    expect((await mock.getBuildingPreparation(101)).responses.EE5.submission_ids).toEqual([1001]);
    view = await mock.saveCriterionPreparation(101, "EE5", { status: "NEEDS_ATTENTION", note: "Need area", submission_ids: [] });
    expect(view.summary).toMatchObject({ provided: 0, needs_attention: 1, missing: 7, percent: 0 });
  });

  it("requires confirmation on scheme switch and restores isolated prior responses", async () => {
    await mock.selectBuildingScheme(101, "GBI_NREB");
    await mock.saveCriterionPreparation(101, "EE5", { status: "PROVIDED", note: "Internal record", submission_ids: [] });
    await expect(mock.selectBuildingScheme(101, "GREENRE_ENRB")).rejects.toMatchObject({ status: 409 });
    const greenre = await mock.selectBuildingScheme(101, "GREENRE_ENRB", true);
    expect(greenre.summary.provided).toBe(0);
    expect(greenre.responses.EE5).toBeUndefined();
    const gbi = await mock.selectBuildingScheme(101, "GBI_NREB", true);
    expect(gbi.responses.EE5.status).toBe("PROVIDED");
  });

  it("enforces owner and role checks on read and every mutation", async () => {
    await mock.selectBuildingScheme(101, "GBI_NREB");
    future();
    await expect(mock.getBuildingPreparation(101)).rejects.toMatchObject({ status: 404 });
    await expect(mock.selectBuildingScheme(101, "GREENRE_ENRB", true)).rejects.toMatchObject({ status: 404 });
    await expect(mock.saveCriterionPreparation(101, "EE5", { status: "PROVIDED", note: "", submission_ids: [] })).rejects.toMatchObject({ status: 404 });
    setDemoUser(findDemoUserByEmail("viewer@demo.greenchain.test"));
    await expect(mock.getBuildingPreparation(101)).rejects.toMatchObject({ status: 403 });
  });

  it("migrates old data, handles stale links, and clears preparations on reset", async () => {
    await mock.selectBuildingScheme(101, "GBI_NREB");
    await mock.saveCriterionPreparation(101, "EE5", { status: "PROVIDED", note: "", submission_ids: [1001] });
    getStore().submissions = getStore().submissions.filter((item) => item.submission_id !== 1001);
    saveStore(); clearMockStoreCache();
    expect((await mock.getBuildingPreparation(101)).responses.EE5.stale_submission_ids).toEqual([1001]);
    const previous = JSON.parse(sessionStorage.getItem(MOCK_STORAGE_KEY));
    delete previous.preparations; delete previous.nextPreparationId; previous.schemaVersion = 2;
    sessionStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(previous)); clearMockStoreCache();
    expect((await mock.getBuildingPreparation(101)).preparation).toBeNull();
    expect(getStore().submissions.find((item) => item.submission_id === 1002)).toBeTruthy();
    await mock.selectBuildingScheme(101, "GBI_NREB");
    mock.resetDemoData();
    expect((await mock.getBuildingPreparation(101)).preparation).toBeNull();
  });
});
