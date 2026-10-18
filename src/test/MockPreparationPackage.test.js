import { beforeEach, describe, expect, it } from "vitest";
import * as mock from "../mocks/mockService.js";
import { clearMockStoreCache, getStore, resetMockStore, saveStore } from "../mocks/store.js";
import { findDemoUserByEmail, setDemoUser } from "../mocks/identity.js";
import { PACKAGE_DISCLAIMER, renderPreparationPackageHtml } from "../mocks/preparationPackage.js";

const as = (email) => setDemoUser(findDemoUserByEmail(email));
const owner = () => as("uploader@demo.greenchain.test");
const evidence = (note, ids = [1001]) => ({ status: "PROVIDED", note, submission_ids: ids });

beforeEach(() => { sessionStorage.clear(); resetMockStore(); owner(); });

describe("unofficial preparation package", () => {
  it("requires an active scheme and returns a source-labelled building snapshot", async () => {
    await expect(mock.getPreparationPackage(101)).rejects.toMatchObject({ status: 409 });
    await mock.selectBuildingScheme(101, "GBI_NREB");
    const report = await mock.getPreparationPackage(101);
    expect(report.building).toMatchObject({ project_id: 101 });
    expect(report.scheme).toMatchObject({ id: "GBI_NREB", version: "V1.1 (January 2011)" });
    expect(report.categories.flatMap((item) => item.criteria)).toHaveLength(8);
    expect(report.summary).toMatchObject({ total: 8, missing: 8, pending: 8 });
    expect(report.gaps).toHaveLength(8);
    expect(report.assignment).toBeNull();
    expect(report.evidence_references).toEqual([]);
  });

  it("includes exact submission statuses, deduplicates references and keeps reviewer attribution", async () => {
    await mock.selectBuildingScheme(101, "GBI_NREB");
    await mock.saveCriterionPreparation(101, "EE5", evidence("Metered & checked", [1001, 1002]));
    await mock.saveCriterionPreparation(101, "EE8", evidence("Same upload", [1001]));
    const assigned = await mock.assignPreparationConsultant(101, 3);
    as("auditor@demo.greenchain.test");
    await mock.reviewPreparationCriterion(assigned.preparation.id, "EE5", "NEEDS_REVISION", "Need source calculation");
    owner();
    const report = await mock.getPreparationPackage(101);
    const item = report.categories.flatMap((category) => category.criteria).find((criterion) => criterion.id === "EE5");
    expect(item).toMatchObject({ evidence_status: "PROVIDED", review_status: "NEEDS_REVISION", company_note: "Metered & checked" });
    expect(item.current_review).toMatchObject({ reviewer_name: "Demo Auditor", feedback: "Need source calculation" });
    expect(report.evidence_references.map((ref) => ref.submission_id)).toEqual([1001, 1002]);
    expect(report.evidence_references[0].criteria).toEqual(["EE5", "EE8"]);
    expect(report.evidence_references[0]).toHaveProperty("status");
    expect(report.gaps.find((gap) => gap.criterion_id === "EE5").reasons).toContain("Current consultant review requests revision");
  });

  it("flags stale and foreign evidence without disclosing foreign submission metadata", async () => {
    await mock.selectBuildingScheme(101, "GBI_NREB");
    await mock.saveCriterionPreparation(101, "EE5", evidence("Original"));
    getStore().preparations.find((item) => item.project_id === 101).responses.EE5.submission_ids = [1001, 1004, 999999];
    saveStore(); clearMockStoreCache();
    const report = await mock.getPreparationPackage(101);
    const ref = report.evidence_references.find((item) => item.submission_id === 1004);
    expect(ref).toEqual({ submission_id: 1004, available: false, criteria: ["EE5"] });
    expect(report.gaps.find((gap) => gap.criterion_id === "EE5").reasons.join(" ")).toContain("1004");
    expect(JSON.stringify(report)).not.toContain("project_id\":102");
  });

  it("distinguishes current from outdated feedback and isolates a changed scheme", async () => {
    await mock.selectBuildingScheme(101, "GBI_NREB");
    await mock.saveCriterionPreparation(101, "EE5", evidence("Original"));
    const assigned = await mock.assignPreparationConsultant(101, 3);
    as("auditor@demo.greenchain.test");
    await mock.reviewPreparationCriterion(assigned.preparation.id, "EE5", "ACCEPTED_FOR_PREPARATION", "Reviewed original");
    owner();
    await mock.saveCriterionPreparation(101, "EE5", evidence("Revised"));
    let item = (await mock.getPreparationPackage(101)).categories[0].criteria[0];
    expect(item).toMatchObject({ review_status: "PENDING_REVIEW", review_outdated: true, current_review: null });
    expect(item.latest_review).toMatchObject({ reviewer_name: "Demo Auditor", feedback: "Reviewed original" });
    await mock.selectBuildingScheme(101, "GREENRE_ENRB", true);
    const report = await mock.getPreparationPackage(101);
    expect(report.scheme.id).toBe("GREENRE_ENRB");
    expect(report.categories.flatMap((category) => category.criteria)).toHaveLength(6);
    expect(JSON.stringify(report)).not.toContain("Reviewed original");
  });

  it("denies foreign owners and other roles at both preview and export", async () => {
    await mock.selectBuildingScheme(101, "GBI_NREB");
    const snapshot = await mock.getPreparationPackage(101);
    as("future-uploader@demo.greenchain.test");
    await expect(mock.getPreparationPackage(101)).rejects.toMatchObject({ status: 404 });
    await expect(mock.exportPreparationPackage(101, snapshot)).rejects.toMatchObject({ status: 404 });
    for (const email of ["auditor@demo.greenchain.test", "viewer@demo.greenchain.test"]) {
      as(email);
      await expect(mock.getPreparationPackage(101)).rejects.toMatchObject({ status: 403 });
      await expect(mock.exportPreparationPackage(101, snapshot)).rejects.toMatchObject({ status: 403 });
    }
  });

  it("exports the exact preview safely, rejects stale previews, and never mutates records", async () => {
    await mock.selectBuildingScheme(101, "GBI_NREB");
    await mock.saveCriterionPreparation(101, "EE5", evidence('<script>alert("x")</script> & long note'));
    const snapshot = await mock.getPreparationPackage(101);
    const before = JSON.stringify(getStore());
    const file = await mock.exportPreparationPackage(101, snapshot);
    expect(file.filename).toMatch(/\.html$/);
    expect(file.html).toBe(renderPreparationPackageHtml(snapshot));
    expect(file.html).toContain(PACKAGE_DISCLAIMER);
    expect(file.html).toContain("Outstanding gaps and actions");
    expect(file.html).toContain("Evidence reference register");
    expect(file.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; long note");
    expect(new DOMParser().parseFromString(file.html, "text/html").querySelectorAll("script")).toHaveLength(0);
    expect(JSON.stringify(getStore())).toBe(before);
    await mock.saveCriterionPreparation(101, "EE5", evidence("Changed"));
    await expect(mock.exportPreparationPackage(101, snapshot)).rejects.toMatchObject({ status: 409 });
  });
});
