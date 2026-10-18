# Batch 6 test execution evidence

## Targeted UI layout retest (18 October 2026)

| ID | Browser / command | Actual result | Status |
|---|---|---|---|
| UI-01 | In-app browser at `http://127.0.0.1:5175/projects`, 1440/768/390px | Desktop headings and all six cell tracks align; Approved badges fit text. At 768/390px hidden fields no longer reserve blank tracks; links remain visible. | Pass |
| UI-02 | `/my-buildings`, 1440/768/390px | Create Building has centered text and usable padding; no clipping in header. | Pass |
| UI-03 | GBI project 108 and GreenRE project 107 preparation, 1440/768/390px; four submissions per criterion | Checkbox sits beside the correct two-line label; rows compact, text wraps; category counts remain separate and active state visible. | Pass |
| UI-04 | `BuildingPreparationPage.test.jsx` focused | 3/3 passed; new test clicks two submission labels, saves, reloads and confirms both links persist. | Pass |
| UI-05 | `npm test -- --run` | 25 files, **123/123 passed**. Projects filters/sort, building creation, package, consultant and preparation regressions included. | Pass |
| UI-06 | `npm run build`; `git diff --check` | Vite 7.3.6 built 81 modules in 513 ms; whitespace check exit 0. | Pass |

These were visual inspections of the targeted controls, not merely scroll-width measurements. Keyboard-focus behavior was not exhaustively audited. Exported HTML opening/print remains blocked as documented below.

Executed 18 October 2026 in the local mock frontend. Seed/demo records below are session-local and not backend data. Test IDs map to `BATCH_06_RTM.md`.

## Commands and artifacts

| Run | Command / environment | Result |
|---|---|---|
| Baseline | `npm test -- --run` | 24 files, 119 passed, 1 failed: ambiguous `kWh` locator in `ProjectDetail.test.jsx` (D06-01). |
| Focused retest | `npm test -- --run src/test/ProjectDetail.test.jsx`, five runs | 9/9 passed on every run after locator correction. |
| Interim regression | `npm test -- --run` | 24 files, 121/121 passed after service/UI fixes, before new Batch 6 E2E test. |
| Batch 6 lifecycle | `npm test -- --run src/test/Batch6EndToEnd.test.js` | 1/1 passed. |
| Final regression | `npm test -- --run` | First two final runs: 121/122, D06-05 stale/async tab assertion; after `findByRole` correction, 25 files and 122/122 passed. |
| Production build | `npm run build` | Exit 0; Vite 7.3.6 built 81 modules in 515 ms. |
| Git whitespace | `git diff --check` | See final report. |

Browser: isolated in-app browser at local Vite URL for the multi-role walkthrough; separate Chrome tab for package download. The actual downloaded artifact is `/Users/hgtan/Downloads/greenchain-101-riverview-learning-centre-gbi-nreb-preparation-package (1).html`, 12079 bytes. `file` identified HTML ASCII text; read-only `rg` found the building, GBI version, Evidence reference register, Outstanding gaps/actions, disclaimer and `@media print`. Browser policy denied direct `file://` opening and explicitly disallowed workaround. **Text inspection is not independent visual opening.** No screenshot is claimed.

## End-to-end scenarios

| ID | Expected | Actual evidence | Status |
|---|---|---|---|
| E2E-01 | Company creates/selects owned building, previews valid CSV, submits, reloads | UI: Demo Uploader created `Batch 6 QA Learning Centre` ID 109 under Demo Civic Trust. `batch6-valid.csv` preview showed 3 rows; confirmed submission #1116, UNREVIEWED, linked to 109. Reload showed 1 submission. | Pass |
| E2E-02 | Auditor approves, rejection independent | UI: auditor found #1116 in Review, saw simulated evidence/integrity UNAVAILABLE, confirmed approval, detail APPROVED. Separate automated lifecycle rejects another submission and tests double-decision conflict. Company status update covered by service test, not separately observed in browser. | Pass |
| E2E-03 | Viewer sees approved metrics only | UI: Viewer searched project 109, project detail displayed #1116 electricity 1200 kWh, water 48 m3, CO2 32 tCO2e. Automated lifecycle asserts rejected submission omitted from approved series; comparison/highlights existing regression tests pass. | Pass |
| E2E-04 | GBI preparation, evidence, notes, progress, persistence; GreenRE catalogue | UI: owner selected GBI NREB V1.1, saw 6 categories/8 representative criteria, linked #1116 to EE5, set PROVIDED/note, 13% progress, persisted reload. Separate automated test checks GreenRE catalogue/scheme isolation. No official score displayed. | Pass |
| E2E-05 | Consultant feedback, revision freshness, acceptance, reassignment | UI: Demo Auditor assigned, Needs Revision feedback visible to owner; owner changed note, old review became PENDING REVIEW/outdated; consultant accepted revised EE5. Browser native confirmation stalled reassignment. Automated test covers reassignment, former consultant denial, attribution and new consultant access. | Pass (reassignment automated only) |
| E2E-06 | Preview/download/independently open/print unofficial package | Chrome UI preview inspected, download produced saved HTML. Static file inspection confirmed sections/disclaimer/print CSS. Direct file opening blocked by browser policy; print/PDF and visual long-note layout not verified. | Blocked |
| E2E-07 | Stale preview blocked then refreshed export | Automated `MockPreparationPackage`/Batch 6 lifecycle tests cover changed snapshot conflict and fresh export. No simultaneous browser-tab check. | Pass (automated only) |
| E2E-08 | Role/organisation/assignment isolation | UI: Viewer direct package route denied 403. Automated tests deny foreign building edit, foreign submission link, package preview, consultant company edits, company consultant decisions, unassigned/former consultant access. | Pass |

## Negative and recovery cases

| ID | Cases / expected behavior | Evidence | Status |
|---|---|---|---|
| NEG-01 | Unsupported type, missing columns, invalid numeric, empty/malformed CSV, invalid building, cancel/failure without submission | `UploadPreview.test.js`, `UploadSubmission.test.jsx`, `MockBuildingPages.test.jsx`, `MockBuildings.test.js` cover parsing, validation, selected-building denial and confirmation. Mock XLSX preview is intentionally unsupported; real mode sends XLSX to backend. Exact cancelled file-picker behavior not independently observed in browser. | Pass (automated coverage; file-picker cancel Not Run) |
| NEG-02 | Invalid/foreign/stale building, persisted-state recovery, reset | `MockFoundation.test.js`, `MockBuildings.test.js`, `MockLifecycle.test.js` cover migration/corruption/reset/ownership; no database changed. | Pass |
| NEG-03 | No scheme/unsupported scheme, foreign or missing evidence, confirmation and separate scheme responses | `MockPreparation.test.js`, `BuildingPreparationPage.test.jsx`, Batch 6 lifecycle test. | Pass |
| NEG-04 | Invalid/unassigned/former consultant, empty feedback, duplicate review, changed/unchanged/reordered evidence | `MockPreparationReview.test.js`, `PreparationReviewPages.test.jsx`, Batch 6 lifecycle test. Browser former-consultant path not observed due confirm stall. | Pass (automated) |
| NEG-05 | Missing prep/consultant/evidence, stale refs, unsafe text, changed preview, long report | `MockPreparationPackage.test.js`, `PreparationPackagePage.test.jsx` test escaping/disclaimer/snapshot freshness; static HTML inspected. Browser-open visual long content/print blocked. | Partially verified |
| ISO-01 | Direct service-level wrong-role/foreign access | Added `MockLifecycle.test.js` negative test and Batch 6 lifecycle; Viewer direct route 403 in UI. Frontend only. | Pass |
| REG-01 | Upload/review/discovery/comparison/highlights/charts/ownership/reset/mode isolation/prep/consultant/package | Complete Vitest suite; focused ProjectDetail five repeats. Two more final-suite failures exposed D06-05; corrected final run 122/122. | Pass after D06-01/D06-05 fixes |

## Responsive and accessibility

| ID | Target / result | Status |
|---|---|---|
| RESP-01 | Desktop browser approximately 1470 CSS px: package preview visible. IAB login viewport at 390 showed `innerWidth = clientWidth = scrollWidth = 390`; this is not coverage of the required feature pages. Tablet 768 and complete mobile/desktop page matrix were not verified. Chrome viewport override requested 390 but remained 1470; IAB interaction was affected by stalled native dialog. | Not Run for full matrix |
| A11Y-01 | Existing labelled controls/route tests and CSS inspected; no installed accessibility audit was invoked. Keyboard navigation, focus trap/return, status contrast and exported print visuals require independent manual verification. | Not Run/Blocked |
| SRC-01 | Inspected `certificationSchemes.js`, UI labels, renderer and supplied source handover: GBI NREB V1.1 Jan 2011 and GreenRE ENRB V4.0 Feb 2026, six categories each, representative IDs and unofficial disclaimer. Original source PDFs and page-level references were not independently reopened; no official score/eligibility calculation found. | Pass for supplied handover consistency; page-level PDF audit Not Run |

Neither passing service tests nor static HTML inspection substitutes for the outstanding browser/print acceptance checks.
