import { beforeEach, describe, expect, it } from "vitest";
import * as mock from "../mocks/mockService.js";
import { resetMockStore } from "../mocks/store.js";
import { findDemoUserByEmail, setDemoUser } from "../mocks/identity.js";

const file = new File(["metric_name,value,unit\nElectricity,42,kWh\n"], "demo.csv", { type: "text/csv" });
const previewRows = [{ metric_name: "Electricity", value: 42, unit: "kWh" }];
const as = (email) => setDemoUser(findDemoUserByEmail(email));

describe("mock Uploader → Auditor → Viewer lifecycle", () => {
  beforeEach(() => { sessionStorage.clear(); resetMockStore(); as("uploader@demo.greenchain.test"); });

  it("adds a pending submission, then publishes its approved metric", async () => {
    const result = await mock.createSubmission({ projectName: "New Demo Facility", organisation: "Demo Future Works", reportingPeriod: "2026-Q3", file, previewRows });
    expect(result.status).toBe("UNREVIEWED");
    as("auditor@demo.greenchain.test");
    expect((await mock.getPendingReviews()).map((item) => item.submission_id)).toContain(result.submission_id);
    expect((await mock.getMetricHistory(result.project_id, "Electricity")).points).toEqual([]);
    await mock.decideSubmission(result.submission_id, "APPROVED", "Meter export reviewed.");
    expect((await mock.getPendingReviews()).map((item) => item.submission_id)).not.toContain(result.submission_id);
    expect((await mock.getProjectDetail(result.project_id)).metrics[0].latest).toMatchObject({ value: 42, submission_id: result.submission_id });
    expect((await mock.getMetricHistory(result.project_id, "Electricity")).points).toMatchObject([{ status: "APPROVED", value: 42 }]);
    expect((await mock.getProjectCatalogue({ status: ["APPROVED"] })).projects.some((item) => item.project_id === result.project_id)).toBe(true);
    await expect(mock.decideSubmission(result.submission_id, "REJECTED", "No")).rejects.toMatchObject({ status: 409 });
  });

  it("keeps rejected values out of approved series and requires a reason", async () => {
    const result = await mock.createSubmission({ projectName: "Riverview Learning Centre", organisation: "Demo Civic Trust", reportingPeriod: "2026-Q2", file, previewRows });
    as("auditor@demo.greenchain.test");
    await expect(mock.decideSubmission(result.submission_id, "REJECTED", "")).rejects.toMatchObject({ status: 400 });
    await mock.decideSubmission(result.submission_id, "REJECTED", "Evidence mismatch.");
    expect((await mock.getSubmissionDetail(result.submission_id)).review.reason).toBe("Evidence mismatch.");
    expect((await mock.getMetricHistory(101, "Electricity")).points.some((item) => item.submission_id === result.submission_id)).toBe(false);
    expect((await mock.getHomeDiscovery()).summary.total_submissions).toBe(23);
  });

  it("handles missing projects and partial metric coverage", async () => {
    await expect(mock.getProjectDetail(9999)).rejects.toMatchObject({ status: 404 });
    expect((await mock.getProjectDetail(102)).metrics.find((item) => item.metric_name === "CO2e").latest).toBeNull();
  });

  it("rejects mock review and upload operations from the wrong persona", async () => {
    await expect(mock.getPendingReviews()).rejects.toMatchObject({ status: 403 });
    await expect(mock.getReviewHistory()).rejects.toMatchObject({ status: 403 });
    await expect(mock.getReviewDetail(1006)).rejects.toMatchObject({ status: 403 });
    await expect(mock.decideSubmission(1006, "APPROVED", null)).rejects.toMatchObject({ status: 403 });
    as("viewer@demo.greenchain.test");
    await expect(mock.createSubmission({ projectName: "No", organisation: "No", reportingPeriod: "2026-Q3", file, previewRows })).rejects.toMatchObject({ status: 403 });
    as("auditor@demo.greenchain.test");
    await expect(mock.createSubmission({ projectName: "No", organisation: "No", reportingPeriod: "2026-Q3", file, previewRows })).rejects.toMatchObject({ status: 403 });
  });
});
