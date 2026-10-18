# GreenChain Batch 6 implementation report

## Targeted layout correction, 18 October 2026

Projects, My Buildings and both scheme preparation views received scoped layout fixes only. Independent per-row `auto` columns and stretching status pills caused the catalogue misalignment; the Create Building primary-link style lacked padding; global input sizing and generic label layout enlarged preparation checkboxes/rows. Fixed with shared catalogue tracks, compact badges, scoped button padding, semantic two-line submission labels, fixed-size checkbox grids and a wrapping category name/count grid. No business logic, certification criteria, backend or package generation changed.

Browser visual checks covered Projects and My Buildings at 1440/768/390px, and GBI project 108 plus GreenRE project 107 with four submissions each at those widths. Screenshots were viewed in the QA session but not saved to a file. Added an interaction test for clicking submission text and persisting multiple links. Final targeted retest: **25 files, 123/123 tests passed**; `npm run build` passed (81 modules, 513 ms); `git diff --check` passed. Defects D06-06 through D06-08 and detailed visual observations are in the defect and execution logs. The independent HTML-open/print check and broader accessibility QA remain outstanding; Batch 6 stays **Partially Complete**. No staging, commit, push or merge.

**Overall status: Partially Complete (18 October 2026).** The mock workflow and automated regression pass, but the exported HTML report was not independently opened because browser policy blocked `file://`; print and full responsive/accessibility acceptance checks remain open. No backend/database/storage/ETL change, commit, stage, push or merge was made.

## Evidence and outcomes

- `npm test -- --run`: baseline 24 files, 119 passed/1 failed (ambiguous `kWh` locator). Focused `ProjectDetail.test.jsx` repeated 5 times with 9/9 passes after locator correction. A later full-suite run exposed a second stale/asynchronous tab assertion; after correction, **25 files, 122/122 passed**. The two intermediate final runs were 121/122 and are recorded in `docs/BATCH_06_TEST_EXECUTION.md`.
- `npm run build`: **passed**, Vite 7.3.6, 81 modules transformed, 515 ms.
- `git diff --check`: **passed**, exit 0, no whitespace errors.
- Browser E2E: company created owned project 109, uploaded three-row CSV as submission #1116, auditor approved it, viewer saw approved metrics and correct units, company linked the submission to GBI EE5, consultant requested revision, company changed evidence, consultant accepted revised evidence. Viewer direct package route denied 403. Reassignment/former-access, rejection, stale package and many negative cases passed automated tests, not all in browser.
- Package: Chrome saved standalone HTML at `/Users/hgtan/Downloads/greenchain-101-riverview-learning-centre-gbi-nreb-preparation-package (1).html` (12079 bytes). Read-only inspection found disclaimer, evidence register, gaps and print CSS. Browser security policy prohibited direct local-file opening and disallowed a workaround; standalone visual rendering and Print/Save PDF **not verified**. Do not mark E2E-06 complete.
- Responsive/accessibility: desktop package preview inspected; login viewport measured 390 px without overflow. Feature pages at 390/768/1440, keyboard/focus and print layout were not fully inspected. A native confirmation dialog stalled one IAB tab during reassignment QA. No WCAG claim.

## Changed files in Batch 6

- `src/mocks/mockService.js`: explicit mock AUDITOR gate on sustainability queue/history/detail/decision; UPLOADER gate on selected and legacy submission creation.
- `src/pages/UploadPlaceholder.jsx`: clarify mock-only validation/storage and remove dead `/submissions/:id` success link.
- `src/test/ProjectDetail.test.jsx`: precise unit locator and async tab assertion for current UI.
- `src/test/MockLifecycle.test.js`: explicit persona setup and wrong-role service checks.
- `src/test/Batch6EndToEnd.test.js`, `src/test/fixtures/batch6-valid.csv`: cross-role mock lifecycle and browser upload fixture.
- `docs/BATCH_06_RTM.md`, `docs/BATCH_06_TEST_EXECUTION.md`, `docs/BATCH_06_DEFECT_LOG.md`, `docs/BATCH_06_INTEGRATION_HANDOVER.md`, `docs/FRONTEND_MOCK_COMPLETION_PLAN.md`, this report: requirement, execution, defect, handover and status records.

Confirmed defects D06-01 through D06-05 are fixed and retested. No Critical defect confirmed. High D06-02 was a mock-service role bypass, now guarded, but frontend checks do not replace real backend RBAC. See defect log for reproduction and retest details.

## Integration readiness

Mock and real service modes remain separated in `src/services/dataService.js`; existing real auth, discovery, project, submission and review adapters are preserved. Building management, certification preparation, consultant assignment/review and package functions are **mock-only** and intentionally return 501 in real mode. The handover distinguishes observed fields and current backend/storage/ETL behavior from candidate future integration needs; it does not finalise contracts. Existing certification catalogue is representative and unofficial. Original PDF page-level citation audit remains open.

## Git and release state

Branch: `codex/building-organisation-compare`. The working tree includes 12 tracked modified files and numerous untracked files from Batches 1-5 plus Batch 6; Batch 6 edits were made on top without discarding or staging them. `git diff --stat` reports 12 tracked files, 609 insertions and 48 deletions, but omits untracked source/docs/tests. No unrelated change was intentionally reverted or committed. Before a future PR, inventory all untracked files with teammates, separate batch commits by ownership, run full verification again and keep downloaded artifacts/session data out of Git. Proposed sequence is in `docs/BATCH_06_INTEGRATION_HANDOVER.md`.

## Acceptance gaps and decisions

1. Independently open the saved HTML package in an allowed browser context, inspect evidence IDs/disclaimer/long content, and verify Print/Save as PDF. This is a **Batch 6 P0 acceptance blocker**.
2. Complete 390/768/1440 page matrix, keyboard/focus/dialog behavior and status/overflow checks; resolve any confirmed product defects.
3. Browser-verify reassignment and former-consultant denial once native-dialog control works; automated evidence is already present.
4. Hong Guan/team approval is needed before any real API contract, certification scope expansion, persistent package provenance or cloud WORM claim. No such changes were made.

See `docs/BATCH_06_RTM.md` for core/supporting coverage and `docs/BATCH_06_TEST_EXECUTION.md` for exact observed versus automated-only results.
