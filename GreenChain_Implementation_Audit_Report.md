# GreenChain implementation audit

## 1. Metadata and evidence standard

Audited 18 October 2026 (Asia/Kuala_Lumpur), branch `codex/building-organisation-compare`, HEAD `5e6494c` (`Website mock data`). This is a repository and safe local-service audit, **not** production certification or a witnessed end-to-end acceptance test. Inspected `src/`, `backend/app/` (API, auth, ETL, models, migrations, storage, tests), `docs/`, `README.md`, configuration examples, frontend tests, and the supplied audit brief. No `agent.md`/`AGENTS.md` or repository RTM was found. An external `/Users/hgtan/Downloads/GreenScope_RTM_Updated_Progress_and_Next_Steps_2026-10-09.md` exists: it calls itself a **working draft**, has RTM-01 through RTM-12, and explicitly says supervisor approval and live verification are absent. It is useful for mapping, **not evidence of approved scope**. The supplied audit brief is also proposed scope.

Local `127.0.0.1:5174/` and `127.0.0.1:8000/openapi.json` both returned HTTP 200. This verifies process availability only. I did not use real credentials, inspect private live records, mutate the database, test AWS, or witness a multi-role live workflow. Test suites use isolated fixtures; their success does not prove the running PostgreSQL contents or cloud configuration. The frontend selects mock mode only when `VITE_DATA_MODE=mock`; otherwise it calls real APIs (`src/services/dataService.js:9-45`). The currently open browser page alone cannot establish its mode. `README.md` still describes the older Sprint 1 boundary and is out of date relative to current code.

Status meanings: **COMPLETE** = implemented and exercised by relevant tests; **PARTIAL** = some implementation but acceptance gap; **MOCK-ONLY** = mock/UI path without proven real integration; **NOT STARTED** = no implementation found in inspected repository; **NOT VERIFIABLE** = requires inaccessible authority/environment or witness; **NOT APPLICABLE** = excluded by a documented, approved boundary. COMPLETE here is code/test completion of the stated narrow item, not sign-off of the whole stage.

## 2. Executive summary

The strongest code-backed flow is authenticated CSV/XLSX submission into local storage and relational records, auditor approve/reject, SHA-256 check against the stored digest, and approved-only project metrics/history. Frontend mock mode has a coherent uploader-to-auditor-to-viewer journey and comparison visualisations. Backend and frontend suites pass. The critical breaks are **no tenant-scoped upload/evidence/review authorization**, **no S3 Object Lock/WORM or protected digest anchor**, **weak canonical ETL validation**, and **no scheme-specific certification workspace/export**. No approved RTM, supervisor sign-off, real-environment full-flow rehearsal, or official scheme source inventory was evidenced. The system must not imply that an internal APPROVED decision is a GBI/GreenRE certificate.

## 3. Stage status summary

Counts below are derived from the numbered checklist in section 4; each item has exactly one status. A stage gate is PASS only if its full acceptance condition has been demonstrated.

| Stage | C | P | M | NS | NV | NA | Gate |
|---|---:|---:|---:|---:|---:|---:|---|
| 0 Scope/RTM | 0 | 4 | 0 | 3 | 3 | 0 | OPEN: proposed scope unapproved |
| 1 Official research | 0 | 1 | 0 | 9 | 1 | 0 | OPEN: no sourced scheme rules |
| 2 Canonical model | 0 | 7 | 0 | 5 | 0 | 0 | OPEN: canonical lineage/validation incomplete |
| 3 Architecture/security | 4 | 7 | 0 | 2 | 0 | 0 | FAIL: tenant boundary absent |
| 4 Onboarding/uploads | 2 | 3 | 0 | 3 | 1 | 0 | FAIL: authorised organisation flow not enforced |
| 5 ETL | 3 | 6 | 0 | 6 | 0 | 0 | FAIL: invalid values can pass |
| 6 Storage/integrity | 4 | 4 | 0 | 3 | 0 | 0 | OPEN: local attributable hash, no protected WORM |
| 7 Consultant review | 3 | 6 | 0 | 3 | 0 | 0 | FAIL: assignment/tenant authority missing |
| 8 Preparation | 0 | 1 | 0 | 10 | 0 | 0 | OPEN: proposed/unapproved |
| 9 Package/export | 0 | 0 | 0 | 9 | 1 | 0 | OPEN: proposed/unapproved |
| 10 Analytics | 3 | 4 | 1 | 1 | 1 | 0 | OPEN: access/comparability gaps |
| 11 Integration | 2 | 4 | 1 | 2 | 3 | 0 | OPEN: live rehearsal not evidenced |
| 12 Sign-off | 0 | 3 | 0 | 5 | 4 | 0 | OPEN: handover/sign-off absent |
| **Total** | **21** | **50** | **2** | **61** | **14** | **0** | **148 items** |

## 4. Full item-by-item checklist

Evidence abbreviations in this section: `SUB` = `backend/app/submissions/service.py:43-137`, `TRACE` = `backend/app/submissions/traceability.py:102-385`, `REV` = `backend/app/reviews/service.py:141-240`, `ETL` = `backend/app/etl/{readers.py,transform.py,schema.py}`, `PERF` = `backend/app/performance/service.py:64-145`, `MOCK` = `src/mocks/{store.js,mockService.js}`. Paths are repository-relative. “No model/route found” refers to inspected source/migrations, not an assertion about external systems.

### Stage 0 — Scope, requirements and RTM approval

1. **PARTIAL** Product boundary: `src/pages/UploadPlaceholder.jsx:142` says approval is not certification; no approved scope/exclusions document.
2. **NOT STARTED** Building type baseline/optional categories: `backend/app/models/project.py:9-34` has no building type.
3. **NOT VERIFIABLE** Framework/version agreement: no approved GBI NREB/GreenRE ENRB decision or MyCREST decision supplied.
4. **PARTIAL** Roles: `backend/app/auth/permissions.py` defines uploader/auditor/viewer operations; company membership and consultant assignment are not enforced.
5. **NOT STARTED** Consultant invitation/assignment: no assignment model or API in `backend/app/models/`, `backend/app/api/`.
6. **PARTIAL** Existing/proposed/optional distinction: external working-draft RTM has priorities, but certification scope is only proposed and not reconciled in-repo.
7. **PARTIAL** IDs/owners/tests/criteria: external draft RTM-01..12 and TC-01..12 exist; no signed criteria/evidence matrix in repo.
8. **NOT VERIFIABLE** Five significant demo requirements and sign-off: draft proposes five; no supervisor sign-off.
9. **NOT STARTED** Approved exclusions document: isolated UI disclaimer is not a boundary decision.
10. **NOT VERIFIABLE** Team/supervisor approval: no approval artifact supplied.

### Stage 1 — Official certification research (proposed prerequisite)

1. **NOT STARTED** GBI/GreenRE official tool inventory: none in `docs/`.
2. **NOT STARTED** Source URLs/bodies/dates/versions: no scheme source register.
3. **NOT STARTED** Existing versus new-building criteria: no criterion mapping.
4. **NOT STARTED** Criterion IDs/evidence/calculations: no criteria model or matrix.
5. **NOT STARTED** Official PDF/workbook/form inspection: no artifact audit.
6. **NOT STARTED** Mandatory versus scored/optional criteria: no rules.
7. **PARTIAL** Shared measurements: electricity/water/CO2 present in `src/utils/metrics.js`; floor area and scheme mapping absent.
8. **NOT STARTED** Non-tabular criteria inventory: no evidence taxonomy.
9. **NOT VERIFIABLE** Current applicability/version compatibility: official sources not provided or checked.
10. **NOT STARTED** Licensing/redistribution review: no record.
11. **NOT STARTED** Research questions register: no scheme-specific register.

### Stage 2 — Canonical data model and upload templates

1. **PARTIAL** Building metadata: `backend/app/models/project.py:9-34` stores ID/name/location/organisation, not type, boundary or floor area.
2. **PARTIAL** Quarterly metrics: `src/pages/UploadPlaceholder.jsx:16-27,174-190` enforces quarter in UI; backend stores free-text `reporting_period` and arbitrary metric units (`backend/app/models/{submission.py,metric.py}`).
3. **NOT STARTED** Scheme-specific optional fields: no scheme model/mapping.
4. **PARTIAL** Provenance/time/version: `backend/app/models/submission.py:13-38` stores uploader, timestamp, original hash/key, prior submission; raw field-level lineage absent.
5. **NOT STARTED** Criterion-to-field mappings: no scheme tables or mappings.
6. **PARTIAL** Missing versus zero: `backend/app/etl/transform.py:31-52` rejects blank required values and preserves numeric zero; estimated/NA/unavailable states absent.
7. **PARTIAL** Conversion/precision/raw value: `src/utils/metrics.js` presents kgCO2e as tCO2e; backend canonical conversion and per-field original retention absent.
8. **NOT STARTED** Duplicate/overlap/partial-period rules: `backend/app/etl/transform.py` appends rows without duplicate checks; period only a string.
9. **PARTIAL** Upload template: `public/greenchain-sample.csv` and UI instructions exist, no schema-versioned template.
10. **NOT STARTED** Error/warning/info classes: ETL raises validation errors, no severity taxonomy.
11. **PARTIAL** Fixtures: `test_datasets/` and ETL tests include valid/tampered/error cases; missing/duplicate/mixed-unit expected-result matrix absent.
12. **NOT STARTED** Schema/mapping version on processed rows: `backend/app/etl/writer.py` and models lack it.

### Stage 3 — Architecture, security and API contracts

1. **COMPLETE** Component/integration inventory: `docs/FRONTEND_DATA_CONTRACT.md`, `docs/FRONTEND_BACKEND_GAPS.md`, API modules and data-mode service identify actual paths; inspection corroborated them.
2. **PARTIAL** End-to-end architecture: README/docs describe pieces, but README is outdated and cloud/tenant boundaries unresolved.
3. **PARTIAL** Server RBAC: `backend/app/auth/{permissions.py,dependencies.py}` and tests enforce role 401/403; resource-level authority absent.
4. **NOT STARTED** Cross-organisation isolation: `backend/app/submissions/service.py:80-115` trusts submitted organisation name; `TRACE:102-116,300-385` checks only active user; no tenant-scoped negative tests found.
5. **PARTIAL** Project versus review status: `backend/app/models/submission.py` has per-submission state; catalogue derives latest submission status (`backend/app/catalogue/service.py:124-184`), which can be misread as project approval.
6. **NOT STARTED** Certification application/criterion/evidence model: absent from models and migrations.
7. **COMPLETE** Existing API route schemas/statuses: FastAPI OpenAPI returned 200; `backend/app/api/{auth,submissions,reviews,projects,discovery}.py` and catalogue page validation cover current routes. This excludes proposed APIs.
8. **PARTIAL** Standardised errors: `backend/app/core/errors.py` has common envelope, but ETL/permission/error semantics are not a full field-level validation contract.
9. **PARTIAL** File types/limits/downloads: `backend/app/api/submissions.py:58-120`, `backend/app/core/config.py`, `TRACE`; retention and resource-authorised downloads lacking.
10. **COMPLETE** Review transition: `backend/app/reviews/service.py:169-198`, `backend/app/repositories/submissions.py:73-87` and concurrency tests permit only UNREVIEWED→APPROVED/REJECTED.
11. **PARTIAL** Integrity threat model: SHA matching is implemented; `backend/app/storage/dependencies.py` supports local only, so WORM/protected anchor guarantees cannot be claimed.
12. **COMPLETE** Shared mock/real contract adapters: `src/services/dataService.js`, `src/mocks/`, `docs/FRONTEND_DATA_CONTRACT.md`, and `src/test/DataMode.test.js`.
13. **PARTIAL** Handoff owners/checkpoints: frontend docs record gaps; no current integrated sign-off checklist.

### Stage 4 — Company onboarding, projects and uploads

1. **PARTIAL** Authentication/membership: login and `OrganisationMember` model exist; membership is not used to authorise uploaded organisation/project.
2. **PARTIAL** Building creation/edit: upload auto-creates by free-text via `backend/app/repositories/projects.py:8-27`; no authorised edit or explicit creation flow.
3. **NOT STARTED** Scheme/category/version selection: absent in upload UI/model.
4. **NOT STARTED** Applicable scheme requirements: no sourced scheme logic.
5. **COMPLETE** Upload association: `backend/app/api/submissions.py:76-120` and SUB persist project, organisation string-derived record and period; this does **not** mean association is authorised.
6. **COMPLETE** Submission history/decision/approved metrics: `TRACE:300-324`, `PERF`, `src/pages/ProjectDetailPage.jsx`; backend/frontend tests cover relevant slices.
7. **PARTIAL** Project approval label semantics: catalogue's latest submission status can look project-wide; no independent project certification state (`backend/app/catalogue/service.py`).
8. **NOT STARTED** Cross-org rejection: no ownership check in upload/detail/evidence/review path.
9. **NOT VERIFIABLE** Responsive company navigation across viewports: CSS/test coverage exists, but no browser viewport visual QA was performed in this audit.

### Stage 5 — Parsing, cleaning, validation and calculations

1. **COMPLETE** CSV/XLSX parse/type rejection: `backend/app/etl/readers.py`, `backend/app/api/submissions.py:58-75`, ETL/API tests.
2. **PARTIAL** Original bytes/raw values: SUB stores original file; transformed metric rows do not retain raw cell values/coordinates.
3. **PARTIAL** Structure: CSV header/row length and active XLSX sheet checked in `readers.py`; encoding variants and sheet-selection policy absent.
4. **COMPLETE** Source columns to minimal schema: `backend/app/etl/schema.py`, `transform.py`, ETL tests.
5. **PARTIAL** Types/dates/IDs/ranges: `transform.py:31-52` uses `float`, but no finite/range checks, backend quarter/ID validation, or metric whitelist.
6. **NOT STARTED** Backend unit conversions: arbitrary units retained; frontend display conversion is not canonical ETL.
7. **NOT STARTED** Duplicate detection: `clean_rows` appends every row.
8. **NOT STARTED** Overlap/conflict flagging: no explicit rules or warning system.
9. **COMPLETE** Missing is not silently zero: `transform.py:36-45` rejects missing numeric input; ETL tests pass.
10. **NOT STARTED** Outlier flagging: no thresholds/warnings.
11. **PARTIAL** Totals/trends/emissions/intensity: `PERF` provides approved points/history; no emissions factor or intensity calculation contract.
12. **NOT STARTED** Emission factor provenance: no factor model/source/version.
13. **NOT STARTED** Row-level error/warning summary: exceptions identify some row numbers, no aggregate quality report.
14. **PARTIAL** Reproducibility: deterministic transform/writer for same inputs, but schema/rule version not recorded.
15. **PARTIAL** Negative/edge tests: backend suite passes; no observed NaN/infinity, duplicate, mixed-unit, overlap acceptance matrix.

### Stage 6 — Storage, integrity, provenance and audit history

1. **COMPLETE** Original persistence: SUB and `backend/app/storage/local.py` store bytes outside browser; isolated service tests pass.
2. **PARTIAL** Validated measurements/lineage/warnings: metrics and submission relation persisted; warnings/raw-field lineage absent.
3. **PARTIAL** SHA for relevant files: original SHA recorded (`backend/app/models/submission.py:24-35`); processed artifact lacks stored digest/version anchor.
4. **COMPLETE** Verification: `TRACE:326-346`, `REV:223-240`, integrity tests detect mismatch.
5. **COMPLETE** Version linkage: `previous_submission_id`, corrections/history in `TRACE:300-324`; tests cover correction links.
6. **PARTIAL** Audit events: upload/review identities and timestamps persist; no processing, assignment, export event log.
7. **NOT STARTED** S3 Object Lock/WORM: `backend/app/storage/dependencies.py` explicitly supports only local; no AWS configuration/evidence.
8. **NOT STARTED** Retention/deletion policy: local storage can delete; no approved retention rules.
9. **NOT STARTED** Appropriate evidence restriction: generic authenticated detail/download `backend/app/api/submissions.py:216-267` plus `TRACE:102-116` expose cross-tenant artifacts.
10. **PARTIAL** Storage failure/metadata mismatch: exceptions and safe-unavailable metadata exist; cross-store transaction/orphan cleanup not fully established (SUB).
11. **COMPLETE** File/DB/submission ID linkage: storage keys, hash, submission/project/uploader foreign keys (`backend/app/models/submission.py`, migrations 0002/0004); tests pass.

### Stage 7 — Consultant assignment and review

1. **NOT STARTED** Consultant eligibility/invitation/assignment policy: no model/route.
2. **NOT STARTED** Assigned-only access: review queue is global (`REV:141-146`).
3. **PARTIAL** Queue filters: frontend `src/pages/ReviewPlaceholder.jsx` filters/searches; backend pending route returns full queue without scoped pagination/filter contract.
4. **PARTIAL** Evidence/cleaned/validation inspection: review detail and original/processed downloads exist; no validation findings record.
5. **PARTIAL** Accept/request changes/reject: approve and reject only (`backend/app/api/reviews.py:120-157`); correction is separate, no request-changes state.
6. **PARTIAL** Negative reasons/comments: reason field persists (`REV:169-198`), but is optional even for REJECTED.
7. **COMPLETE** Decision bound to version: `Review.submission_id`, review record, tests in `backend/app/tests/test_reviews_service.py`.
8. **COMPLETE** Corrected resubmission linkage: `previous_submission_id`, `TRACE` links, tests.
9. **NOT STARTED** Unassigned-review rejection: auditor role is sufficient regardless of assignment.
10. **COMPLETE** Concurrent decision protection: conditional update and `test_two_concurrent_decisions_cannot_both_succeed`.
11. **PARTIAL** Review history: per-submission review in TRACE; `src/services/dataService.js:35` real `getReviewHistory` returns `null`.
12. **PARTIAL** Endorsement semantics: upload disclaimer exists; consistent product-level terminology and official-boundary policy absent.

### Stage 8 — Certification preparation (proposed, not approved)

1. **NOT STARTED** Scheme/version workspace: no model/page/route.
2. **NOT STARTED** Versioned sourced criteria: no source matrix.
3. **NOT STARTED** Criterion-linked evidence: no join model.
4. **NOT STARTED** Evidence validation/review/missing states per criterion: absent.
5. **NOT STARTED** Required-measurement/document gaps: absent.
6. **NOT STARTED** Non-tabular attachment or unsupported marker: current upload is CSV/XLSX only.
7. **NOT STARTED** Not-applicable justification: absent.
8. **NOT STARTED** Criterion-level comments/corrections: absent.
9. **NOT STARTED** Preparation progress distinct from score: absent.
10. **PARTIAL** UI avoids false certification claims: upload explicitly says approval is not certification; no scheme workspace exists to assess.
11. **NOT STARTED** Scheme-version remap safety: no scheme model.

### Stage 9 — Certification package/export (proposed, not approved)

1. **NOT STARTED** Package contents/formats specification: no approved export contract.
2. **NOT STARTED** Version/hash/criterion manifest: absent.
3. **NOT STARTED** CSV/XLSX/PDF/archive preparation export: no route/service.
4. **NOT STARTED** Package source-value trace: no package to trace.
5. **NOT STARTED** Outstanding requirement pre-export list: absent.
6. **NOT STARTED** Export authorization: no package endpoint.
7. **NOT STARTED** Preparation-package label: no package UI.
8. **NOT VERIFIABLE** Official external submission instructions: no verified official source supplied.
9. **NOT STARTED** Open/check generated package: no artifact.
10. **NOT STARTED** Export event/actor/source log: absent.

### Stage 10 — Approved analytics and transparent reporting

1. **COMPLETE** Approved-only default points: `PERF:94-145`, `backend/app/discovery/service.py:228-282`, performance/discovery tests.
2. **COMPLETE** Published value trace: `MetricPoint.submission_id` in `PERF:20-52`, project/submission drill-down and TRACE; tests pass.
3. **COMPLETE** Three metric trends/units/periods: `src/pages/ProjectDetailPage.jsx`, `src/utils/metrics.js`, metric history API; frontend/backend tests pass.
4. **PARTIAL** Matched-period/boundary comparison: `src/utils/comparison.js` matches quarters; floor area/reporting boundaries are not modeled.
5. **PARTIAL** Missing versus zero/coverage: comparison utility includes coverage, but underlying missingness semantics lack canonical metadata.
6. **PARTIAL** Calculation/factor documentation: frontend unit display and comparison rules exist (`docs/COMPARE_DATA_INTEGRATION.md`); no emissions factor/intensity provenance.
7. **PARTIAL** Safe provenance display: submission/audit detail exists but generic evidence download lacks tenant scoping.
8. **NOT STARTED** Public/private resource policy enforcement: all routes require auth but no resource/tenant visibility policy; see Stage 3/6.
9. **NOT VERIFIABLE** Full browser visual QA: component tests/build pass, but no all-role/mobile screenshot audit in this run.
10. **MOCK-ONLY** Analytics update after full role workflow: mock lifecycle tests demonstrate it; real running multi-role update not witnessed.

### Stage 11 — End-to-end integration, testing and RTM evidence

1. **PARTIAL** One environment: frontend/backend HTTP 200 and isolated suites pass; no witnessed real PostgreSQL/storage transaction.
2. **PARTIAL** Building/upload/error/correction: APIs/tests cover pieces, but authorised tenant flow and full real browser journey unverified.
3. **NOT STARTED** Assignment/request-changes/acceptance: assignment and request-changes state absent.
4. **NOT VERIFIABLE** Scheme checklist/package if approved: scope approval absent; implementation absent.
5. **MOCK-ONLY** Viewer approved-only comparison after role workflow: mock lifecycle/tests cover interaction; no live cross-role witness.
6. **PARTIAL** Negative cases: file/role/conflict tests pass; tenant and missing certification-evidence cases absent.
7. **COMPLETE** Integrity/version tests: `backend/app/tests/{test_reviews_service.py,test_submission_traceability.py}` within 229 passing backend tests.
8. **COMPLETE** Regression suites: 78 frontend + 229 backend passed; build passed.
9. **NOT VERIFIABLE** Approved RTM-to-evidence mapping: no signed RTM.
10. **PARTIAL** Actual outputs: this report records commands/results; no live workflow screenshots or database query evidence.
11. **NOT VERIFIABLE** Full live demo rehearsal: not run or documented.
12. **NOT STARTED** Defect triage/retest record: no current issue log or acceptance closure.

### Stage 12 — FYP sign-off, presentation and handover

1. **NOT VERIFIABLE** Supervisor RTM sign-off: external draft explicitly lacks it.
2. **NOT STARTED** Sourced Malaysian market problem statement: no presentation/source file found.
3. **PARTIAL** User groups/use cases: roles and UI routes show uploader/auditor/viewer; no signed two-use-case presentation.
4. **PARTIAL** Architecture/team contributions: README/docs outline architecture; README stale and contribution evidence not reconciled.
5. **NOT VERIFIABLE** Live demo agreed significant requirements: no approved shortlist/rehearsal.
6. **NOT VERIFIABLE** Project-specific final RTM evidence: draft only.
7. **NOT STARTED** In-scope achieved/unachieved goals list: this audit can inform it, not a signed handover.
8. **NOT STARTED** Certification limits/non-integrated disclosure in presentation: UI has narrow disclaimer, no final slides.
9. **NOT STARTED** Teamwork/project-management lessons: no artifact found.
10. **NOT VERIFIABLE** Four-person 12-minute rehearsal: no record supplied.
11. **PARTIAL** README/runbook: `README.md` has startup commands but says only Sprint 1 while later functionality exists; `.env.example` exists.
12. **NOT STARTED** Final RTM/tests/slides/demo archive: no final archive found.

## 5. Existing RTM mapping (external working draft; **not approved**)

The external GreenScope draft dated 9 October 2026 supplies these exact IDs/priorities and proposed TCs. Its wording and progress are historical planning evidence, not current acceptance. Current assessment below is independently based on repository/test inspection. No supervisor-signed GreenChain RTM was located, so no candidate five-item **approved** demo shortlist can be asserted.

| ID / priority | Requirement shorthand; proposed test | Current evidence | Gap to draft acceptance |
|---|---|---|---|
| RTM-01 Core | Upload/validate; TC-01 | `SUB`, ETL, upload UI, backend tests | Tenant-bound project selection, canonical validation, live DB proof |
| RTM-02 Core | WORM evidence; TC-02 | Local storage only | S3 Object Lock, version retention, safe denial test |
| RTM-03 Core | SHA-256; TC-03 | `TRACE`, integrity tests | Protected/trusted reference digest and object version |
| RTM-04 Core | Review; TC-04 | `REV`, API/UI, tests | Assignment/tenant authority, required negative reason, live witness |
| RTM-05 Core | Visualisation; TC-05 | Project charts and approved points/tests | Real known-fixture chart/API cross-check, status policy |
| RTM-06 Core | Authentication/RBAC; TC-06 | Auth/permission code and tests | Resource/organisation scoping |
| RTM-07 Additional | Discovery/filter; TC-07 | Catalogue API/UI and tests | Live combined-filter witness |
| RTM-08 Core | History/trace; TC-08 | Submission links and original hash | Protected immutable evidence version and safe access |
| RTM-09 Core | Audit trail; TC-09 | Upload/review metadata | Full event trail, access/export events |
| RTM-10 Additional | Historical performance; TC-10 | Period history API/charts | Real multi-period fixture validation |
| RTM-11 Core | Consistency; TC-11 | Minimal schema/ETL tests | Units, finite/range, duplicate/overlap and warnings |
| RTM-12 Additional | Highlights; TC-12 | `backend/app/discovery/service.py`, highlight migration/UI/tests | Refresh/login and visibility policy witness |

## 6. Proposed certification enhancements

Stages 1, 8 and 9, plus scheme fields/assignment in other stages, are **proposed new core**, not existing signed requirements. Minimum viable extension would first require supervisor-approved scope and official versioned source inventory, then a scheme/building applicability model, criterion/evidence mapping, preparation completeness (not score), assignment authority, and an explicitly unofficial preparation export. MyCREST, retail/data-centre-specific rules, direct portal integration, official score prediction, and marketplace behavior remain optional/unapproved. Do not write scheme calculations from unsourced assumptions; no official accreditation or certification outcome can be inferred from current APPROVED records.

## 7. End-to-end integration map

| Step | Current path | Status / exact breakpoint |
|---|---|---|
| Sign-in / role | `LoginPage` → `dataService` → `/auth` → users/members | **LIVE in code/tests**, local process up; tenant membership not used for resource rights |
| Building/period selection | `UploadPlaceholder` free-text → `POST /submissions` → `get_or_create_project` | **BROKEN authority**: submitted organisation is trusted, not bound to membership |
| File ingest/ETL | multipart → readers/transform/writer → metric rows | **LIVE in tests, PARTIAL quality**: CSV/XLSX/minimal schema only; arbitrary metric/unit, non-finite/duplicates can pass |
| Evidence/database | original + processed → local keys; submissions/metrics in relational models | **LIVE in isolated tests; UNKNOWN running DB transaction**; no S3/WORM, processed hash/retention |
| Review | `ReviewPlaceholder` → `/reviews/submissions/*` → Review + status | **LIVE in tests, BROKEN resource scope**: auditor sees global queue, no consultant assignment |
| Published analytics | project/discovery APIs → approved points → charts/compare | **LIVE in code/tests, UNKNOWN live workflow**; boundary comparability and evidence privacy incomplete |
| Preparation/export | no page/route/model | **NOT STARTED**; downloads are original/processed/generated audit report, not certification package |
| Mock journey | `dataService` → `mockService` session store | **MOCK**: independent of backend, browser-session only; does not prove real persistence |

## 8. Verification performed

| Command/check | Exit/result | Interpretation |
|---|---|---|
| `git status --short` before report | 0, clean | No pre-existing tracked edits observed; build output ignored |
| `npm test -- --run` | 0; 15 files, **78 passed** | Frontend unit/component/mock/adapter behavior |
| `.venv/bin/python -m pytest backend/app/tests -q` | 0; **229 passed**, 1 Starlette/httpx deprecation warning | Isolated backend API/service/ETL/security tests; no production DB proof |
| `npm run build` | 0; Vite 7.3.6, 72 modules | Production frontend bundle builds; generated `dist/` ignored |
| `curl ... http://127.0.0.1:5174/` | 0, HTTP **200** | Frontend process reachable |
| `curl ... http://127.0.0.1:8000/openapi.json` | 0, HTTP **200** | Backend process/OpenAPI reachable, not DB/storage health |

No automated test failed. I did not run migrations, seed scripts, destructive retention tests, credentialed API writes, cloud checks, or a full live browser rehearsal. The running database/storage backend and authorization of actual records are **not verified** by these HTTP probes. No screenshots were captured; responsive visual conclusions remain unverified.

## 9. Security, integrity and status semantics

Role checks correctly distinguish 401 unauthenticated and 403 wrong-role for primary upload/review APIs (`backend/app/auth/dependencies.py`, API tests). They do **not** prove organisation isolation: upload accepts a caller-supplied organisation, auditor queue is global, and generic submission history/detail/evidence use only `get_current_user` plus active check. Treat this as a P0 confidentiality and data-integrity issue, not just a UI gap. Evidence downloads include original bytes and generated audit report with uploader/reviewer email (`TRACE:223-246,350-385`). SHA-256 detects changed bytes relative to the database digest, but both file and digest are in locally mutable systems; it does not authenticate the measurements or provide WORM. Local storage is the only wired backend. `APPROVED` means an internal decision on one submission, not project-wide third-party certification. Catalogue status reflects latest submission, which may obscure previously approved periods; UI must label it precisely. Reviewer rejection reason is optional, and no assignment or access-event audit trail exists.

## 10. Prioritised gap register

Complexity is relative S/M/L, **not a time estimate**. Owners use the roles named in the supplied brief; actual team assignment requires confirmation.

| ID | Sev | Stage/RTM | Evidence | Owner / dependency | Size | Next action |
|---|---|---|---|---|---|---|
| G01 | P0 | 3/4/6/7; RTM-01/06/08 | SUB free-text org; `TRACE:102-116`; global `REV:141-146` | Bradley + Hui Zern; tenant policy | L | Define membership/resource policy; enforce on upload/history/evidence/review; add cross-tenant tests |
| G02 | P0 | 5; RTM-01/11 | `transform.py:31-52` accepts arbitrary floats/metrics/units | Gavyn + Bradley; canonical dictionary | M | Reject non-finite/out-of-range, define units/duplicates/period rules and quality report |
| G03 | P0 | 6; RTM-02/03 | `storage/dependencies.py` local only | Hui Zern + Bradley; cloud account/retention policy | L | Design protected S3 object-version/digest reference; verify safe denial/retrieval in test environment |
| G04 | P1 | 0/11/12; all RTM | External draft says unsigned; no repo RTM | Whole team; supervisor decision | M | Ratify existing vs proposed/optional scope and five acceptance demos |
| G05 | P1 | 7; RTM-04 | No assignment model; reason optional; no request-changes state | Bradley + Hong Guan; reviewer policy | L | Agree state machine, consultant invitation/assignment, reason rule; implement/tests after approval |
| G06 | P1 | 2/5; RTM-11 | No versioned dictionary/raw-field lineage | Gavyn + Hui Zern; units/boundaries | L | Version schema and preserve source coordinate/value with processed rows |
| G07 | P1 | 3/10; RTM-05/08 | Catalogue derives status from latest submission | Hong Guan + Bradley; publication policy | M | Clarify project versus submission labels, approved-period behavior and access rules |
| G08 | P1 | 6/11; RTM-09 | Only upload/review metadata, no event log | Hui Zern + Bradley; event schema | M | Add attributed processing/access/export audit events and retention policy |
| G09 | P1 | 11/12; all | No witnessed live multi-role/DB/storage run | Whole team; stable fixtures | M | Rehearse isolated real environment and retain API/DB/UI evidence; test negative cases |
| G10 | P1 | 1/8/9; proposed | No official source inventory or approved scheme scope | Shared research + Gavyn/Bradley; official sources | L | Research/version criteria before building preparation/export |
| G11 | P2 | 3/12 | README describes old Sprint 1 scope | Hong Guan + Bradley; verified run steps | S | Update setup/runbook after integration is demonstrated |
| G12 | P2 | 4/10 | No viewport visual check this audit | Hong Guan; browser QA | S | Capture desktop/mobile all-role screenshots and fix measured issues |

## 11. Recommended implementation sequence (requires approval)

1. **Existing core gate:** approve tenant/resource policy, canonical metric/period dictionary, and RTM scope; block cross-tenant reads/writes before widening demos. Bradley/Hui Zern can design authorization while Gavyn formalises validation; Hong Guan can prepare UI copy/contracts in parallel.
2. **Integrity gate:** integrate/prove protected evidence storage and trusted digest/version reference, then test upload→review→published value with fixed known fixtures in a non-production environment. Add event trail and rejection policy; verify all role/tenant negative paths.
3. **Acceptance gate:** reconcile README, run real four-role/three-role workflow, link each *approved* RTM ID to test, screenshot and DB/storage evidence. Only then claim demo readiness.
4. **Proposed extension gate:** after supervisor approval and official scheme/version research, implement minimal criterion mapping/workspace, evidence gaps and clearly unofficial preparation package. Optional sector/scheme variants and portal integration stay later.

## 12. Demo readiness

**Can demonstrate as code-backed local features:** login/role navigation; real API-backed upload/review/detail/history/approved metrics in an isolated test environment, subject to tenant-security caveat; mock-only uploader→auditor→viewer flow, comparison and state updates. **Cannot responsibly claim today:** tenant-secure multi-organisation production operation, WORM evidence, official certification assessment, consultant assignment, or export to an official channel. **Likely breakpoints:** arbitrary organisation upload, cross-tenant evidence reads, invalid metric values, inconsistent units, and absence of scheme/package routes. The external draft proposes RTM-01..05 as five significant demonstrations, but because it explicitly lacks sign-off, this audit does **not** nominate five approved RTM demonstrations.

## 13. Questions for team/supervisor

1. Which RTM revision and five demonstration requirements are actually approved? Is certification preparation in scope or only a future direction?
2. Which authenticated user may create a building, upload for an organisation, view raw evidence, and review a submission? Is a consultant invited per organisation, building, or submission version?
3. Which building categories and exact GBI NREB/GreenRE ENRB source versions apply? Who verifies official criteria and redistribution rights?
4. What are canonical unit, conversion, reporting-boundary, floor-area, duplicate-period, missing/estimated-data and emissions-factor rules?
5. Is a request-changes decision required, must rejection include a reason, and can an approval be superseded/revoked?
6. What storage retention/object-lock mode and threat model are approved? Where will the trusted digest and object version be anchored?
7. Which environment and anonymised fixture may be used for witnessed end-to-end acceptance without changing live data?

## 14. Appendix: evidence locations

- Audit brief: `/Users/hgtan/Downloads/GreenChain_Codex_Implementation_Audit.md`; external **unsigned working draft**: `/Users/hgtan/Downloads/GreenScope_RTM_Updated_Progress_and_Next_Steps_2026-10-09.md`.
- Frontend: `src/App.jsx`, `src/services/{dataService.js,comparisonService.js}`, `src/pages/{HomePage.jsx,ProjectsPage.jsx,ProjectDetailPage.jsx,ComparePage.jsx,HighlightedPage.jsx,UploadPlaceholder.jsx,ReviewPlaceholder.jsx,LoginPage.jsx}`, `src/utils/{metrics.js,comparison.js,uploadPreview.js}`, `src/mocks/`, `src/test/`.
- Backend routes/auth: `backend/app/main.py`, `backend/app/api/{auth.py,submissions.py,reviews.py,projects.py,discovery.py}`, `backend/app/auth/{dependencies.py,permissions.py,schemas.py}`; runtime API spec at `http://127.0.0.1:8000/openapi.json` (reachable at audit time).
- Backend processing/storage: `backend/app/submissions/{service.py,traceability.py}`, `backend/app/etl/`, `backend/app/reviews/service.py`, `backend/app/performance/`, `backend/app/catalogue/`, `backend/app/discovery/`, `backend/app/storage/{dependencies.py,local.py}`, `backend/app/integrity/hashing.py`, `backend/app/models/`, `backend/app/repositories/`.
- Migrations: `backend/app/migrations/versions/20260902_0001_auth_persistence.py` through `20260903_0006_highlighted_projects.py`; test suites: `backend/app/tests/`, `src/test/`.
- Contracts/gaps: `docs/FRONTEND_DATA_CONTRACT.md`, `docs/FRONTEND_BACKEND_GAPS.md`, `docs/FRONTEND_FEATURE_CHECKLIST.md`, `docs/COMPARE_DATA_INTEGRATION.md`; setup: `README.md`, `.env.example`, `backend/.env.example` if present; sample fixtures: `public/greenchain-sample.csv`, `test_datasets/`.
