# Batch 6 requirements traceability matrix

Status date: 18 October 2026. `Pass` means the cited behavior was observed in the current mock build, either in UI or an executable test. This is not a statement of backend security or official certification. Test identifiers refer to `BATCH_06_TEST_EXECUTION.md`.

| ID | Requirement | Priority | Role | Implementation | Test ID / method | Actual result | Status | Defect |
|---|---|---|---|---|---|---|---|---|
| AUTH-01 | Exact seeded demo personas survive switching/reload | P0 | All | `src/mocks/identity.js`, `store.js` | REG-01 automated, E2E-01 UI | Persona changes retained mock records | Pass | - |
| AUTH-02 | Mock-only role and ownership boundaries at service layer | P0 | All | `src/mocks/mockService.js` | ISO-01 automated, E2E-08 UI | Wrong-role mutation/read rejected; private route denied | Pass | D06-02 |
| BLD-01 | Own organisation's building list only | P0 | Company | `MyBuildingsPage.jsx`, selectors | E2E-01 UI, ISO-01 automated | New building 109 appeared for owner | Pass | - |
| BLD-02 | Create/edit without changing stable ID/history | P0 | Company | `BuildingFormPage.jsx`, mock service | E2E-01 UI, NEG-02 automated | Created 109; identity and submissions persisted | Pass | - |
| UPL-01 | CSV validation and preview before confirmation | P0 | Company | `UploadPlaceholder.jsx`, `uploadPreview.js` | E2E-01 UI, NEG-01 automated | Three rows previewed; invalid input rejected | Pass | - |
| UPL-02 | Selected building association; cancelled/failed upload does not submit | P0 | Company | upload page, mock service | E2E-01 UI, NEG-01 automated | #1116 linked to project 109; failure paths covered | Pass | - |
| SUB-01 | Auditor reviews pending submission and records decision | P0 | Auditor | `ReviewPlaceholder.jsx`, mock service | E2E-02 UI, REG-01 automated | #1116 became APPROVED; repeated decision rejected | Pass | D06-02 |
| SUB-02 | Rejection retains history and excludes rejected data publicly | P0 | Auditor/Viewer | mock service, project selectors | E2E-02 automated, E2E-03 automated | Second submission REJECTED and omitted from approved series | Pass | - |
| VIEW-01 | Approved-only public metrics and correct units | P0 | Viewer | `ProjectDetailPage.jsx`, `metrics.js` | E2E-03 UI/automated | #1116 electricity 1200 kWh, water 48 m3, CO2 32 tCO2e | Pass | D06-01 |
| VIEW-02 | Search/filter/highlights and comparison remain operational | P1 | Viewer | catalogue, comparison, highlights | REG-01 automated; E2E-03 UI search | Search found project 109; regression tests pass | Pass | - |
| CMP-01 | Approved-only comparison and missing-data handling | P1 | Viewer | `comparisonService.js`, `comparison.js` | REG-01 automated | Existing comparison fixtures pass | Pass | - |
| PREP-01 | Source-labelled GBI/GreenRE representative catalogues | P0 | Company | `certificationSchemes.js`, preparation page | E2E-04 UI/automated, SRC-01 inspection | GBI six categories; separate GreenRE catalogue in tests | Pass | - |
| PREP-02 | Link owned submission, notes, progress and reload persistence | P0 | Company | preparation service/page/store | E2E-04 UI, REG-01 automated | EE5 linked #1116; progress 13%; persisted reload | Pass | - |
| CONS-01 | Assignment-scoped internal consultant review | P0 | Company/Auditor | preparation reviews/service | E2E-05 UI/automated | Needs Revision, updated evidence, fresh acceptance | Pass | - |
| CONS-02 | Reassignment revokes prior access, preserves attribution | P0 | Auditor | mock service/store | E2E-05 automated, ISO-01 | Service test passes; browser reassignment stalled on native confirm | Pass | - |
| PKG-01 | Owner-only unofficial preview with refs, gaps and disclaimer | P0 | Company | package page/renderer/service | E2E-06 UI/automated, ISO-01 | Preview and generated HTML contain expected sections | Pass | - |
| PKG-02 | Saved HTML opens independently and print layout is usable | P0 | Company | `preparationPackage.js` | E2E-06 browser | File saved and text inspected; file URL opening blocked by browser policy | Blocked | - |
| PKG-03 | Stale preview cannot export until refreshed | P0 | Company | package service | E2E-07 automated | Conflict then refreshed export passes in automated test | Pass | - |
| DATA-01 | Versioned session state migration/reset and mock-real isolation | P0 | All | store, data service | REG-01, NEG-02 automated | Tests pass; no backend write in mock workflow | Pass | - |
| UX-01 | No horizontal overflow/usable controls at 390, 768, 1440 on required pages | P1 | All | `src/styles.css` | RESP-01 browser | Desktop partial; mobile/tablet full matrix not completed | Not Run | - |
| UX-02 | Keyboard focus, dialog behavior and print visuals | P1 | All | pages/CSS/export | A11Y-01 browser | Native confirm stalled one browser session; print visual blocked | Blocked | - |

Optional historical plan ideas such as invitation acceptance, request-changes sustainability state, official scoring, and persisted package events are outside this Batch 6 gate and are not represented as completed requirements.
