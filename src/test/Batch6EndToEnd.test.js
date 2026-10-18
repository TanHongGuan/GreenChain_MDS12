import { beforeEach, describe, expect, it } from "vitest";
import * as mock from "../mocks/mockService.js";
import { clearMockStoreCache, getStore, resetMockStore } from "../mocks/store.js";
import { findDemoUserByEmail, setDemoUser } from "../mocks/identity.js";
import { parseCsv } from "../utils/uploadPreview.js";
import { PACKAGE_DISCLAIMER } from "../mocks/preparationPackage.js";

const as = (email) => setDemoUser(findDemoUserByEmail(email));
const uploader = () => as("uploader@demo.greenchain.test");
const auditor = () => as("auditor@demo.greenchain.test");
const secondAuditor = () => as("second-auditor@demo.greenchain.test");
const viewer = () => as("viewer@demo.greenchain.test");
const futureUploader = () => as("future-uploader@demo.greenchain.test");
const csv = "metric_name,value,unit,category\nElectricity,1200,kWh,Energy\nWater,48,m3,Water\nCO2e,32,tCO2e,Emissions\n";
const file = new File([csv], "batch6-valid.csv", { type: "text/csv" });

beforeEach(() => { sessionStorage.clear(); resetMockStore(); uploader(); });

describe("Batch 6 cross-role mock lifecycle", () => {
  it("carries one building through upload, audit, preparation, consultant review and package", async () => {
    const building = await mock.createBuilding({ project_name: "QA lifecycle building", location: "Kuala Lumpur", description: "QA only" });
    expect(building.organisation_id).toBe("demo-civic-trust");
    const rows = parseCsv(csv);
    const submission = await mock.createSubmission({ projectId: building.project_id, reportingPeriod: "2026-Q3", file, previewRows: rows });
    expect(submission).toMatchObject({ project_id: building.project_id, status: "UNREVIEWED" });
    clearMockStoreCache();
    expect((await mock.getOwnedBuildings()).find((item) => item.project_id === building.project_id).submission_count).toBe(1);
    expect((await mock.getMetricHistory(building.project_id, "Electricity")).points).toEqual([]);

    auditor();
    expect((await mock.getPendingReviews()).some((item) => item.submission_id === submission.submission_id)).toBe(true);
    await mock.decideSubmission(submission.submission_id, "APPROVED", "Source checked");
    await expect(mock.decideSubmission(submission.submission_id, "REJECTED", "Again")).rejects.toMatchObject({ status: 409 });

    viewer();
    expect((await mock.getProjectDetail(building.project_id)).metrics.map((item) => [item.metric_name, item.latest?.value, item.latest?.unit])).toEqual([
      ["Electricity", 1200, "kWh"], ["Water", 48, "m3"], ["CO2e", 32, "tCO2e"],
    ]);
    await expect(mock.getBuildingPreparation(building.project_id)).rejects.toMatchObject({ status: 403 });

    uploader();
    const rejected = await mock.createSubmission({ projectId: building.project_id, reportingPeriod: "2026-Q4", file, previewRows: [{ metric_name: "Electricity", value: 9999, unit: "kWh" }] });
    auditor();
    await mock.decideSubmission(rejected.submission_id, "REJECTED", "Wrong period");
    viewer();
    expect((await mock.getMetricHistory(building.project_id, "Electricity")).points.map((item) => item.submission_id)).toEqual([submission.submission_id]);

    uploader();
    let prep = await mock.selectBuildingScheme(building.project_id, "GBI_NREB");
    expect(prep.scheme.categories).toHaveLength(6);
    prep = await mock.saveCriterionPreparation(building.project_id, "EE5", { status: "PROVIDED", note: "Initial evidence", submission_ids: [submission.submission_id] });
    expect(prep.summary).toMatchObject({ provided: 1, missing: 7, percent: 13 });
    prep = await mock.assignPreparationConsultant(building.project_id, 3);
    const preparationId = prep.preparation.id;
    auditor();
    expect((await mock.getAssignedPreparations()).map((item) => item.preparation_id)).toContain(preparationId);
    await mock.reviewPreparationCriterion(preparationId, "EE5", "NEEDS_REVISION", "Add calculation");
    uploader();
    expect((await mock.getBuildingPreparation(building.project_id)).reviews.EE5.status).toBe("NEEDS_REVISION");
    await mock.saveCriterionPreparation(building.project_id, "EE5", { status: "PROVIDED", note: "Updated calculation", submission_ids: [submission.submission_id] });
    expect((await mock.getBuildingPreparation(building.project_id)).reviews.EE5).toMatchObject({ status: "PENDING_REVIEW", outdated: true });
    auditor();
    await mock.reviewPreparationCriterion(preparationId, "EE5", "ACCEPTED_FOR_PREPARATION", "Reviewed update");
    uploader();
    const before = JSON.stringify(getStore());
    const snapshot = await mock.getPreparationPackage(building.project_id);
    const exported = await mock.exportPreparationPackage(building.project_id, snapshot);
    expect(exported.html).toContain(PACKAGE_DISCLAIMER);
    expect(exported.html).toContain(`#${submission.submission_id}`);
    expect(snapshot.evidence_references.map((item) => item.submission_id)).toEqual([submission.submission_id]);
    expect(snapshot.categories[0].criteria[0]).toMatchObject({ review_status: "ACCEPTED_FOR_PREPARATION", company_note: "Updated calculation" });
    expect(JSON.stringify(getStore())).toBe(before);

    await mock.assignPreparationConsultant(building.project_id, 5, true);
    auditor();
    await expect(mock.getAssignedPreparation(preparationId)).rejects.toMatchObject({ status: 404 });
    secondAuditor();
    expect((await mock.getAssignedPreparation(preparationId)).reviews.EE5).toMatchObject({ status: "PENDING_REVIEW", outdated: true });
    uploader();
    expect((await mock.getBuildingPreparation(building.project_id)).reviews.EE5.history.map((item) => item.reviewer_name)).toEqual(["Demo Auditor", "Demo Auditor"]);
    futureUploader();
    await expect(mock.getPreparationPackage(building.project_id)).rejects.toMatchObject({ status: 404 });
  });
});
