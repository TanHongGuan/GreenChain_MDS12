import { beforeEach, describe, expect, it } from "vitest";
import { currentDemoUser, findDemoUserByEmail, setDemoUser, clearDemoUser } from "../mocks/identity.js";
import { clearMockStoreCache, getStore, MOCK_SCHEMA_VERSION, MOCK_STORAGE_KEY, resetMockStore } from "../mocks/store.js";
import { assignedSubmissions, buildingSubmissions, ownedBuildings, pendingSubmissions, reviewedSubmissions } from "../mocks/selectors.js";
import * as mock from "../mocks/mockService.js";

beforeEach(() => {
  sessionStorage.clear();
  resetMockStore();
});

describe("versioned mock foundation", () => {
  it("uses exact demo identities, not email prefixes, and survives persona changes", async () => {
    expect(findDemoUserByEmail("uploader-anything@example.test")).toBeNull();
    expect(findDemoUserByEmail("UPLOADER@DEMO.GREENCHAIN.TEST")?.id).toBe(2);
    setDemoUser(findDemoUserByEmail("uploader@demo.greenchain.test"));
    expect(currentDemoUser().role).toBe("UPLOADER");
    await mock.addHighlightedProject(101);
    setDemoUser(findDemoUserByEmail("auditor@demo.greenchain.test"));
    expect(currentDemoUser().role).toBe("AUDITOR");
    expect(getStore().highlights[2]).toEqual([101]);
    clearDemoUser();
    expect(currentDemoUser()).toBeNull();
  });

  it("migrates a legacy session without losing custom submissions, history, or highlights", () => {
    const legacy = structuredClone(getStore());
    delete legacy.schemaVersion;
    delete legacy.organisations;
    delete legacy.users;
    delete legacy.assignments;
    legacy.projects.forEach((project) => { delete project.organisation_id; });
    legacy.projects.push({ project_id: 9000, project_name: "Legacy Building", organisation: "Old Org", created_at: "2026-01-01T00:00:00Z" });
    legacy.submissions.push({ submission_id: 9001, project_id: 9000, reporting_period: "2026-Q3", status: "REJECTED", reason: "Old review", metrics: [], submitted_at: "2026-08-01T00:00:00Z" });
    legacy.highlights = { 2: [9000] };
    legacy.preparations = [{ id: 1, project_id: 9000 }];
    legacy.preparationAssignments = [{ preparation_id: 1, consultant_id: 3 }];
    legacy.preparationReviews = [{ preparation_id: 1, outcome: "NEEDS_REVISION" }];
    sessionStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(legacy));
    clearMockStoreCache();

    const migrated = getStore();
    expect(migrated.schemaVersion).toBe(MOCK_SCHEMA_VERSION);
    expect(migrated.projects.find((item) => item.project_id === 9000).organisation_id).toBe("legacy-Old%20Org");
    expect(migrated.organisations).toContainEqual({ id: "legacy-Old%20Org", name: "Old Org" });
    expect(migrated.submissions.find((item) => item.submission_id === 9001).reason).toBe("Old review");
    expect(migrated.highlights[2]).toEqual([9000]);
    expect(migrated).not.toHaveProperty("preparations");
    expect(migrated).not.toHaveProperty("preparationAssignments");
    expect(migrated).not.toHaveProperty("preparationReviews");
    expect(migrated.nextProjectId).toBeGreaterThan(9000);
    expect(migrated.nextSubmissionId).toBeGreaterThan(9001);
    expect(migrated.submissions.find((item) => item.submission_id === 1001).metrics[0].value).toBe(124000);

    clearMockStoreCache();
    expect(getStore().submissions.find((item) => item.submission_id === 9001).reason).toBe("Old review");
  });

  it("recovers corrupted storage to the unchanged deterministic seed", () => {
    sessionStorage.setItem(MOCK_STORAGE_KEY, "{broken");
    clearMockStoreCache();
    expect(getStore().projects).toHaveLength(8);
    expect(getStore().submissions).toHaveLength(22);
    expect(JSON.parse(sessionStorage.getItem(MOCK_STORAGE_KEY)).schemaVersion).toBe(MOCK_SCHEMA_VERSION);
  });

  it("derives owned buildings, review states and assignments from one store", () => {
    const store = getStore();
    const civic = findDemoUserByEmail("uploader@demo.greenchain.test");
    const future = findDemoUserByEmail("future-uploader@demo.greenchain.test");
    const auditor = findDemoUserByEmail("auditor@demo.greenchain.test");
    const secondAuditor = findDemoUserByEmail("second-auditor@demo.greenchain.test");
    expect(ownedBuildings(store, civic).map((item) => item.project_id)).toEqual([101, 102, 105, 106]);
    expect(ownedBuildings(store, future).map((item) => item.project_id)).toEqual([103, 104, 107, 108]);
    expect(buildingSubmissions(store, 102)).toHaveLength(2);
    expect(pendingSubmissions(store, 103).map((item) => item.submission_id)).toContain(1006);
    expect(reviewedSubmissions(store, 102).map((item) => item.status)).toEqual(["APPROVED", "REJECTED"]);
    expect(assignedSubmissions(store, auditor).map((item) => item.submission_id)).toContain(1006);
    expect(assignedSubmissions(store, secondAuditor)).toEqual([]);
  });

  it("guards company and auditor service reads and returns detached snapshots", async () => {
    await expect(mock.getOwnedBuildings()).rejects.toMatchObject({ status: 401 });
    setDemoUser(findDemoUserByEmail("viewer@demo.greenchain.test"));
    await expect(mock.getOwnedBuildings()).rejects.toMatchObject({ status: 403 });
    await expect(mock.getAssignedSubmissions()).rejects.toMatchObject({ status: 403 });
    setDemoUser(findDemoUserByEmail("uploader@demo.greenchain.test"));
    await expect(mock.getOwnedBuilding(103)).rejects.toMatchObject({ status: 404 });
    const owned = await mock.getOwnedBuildings();
    owned[0].project_name = "Changed only in response";
    expect(getStore().projects.find((item) => item.project_id === 101).project_name).toBe("Riverview Learning Centre");
    setDemoUser(findDemoUserByEmail("second-auditor@demo.greenchain.test"));
    expect(await mock.getAssignedSubmissions()).toEqual([]);
    setDemoUser(findDemoUserByEmail("auditor@demo.greenchain.test"));
    expect((await mock.getAssignedSubmissions()).some((item) => item.submission_id === 1006)).toBe(true);
  });

  it("resets data only for a signed-in demo user and leaves the selected identity intact", async () => {
    await expect(() => mock.resetDemoData()).toThrowError();
    setDemoUser(findDemoUserByEmail("uploader@demo.greenchain.test"));
    const file = new File(["x"], "demo.csv");
    await mock.createSubmission({ projectName: "New Demo", organisation: "Demo Civic Trust", reportingPeriod: "2026-Q3", file, previewRows: [] });
    await mock.addHighlightedProject(101);
    expect(getStore().submissions).toHaveLength(23);
    mock.resetDemoData();
    expect(getStore().submissions).toHaveLength(22);
    expect(getStore().highlights).toEqual({});
    expect(currentDemoUser().id).toBe(2);
    clearMockStoreCache();
    expect(getStore().submissions).toHaveLength(22);
  });
});
