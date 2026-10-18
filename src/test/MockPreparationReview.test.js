import { beforeEach, describe, expect, it } from "vitest";
import * as mock from "../mocks/mockService.js";
import { clearMockStoreCache, getStore, MOCK_STORAGE_KEY, resetMockStore } from "../mocks/store.js";
import { findDemoUserByEmail, setDemoUser } from "../mocks/identity.js";

const as = (email) => setDemoUser(findDemoUserByEmail(email));
const civic = () => as("uploader@demo.greenchain.test");
const future = () => as("future-uploader@demo.greenchain.test");
const auditor = () => as("auditor@demo.greenchain.test");
const second = () => as("second-auditor@demo.greenchain.test");
const viewer = () => as("viewer@demo.greenchain.test");
const evidence = (note = "Initial") => ({ status: "PROVIDED", note, submission_ids: [1001] });

beforeEach(async () => { sessionStorage.clear(); resetMockStore(); civic(); await mock.selectBuildingScheme(101, "GBI_NREB"); });

describe("internal preparation consultant workflow", () => {
  it("assigns only listed auditors, persists, and scopes the queue", async () => {
    await expect(mock.assignPreparationConsultant(101, 999)).rejects.toMatchObject({ status: 400 });
    await expect(mock.assignPreparationConsultant(101, 2)).rejects.toMatchObject({ status: 400 });
    const assigned = await mock.assignPreparationConsultant(101, 3);
    expect(assigned.assignment).toMatchObject({ consultant_id: 3, consultant_name: "Demo Auditor", revision: 1 });
    clearMockStoreCache(); auditor();
    expect((await mock.getAssignedPreparations()).map((item) => item.preparation_id)).toEqual([assigned.preparation.id]);
    expect((await mock.getAssignedPreparation(assigned.preparation.id)).building.project_id).toBe(101);
    second();
    expect(await mock.getAssignedPreparations()).toEqual([]);
    await expect(mock.getAssignedPreparation(assigned.preparation.id)).rejects.toMatchObject({ status: 404 });
  });

  it("reassigns with confirmation, removes former access and preserves reviewer attribution", async () => {
    await mock.saveCriterionPreparation(101, "EE5", evidence());
    const first = await mock.assignPreparationConsultant(101, 3);
    auditor(); await mock.reviewPreparationCriterion(first.preparation.id, "EE5", "ACCEPTED_FOR_PREPARATION", "Reviewed by first");
    civic();
    await expect(mock.assignPreparationConsultant(101, 5)).rejects.toMatchObject({ status: 409 });
    const replaced = await mock.assignPreparationConsultant(101, 5, true);
    expect(replaced.reviews.EE5).toMatchObject({ status: "PENDING_REVIEW", outdated: true });
    expect(replaced.reviews.EE5.history[0]).toMatchObject({ reviewer_id: 3, reviewer_name: "Demo Auditor" });
    auditor(); await expect(mock.getAssignedPreparation(first.preparation.id)).rejects.toMatchObject({ status: 404 });
    second(); expect((await mock.getAssignedPreparations())).toHaveLength(1);
    const newReview = await mock.reviewPreparationCriterion(first.preparation.id, "EE5", "NEEDS_REVISION", "Add calculation");
    expect(newReview.reviews.EE5).toMatchObject({ status: "NEEDS_REVISION", outdated: false });
    expect(newReview.reviews.EE5.history.map((item) => item.reviewer_id)).toEqual([3, 5]);
  });

  it("requires revision feedback, deduplicates unchanged reviews, and invalidates changed evidence", async () => {
    await mock.saveCriterionPreparation(101, "EE5", evidence());
    const assigned = await mock.assignPreparationConsultant(101, 3);
    auditor();
    await expect(mock.reviewPreparationCriterion(assigned.preparation.id, "EE5", "NEEDS_REVISION", "  ")).rejects.toMatchObject({ status: 400 });
    await expect(mock.reviewPreparationCriterion(assigned.preparation.id, "EE5", "APPROVED", "")).rejects.toMatchObject({ status: 400 });
    await mock.reviewPreparationCriterion(assigned.preparation.id, "EE5", "NEEDS_REVISION", "Area evidence missing");
    await mock.reviewPreparationCriterion(assigned.preparation.id, "EE5", "NEEDS_REVISION", "Area evidence missing");
    expect(getStore().preparationReviews).toHaveLength(1);
    clearMockStoreCache();
    expect((await mock.getAssignedPreparation(assigned.preparation.id)).reviews.EE5.status).toBe("NEEDS_REVISION");
    civic();
    await expect(mock.reviewPreparationCriterion(assigned.preparation.id, "EE5", "ACCEPTED_FOR_PREPARATION", "")).rejects.toMatchObject({ status: 403 });
    expect((await mock.getBuildingPreparation(101)).reviews.EE5.latest.feedback).toBe("Area evidence missing");
    await mock.saveCriterionPreparation(101, "EE5", { ...evidence(), submission_ids: [1001, 1002] });
    let view = await mock.getBuildingPreparation(101);
    expect(view.reviews.EE5).toMatchObject({ status: "PENDING_REVIEW", outdated: true });
    expect(view.reviews.EE5.history).toHaveLength(1);
    const revision = getStore().preparations.find((item) => item.id === assigned.preparation.id).responses.EE5.evidence_revision;
    await mock.saveCriterionPreparation(101, "EE5", { ...evidence(), submission_ids: [1002, 1001] });
    expect(getStore().preparations.find((item) => item.id === assigned.preparation.id).responses.EE5.evidence_revision).toBe(revision);
    auditor();
    view = await mock.reviewPreparationCriterion(assigned.preparation.id, "EE5", "ACCEPTED_FOR_PREPARATION", "Updated records reviewed");
    expect(view.reviews.EE5).toMatchObject({ status: "ACCEPTED_FOR_PREPARATION", outdated: false });
    expect(view.reviews.EE5.history).toHaveLength(2);
  });

  it("keeps scheme reviews separate and denies inactive/foreign records", async () => {
    const first = await mock.assignPreparationConsultant(101, 3);
    auditor(); await mock.reviewPreparationCriterion(first.preparation.id, "EE5", "NEEDS_REVISION", "More evidence");
    civic(); const switched = await mock.selectBuildingScheme(101, "GREENRE_ENRB", true);
    expect(switched.reviews["ENRB 1-9"].history).toHaveLength(0);
    auditor();
    await expect(mock.getAssignedPreparation(first.preparation.id)).rejects.toMatchObject({ status: 404 });
    civic(); await mock.assignPreparationConsultant(101, 3);
    auditor();
    await expect(mock.reviewPreparationCriterion(switched.preparation.id, "EE5", "ACCEPTED_FOR_PREPARATION", "")).rejects.toMatchObject({ status: 400 });
    civic(); await mock.selectBuildingScheme(101, "GBI_NREB", true);
    expect((await mock.getBuildingPreparation(101)).reviews.EE5.history).toHaveLength(1);
  });

  it("enforces organisation/role ownership and migrates schema 3 without losing responses", async () => {
    await mock.saveCriterionPreparation(101, "EE5", evidence());
    future();
    await expect(mock.assignPreparationConsultant(101, 3)).rejects.toMatchObject({ status: 404 });
    viewer();
    await expect(mock.getAssignedPreparations()).rejects.toMatchObject({ status: 403 });
    await expect(mock.getBuildingPreparation(101)).rejects.toMatchObject({ status: 403 });
    auditor(); await expect(mock.assignPreparationConsultant(101, 3)).rejects.toMatchObject({ status: 403 });
    await expect(mock.saveCriterionPreparation(101, "EE5", evidence("No"))).rejects.toMatchObject({ status: 403 });
    const old = JSON.parse(sessionStorage.getItem(MOCK_STORAGE_KEY));
    old.schemaVersion = 3; delete old.preparationAssignments; delete old.preparationReviews; delete old.nextPreparationReviewId;
    sessionStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(old)); clearMockStoreCache(); civic();
    expect((await mock.getBuildingPreparation(101)).responses.EE5.note).toBe("Initial");
    expect(getStore()).toMatchObject({ schemaVersion: 4, preparationAssignments: [], preparationReviews: [], nextPreparationReviewId: 1 });
  });

  it("reset clears assignment and review history but leaves valid seed data", async () => {
    const assigned = await mock.assignPreparationConsultant(101, 3);
    auditor(); await mock.reviewPreparationCriterion(assigned.preparation.id, "EE5", "ACCEPTED_FOR_PREPARATION", "");
    mock.resetDemoData();
    expect(getStore()).toMatchObject({ preparations: [], preparationAssignments: [], preparationReviews: [] });
    expect(getStore().submissions.some((item) => item.submission_id === 1001)).toBe(true);
  });
});
