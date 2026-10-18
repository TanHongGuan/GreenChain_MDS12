# Batch 6 integration-readiness handover

18 October 2026. For Hong Guan, Bradley, Hui Zern and Gavyn. **Observed code and candidate integration needs, not a final shared API contract.** No backend, database, storage or ETL code was changed in Batch 6.

## Existing frontend boundary

`src/services/dataService.js` selects mock only when `VITE_DATA_MODE=mock`; otherwise real FastAPI adapters in `src/api/{auth,projects,submissions,reviews,discovery}.js` are used. `src/services/comparisonService.js` builds mock comparisons from the store and real comparisons from existing catalogue/history responses. Real-mode wrappers for building management, scheme preparation, assignment, criterion review and package preview/export intentionally throw 501. Do not turn these into fake calls.

`src/mocks/store.js` persists schema version 4 under session key `greenchain-demo-v1`; cache and session storage are browser-local, not multi-user persistence. The state contains `organisations`, `users`, `projects` (buildings), `submissions`, `highlights`, `preparations`, `preparationAssignments`, `preparationReviews`, and next-ID counters. `src/mocks/identity.js` supplies exact demo personas, stored under `greenchain-demo-user`; mock login is not real authentication. `src/mocks/selectors.js` derives owned buildings, building submissions/review states and assignments. Seed project IDs remain stable; new buildings get unique IDs. A project has `project_id`, `organisation_id`, name/location/type/reporting metadata; submissions reference `project_id` and reporting period. The demo store migrates prior session records/highlights without resetting them; explicit reset is destructive only to mock session data after confirmation.

Submission lifecycle is `UNREVIEWED -> APPROVED|REJECTED`; decisions retain reviewer/reason/time. Public metrics derive only from APPROVED records. Preparation is keyed to building plus selected scheme, holds criterion response (availability, submission IDs, note, revision), and has separate per-scheme responses. Assignment has current consultant and history; criterion reviews retain author/outcome/feedback and become non-current after evidence revision/reassignment. Internal `Accepted for Preparation` is **not** official certification. `src/mocks/preparationPackage.js` builds a current in-memory snapshot and standalone HTML; preview freshness is checked before export. There is no persistent package record or official application.

## Bradley: backend capability map

| Frontend operation and observed fields | Mock method / real mode | Boundary and open dependency |
|---|---|---|
| Login/current user/logout: email, role, identity | `dataService.login/getCurrentUser/logout`; real `src/api/auth.js` exists | Align real role/organisation memberships and session expiry; mock persona allowlist cannot secure backend. |
| Owned building list/get/create/update: `project_id`, `organisation_id`, name, location and metadata | `getOwnedBuildings/getOwnedBuilding/createBuilding/updateBuilding`; real wrapper 501 | Need authenticated organisation-scoped read/write, stable identity and foreign-owner denial; no approved endpoint shape. |
| Submission creation/history/detail: project ID, `reporting_period`, file, status, metrics/evidence metadata | `createSubmission/getProjectSubmissions/getSubmissionDetail`; real `src/api/submissions.js` exists | Preserve existing FastAPI contract. Confirm server ownership, provenance and validation mapping before selected-building integration. |
| Audit queue/detail/decision: submission ID, decision/reason/reviewer/time | `getPendingReviews/getReviewDetail/decideSubmission`; real `src/api/reviews.js` exists | Existing backend RBAC must remain authoritative; confirm assignment policy and 409 conflict handling. |
| Public discovery/history/highlights/comparison | mock discovery/project services; real `src/api/discovery.js`, `projects.js`, comparison adapter | Verify approved-only visibility and unit normalization against real responses. |
| Preparation read/scheme/criterion mutation: building ID, scheme ID, criterion ID, availability, linked submission IDs, note/revision | `getBuildingPreparation/selectBuildingScheme/saveCriterionPreparation`; real wrapper 501 | Need owner-scoped persistence, exact-version evidence links, scheme isolation and revision semantics. Candidate fields, not agreed API. |
| Consultant assignment/queue/review: consultant ID, preparation ID, criterion ID, outcome, feedback, revision | `assignPreparationConsultant/getAssignedPreparations/getAssignedPreparation/reviewPreparationCriterion`; real wrapper 501 | Need assignment-scoped access, revocation and immutable attribution/history. No official approval semantics. |
| Package preview/export: snapshot of building, scheme, criteria, links, gaps, current/historic reviews | `getPreparationPackage/exportPreparationPackage`; real wrapper 501 | Authorised snapshot/provenance approach to agree; no real endpoint or persisted export event today. |

## Hui Zern: data, evidence and integrity

Existing backend code includes relational models for users, organisations/members, projects, submissions, metrics, reviews and highlights; existing upload/download and SHA-256/evidence metadata should be reviewed with actual deployment configuration. These are **not** proof of cloud WORM. Current frontend mock evidence URLs are null and integrity is labelled unavailable/simulated. No working S3 Object Lock/WORM integration was verified. Future preparation records, assignment changes, criterion revision/history and export provenance are mock-only and need schema/retention decisions. Exact `submission_id` and immutable original-file identity are important; a linked submission must not silently become a different version. Whether to persist package snapshots/events is **not agreed**. Avoid calling a demo `MATCH` or reference a verified cloud lock.

## Gavyn: ETL and metrics

The mock preview parser in `src/utils/uploadPreview.js` expects CSV columns `metric_name,value,unit` (optional `category`); it rejects missing columns/invalid values before confirmation. Mock mode previews CSV only; the real form accepts CSV/XLSX and passes the file to the existing backend. Core displayed metrics in `src/utils/metrics.js` are Electricity kWh, Water m3 and CO2 emissions tCO2e; source kgCO2e may be normalized for display. Reporting periods are quarterly `YYYY-Q1` through `YYYY-Q4`. Charts/compare consume approved metric histories, not raw evidence. Confirm with team: canonical units and precision, duplicate metric/period policy, CSV/XLSX validation parity, source row provenance, evidence-to-metric mapping and error response shape. No certification score or criterion satisfaction can be inferred from these three totals.

## Certification source check

Supplied handover names GBI NREB V1.1 (January 2011) and GreenRE ENRB V4.0 (February 2026). `src/mocks/certificationSchemes.js` uses those versions, six categories per scheme and representative criterion IDs; UI/export identify the checklist as illustrative and unofficial. No official scoring, eligibility or certificate issuance is implemented. Page-level citation verification against the original PDFs remains open; do not treat current representative labels as a complete official rulebook.

## Integration checkpoints

| Checkpoint / participants | Prerequisite | Observable acceptance condition |
|---|---|---|
| 1. Canonical contract review — Hong Guan + all | Current adapters/mock entities and backend/ETL inventory | Agreed field names, units, reporting periods, error and status semantics documented separately. |
| 2. Auth/ownership — Hong Guan + Bradley | Membership/role model and API authorization | Foreign org/role requests rejected by backend, not merely hidden by frontend. |
| 3. Upload/ETL — Hong Guan + Bradley + Gavyn | Valid/invalid CSV/XLSX examples | Real upload produces compatible validation, stable submission/project IDs and clear failures. |
| 4. Evidence identity — Hui Zern + Bradley + Gavyn | Storage retention/integrity decision | Downloaded evidence resolves to exact immutable submission; hash and lock assertions reflect actual storage. |
| 5. Audit lifecycle — Bradley + Hong Guan | Existing review API behavior | Approve/reject/history and approved-only analytics pass integrated tests. |
| 6. Preparation/consultant — Hong Guan + Bradley + Hui Zern | Approved scope and persistence model | Owner, assigned, unassigned and former consultant cases pass server-backed tests. |
| 7. Package provenance — all | Decision whether export events persist | Preview/export content has auditable source version and correct unofficial disclaimer. |
| 8. Integrated E2E — all | Prior checkpoints | Multi-role workflow passes with real storage/ETL and no mock leakage. |

## Git/release handover

Current branch: `codex/building-organisation-compare`. Batches 1-5 plus Batch 6 changes are uncommitted; many source/tests/docs are untracked, so `git diff --stat` alone omits them. Classify tracked source changes as intended frontend batch work; Batch 6 test/docs/fixture are test evidence; no unrelated edit was intentionally altered. Ownership of every earlier untracked file cannot be inferred solely from Git status; review with teammates before staging. Suggested **future** sequence (not executed): inventory each untracked file; isolate Batch 1-2 mock foundation/company management, Batch 3 preparation, Batch 4 consultant review, Batch 5 package, Batch 6 QA/docs into reviewable commits/PRs; run full tests/build after each; merge only after teammate ownership and contracts are reconciled. Do not accidentally include session data, downloads, credentials or generated files.

**Open decisions for Hong Guan:** accept mock-only certification scope/source wording; approve future canonical contract; decide evidence-storage and package-provenance requirements; arrange independent browser opening/print verification and responsive/accessibility sweep before Batch 6 acceptance.
