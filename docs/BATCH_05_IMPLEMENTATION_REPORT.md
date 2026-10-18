# Batch 5 Implementation Report: Unofficial Preparation Package

Date: 18 October 2026. Scope: frontend mock mode only. No commit, push or merge was made.

## Delivered

- An owning Uploader with an active building preparation can open `/my-buildings/:buildingId/package` from the preparation workspace. A missing active scheme returns a clear prerequisite error and no package action is shown in the workspace.
- A printable standalone HTML report provides: (A) a cover and explicit unofficial disclaimer; (B) representative preparation and consultant counts; (C) scheme, version and source; (D) category-grouped criterion notes, evidence availability, linked IDs and current/historical consultant feedback; (E) a deduplicated submission reference register with reporting periods, source filename when recorded, metrics and the separate sustainability audit status; (F) outstanding evidence/review/unavailable-link gaps; (G) assignment, current review, outdated feedback and original reviewer attribution; (H) limitations and the repeated disclaimer.
- The iframe preview and download use `renderPreparationPackageHtml` on one snapshot. Export regenerates from current state and refuses a changed preview with HTTP-like 409, asking for refresh. The export is a self-contained `.html` file with print styling, not a PDF or official application.
- Missing/deleted/cross-building submission IDs appear only as unavailable references. The report does not reveal foreign submission metadata. Export escapes all dynamic text, including company notes and consultant feedback.
- Mock-service ownership checks apply on both preview and export. Other roles receive 403; a foreign Uploader receives 404. Real mode rejects both methods as unsupported (501). These frontend/mock checks are UX simulation, not server security.

## Files

Created: `src/mocks/preparationPackage.js`, `src/pages/PreparationPackagePage.jsx`, `src/test/MockPreparationPackage.test.js`, `src/test/PreparationPackagePage.test.jsx`, this report.

Modified for Batch 5: `src/mocks/mockService.js`, `src/services/dataService.js`, `src/App.jsx`, `src/pages/BuildingPreparationPage.jsx`, `src/styles.css`, `src/test/DataMode.test.js`, `docs/FRONTEND_MOCK_COMPLETION_PLAN.md`. These files also contain earlier uncommitted Batch 1-4 work, which was preserved.

## Data and Compatibility

The in-memory package snapshot is derived from `preparationView` and contains `generated_at`, `preparation_id`, `building`, `scheme`, `summary`, `assignment`, category/criterion responses and review records, a deduplicated `evidence_references` array, and `gaps`. Linked submissions keep exact `submission_id` and `reporting_period`; their `status` remains the sustainability audit status and is never conflated with internal consultant review. Source filename is included only when recorded. No new store entity, schema version, migration, backend endpoint, evidence bytes, score, eligibility calculation or package history was added. Existing submission, review, analytics, comparison and upload behavior was left intact.

The format is HTML because the project has no PDF dependency; it opens standalone and can be printed/saved as PDF through the browser. The export is a current-state snapshot, not a permanent or signed record. No package event log is claimed. If live preparation data changes after preview, the user must refresh before downloading.

## Verification

- Baseline before Batch 5: `npm test -- --run` **113/113 passed in 22 files**; `npm run build` passed.
- Final: `npm test -- --run` **120/120 passed in 24 files**; `npm run build` passed (Vite 7.3.6, 81 modules transformed); `git diff --check` passed.
- Tests cover no-scheme, both scheme catalogues, missing evidence/consultant, exact linked references and statuses, deduplication, stale/foreign IDs, outdated feedback, scheme isolation, role/owner denial, escaped HTML, preview/export equality, stale-preview conflict, non-mutation, UI download action, and real-mode isolation. `ProjectDetail` tests passed in the baseline and final runs; no intermittent assertion recurred.
- Rendered manually in a separate local browser tab at desktop and 390px mobile widths: the report sections, disclaimer and controls appeared; mobile page-level `scrollWidth` equaled `clientWidth` (390px). The browser showed the export success state. Its download-event API did not surface the Blob download, so actual saved-file opening was not independently observed there; the automated DOM/content and Blob-click tests passed. Browser viewport was reset and the temporary tab closed.

## Remaining Limitations and Batch 6

- Mock state is browser-session-local. No real user/tenant authorization, cloud audit, WORM retention, original evidence attachments, official submission or certification claim is present.
- The representative source-indexed criteria are not a complete official assessment. The report carries no official points, tier, score or eligibility decision. Source versions and descriptions follow the existing mock catalogue.
- Real mode has no preparation/package API; later backend handover must define server-side ownership, evidence access, immutable export snapshots and any required audit event before real integration. No backend contracts were changed in this batch.
- Batch 6 should test the full Company -> Consultant -> Preparation -> Viewer workflow, negative/recovery states, browser download/open behavior, keyboard/focus behavior and wider viewport/long-content coverage.

## Git

Branch: `codex/building-organisation-compare`. Working tree remains dirty with earlier Batch 1-4 changes and Batch 5 additions. No files were staged or committed; no unrelated changes were reverted.
