# GreenChain technical implementation audit

## 1. Executive summary

GreenChain has a functioning React/Vite mock demonstration and a FastAPI/SQLAlchemy backend with authentication, CSV/XLSX submission processing, local evidence storage, SHA-256, review decisions, approved metric queries, discovery and downloads. These are **not yet one fully integrated company-to-viewer product**: mock building management has no real API, real upload accepts client-supplied organisation/project names, real submission/evidence reads lack intended organisation and approved-only enforcement, and no S3 Object Lock implementation exists. Certification preparation is outside current scope; see `docs/CERTIFICATION_PREPARATION_REMOVAL.md`. A green test suite proves its covered paths, not deployment readiness.

Status terms: **COMPLETE** means verified in the named environment; **PARTIAL** means incomplete end-to-end; **MOCK-ONLY** means browser-session simulation; **NOT IMPLEMENTED**, **NOT VERIFIED**, **NOT APPLICABLE** have their literal meanings. This is a code audit, not a production security assessment.

## 2. Audit context

Audited 19 October 2026 on `codex/building-organisation-compare`, baseline commit `73ae553` (`workflow chnages`), macOS local workspace. The tree contained uncommitted certification-removal changes and an untracked ETL demo pack before this audit; see `git status`. The local `main` was behind its remote-tracking ref, and live GitHub reachability was unavailable during the initial read (`git ls-remote`: DNS failure). No running PostgreSQL, S3 account, or deployed environment was inspected. Python tests used the repository `.venv` (Python 3.14); the README states a 3.12+ target.

## 3. Repository structure and responsibilities

```text
src/                  React routes/pages, auth, API adapters, mock store, charts/tests
backend/app/api/      FastAPI auth, projects, submissions, reviews, discovery routers
backend/app/{auth,submissions,reviews,performance,catalogue,discovery}/
backend/app/{etl,integrity,storage,repositories,models}/
backend/app/migrations/versions/  six Alembic revisions
backend/app/tests/    API, service, database, ETL, storage and access tests
docs/                 current notes and historical batch documents
test_datasets/        small upload fixtures
GreenChain_Realistic_Raw_Datasets_ETL_Pack (1)/  untracked demonstration workbooks/expected outputs
```

| Component | Actual responsibility |
|---|---|
| `src/App.jsx`, `src/components/Navbar.jsx`, `src/auth/*` | Routes, navigation and client-side role UX; not server security. |
| `src/pages/{HomePage,ProjectsPage,ProjectDetailPage,ComparePage,HighlightedPage}.jsx` | Discovery, approved metric display, comparison and highlights. |
| `src/pages/{MyBuildingsPage,BuildingFormPage,UploadPlaceholder,ReviewPlaceholder}.jsx` | Mock company management, upload and auditor review screens. |
| `src/services/{dataService,comparisonService}.js` | Mode switch and comparison assembly; real comparison fans out over project/history APIs. |
| `src/mocks/{identity,store,selectors,mockService}.js` | Exact demo personas, version-5 session store, ownership selectors, simulated workflows. |
| `src/api/*.js` | Credentialed browser requests to existing FastAPI endpoints. |
| `backend/app/api/*.py`, `backend/app/repositories/*.py` | HTTP handlers and SQLAlchemy queries. |
| `backend/app/submissions/service.py`, `backend/app/etl/*.py` | Upload validation, row parsing, canonical CSV and persistence orchestration. |
| `backend/app/storage/*.py`, `backend/app/integrity/hashing.py` | Local evidence files and SHA-256 calculation; no S3 provider. |

No `.github` CI workflow or repo screenshot/image asset was found in the inspected tree. `package.json`, `requirements.txt`, `.env.example`, `docker-compose.yml`, `vite.config.js`, `alembic.ini`, and `README.md` govern local setup. Historical Batch 3-6 documents describe a removed mock certification experiment, not live scope.

## 4. Architecture and frontend

`src/services/dataService.js` selects mock only for `VITE_DATA_MODE=mock`; otherwise it calls `src/api/{auth,projects,submissions,reviews,discovery}Api.js`. Mock identity is an exact allowlist in `src/mocks/identity.js`; any nonempty password works in mock mode. `src/mocks/store.js` persists buildings, submissions and highlights to `sessionStorage` under `greenchain-demo-v1`, schema 5, with migration/reset. There is no global server-synchronised React state or durable multi-user mock database.

Routes in `src/App.jsx`: `/login`; protected `/`, `/highlighted`, `/projects`, `/projects/:projectId`, `/compare`; uploader `/upload` and mock-only `/my-buildings`, `/my-buildings/new`, `/my-buildings/:buildingId/edit`; auditor `/review`; unknown protected paths redirect to `/projects`. `src/auth/permissions.js` and `RoleRoute` control client UX. `src/utils/metrics.js` limits displayed core metrics to electricity kWh, water m3 and CO2 tCO2e; kgCO2e is converted to tonnes in the display adapter. Charts (`MetricCharts.jsx`, `ComparisonCharts.jsx`) and `src/utils/comparison.js` use approved points. Mock CSV preview (`src/utils/uploadPreview.js`) is CSV-only, while real upload accepts CSV/XLSX without equivalent XLSX preview.

## 5. Backend and PostgreSQL

`backend/app/main.py` registers routers from `backend/app/api/`. Cookie authentication (`greenchain_access_token`) and role permissions live in `backend/app/auth/{dependencies,permissions,security,service}.py`. SQLAlchemy models in `backend/app/models/` define `users`, `organisations`, `organisation_members`, `projects`, `submissions`, `metrics`, `reviews`, `highlighted_projects`; Alembic revisions `0001`-`0006` create/evolve these tables. A submission references project/uploader/previous submission and stores status, source filename, original/processed storage keys and original SHA-256. A review has a unique submission relationship. The organisation membership model exists, but **not all read/write handlers enforce it**.

Real endpoints (all evidenced by `backend/app/api/*.py`): `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`; `GET /projects`, `GET /projects/{id}`, `GET /projects/{id}/metrics/{metric}/history`; `POST /submissions`, `GET /submissions/projects/{id}`, `GET /submissions/{id}`, `GET /submissions/{id}/evidence/{type}`; `GET /reviews/submissions/pending`, `GET /reviews/submissions/{id}`, `POST /reviews/submissions/{id}/decision`, `GET /reviews/submissions/{id}/evidence/{kind}`; `GET /discovery/home`, `GET /highlighted/projects`, `POST/DELETE /highlighted/projects/{id}`. A real company-owned building CRUD API and a per-auditor assignment API are **not implemented**. The real review queue is global to auditor-role users.

## 6. Storage, integrity and S3

`backend/app/storage/base.py` defines store/retrieve/exists/delete operations; `local.py` writes UUID-keyed `original/` and `processed/` files beneath `LOCAL_STORAGE_ROOT`, sanitises names and rejects traversal keys. `dependencies.py` accepts only `STORAGE_BACKEND=local`; other values raise `StorageError`. `backend/app/submissions/service.py` computes SHA-256 of original bytes before storing and records it in PostgreSQL. `backend/app/submissions/traceability.py` re-reads originals and compares the digest for metadata/integrity; reviewer detail does likewise. Original, processed CSV and generated text audit-report downloads use existing evidence routes. The report includes uploader/reviewer names and emails, decision, time and reason. There is no implemented S3 client, bucket configuration, object version ID, retention mode/date, legal hold or Object Lock verification. SHA-256 detects changed bytes when checked; it does **not** make files immutable. The local storage cleanup path also needs failure/rollback review because stored originals can remain after later failures (`submissions/service.py`).

PostgreSQL currently holds metadata and digests, not evidence bytes. Required configuration for real deployment includes a secure database URL, JWT secret, cookie/CORS origin, local storage path or future provider settings; no cloud object-lock verification was performed. Replacing local storage should implement the existing `StorageService` interface, persist immutable object/version/retention metadata through an approved schema change, enforce retrieval permissions and test failure/retention behavior. No cloud change is made by this audit.

## 7. ETL contract

`backend/app/etl/readers.py` parses UTF-8/BOM CSV and active-sheet XLSX (`openpyxl`, read-only/data-only). `schema.py` requires `metric_name,value,unit`; optional `category`; known header aliases and null tokens are normalised. `transform.py` trims required cells, converts `value` to `float`, rejects missing/non-numeric values and empty data; `writer.py` emits UTF-8 processed CSV columns `metric_name,value,unit,category`. `submissions/service.py` limits extension, nonempty bytes and size, creates/gets the project, stores both files and inserts metric rows. Reporting period is supplied as text to upload; period parsing for charts happens later in `performance/periods.py`. There is **no backend electricity/water/CO2 unit conversion or domain calculation** in ETL; source names/units are largely preserved. Frontend display conversion for kgCO2e is not persisted standardisation. No ETL processing-status lifecycle beyond accepted `UNREVIEWED`/error response was found. Submission ID, original/processed keys, digest and metric row relationships provide coarse provenance; source workbook cell/row lineage is not persisted. `backend/app/tests/test_etl.py`, submissions tests and the untracked ETL fixture pack cover different things; the pack's expected outputs were not independently executed as a new test suite.

## 8. Feature completion matrix

| Feature | Mock | Real | Evidence and gap |
|---|---|---|---|
| Authentication/roles | MOCK-ONLY | PARTIAL | Exact mock personas; real cookie/JWT role dependencies tested (`App.auth.test.jsx`, `test_auth.py`); end-to-end organisation policy incomplete. |
| Company buildings | MOCK-ONLY | NOT IMPLEMENTED | `MyBuildingsPage`, `BuildingFormPage`, mock service; no owned-building CRUD endpoint. |
| CSV/XLSX upload + ETL | CSV mock only | PARTIAL | `UploadPlaceholder`, `/submissions`, `submissions/service.py`, ETL tests; real org/project ownership and parity gaps. |
| Local evidence + digest | Simulated/unavailable file | PARTIAL | Local storage and SHA-256 tested; WORM/S3 absent. |
| Review approve/reject | MOCK-ONLY workflow | PARTIAL | `/reviews` role-restricted and tested; no assignment policy, broader access gaps. |
| Approved charts/discovery | COMPLETE in tested mock | PARTIAL real | `ProjectDetailPage`, performance/discovery routes; no deployed real-browser verification, optional unreviewed endpoint. |
| Building comparison | COMPLETE in tested mock | PARTIAL real | `ComparePage`, `comparisonService`; real fan-out, completeness/performance and policy unverified. |
| Submission history/downloads | Simulated metadata | PARTIAL real | Traceability endpoints and tests; detail/evidence access policy inadequate. |
| S3 Object Lock/WORM | NOT IMPLEMENTED | NOT IMPLEMENTED | No S3 provider/configuration. |
| Certification preparation | NOT APPLICABLE | NOT APPLICABLE | Deliberately removed; historical docs are not active scope. |

## 9. Mock-to-real integration matrix

| Flow | Frontend page/service | Mock source | Real API, handler and model | Status, missing work and acceptance test |
|---|---|---|---|---|
| Identity | `LoginPage`, `AuthContext`, `dataService.login/getCurrentUser` | `identity.js` session persona | `/auth/login`, `/auth/me`; `api/auth.py`, `users`/`organisation_members` | PARTIAL: real cookie works in tests; verify deployment/CORS and membership on every relevant request. |
| Organisation/buildings | `MyBuildingsPage`, `getOwnedMockBuildings` | `store.js`, `ownedBuildings` | **API not implemented** for owner-scoped list; `projects`/`organisations` tables exist | MOCK-ONLY: add owner-scoped list and foreign-org denial tests. |
| Building registration/edit | `BuildingFormPage`, create/update mock wrappers | `mockService.js` | **API not implemented**; `projects` table | MOCK-ONLY: define stable-ID create/edit contract and server-side ownership/duplicates tests. |
| Upload | `UploadPlaceholder`, `createSubmission` | mock CSV parser/store | `POST /submissions`, `api/submissions.py`, `submissions/service.py`, `projects/submissions/metrics` | PARTIAL: bind project/org to authenticated membership, support stable project ID, test foreign-org denial and CSV/XLSX parity. |
| Processing/status | Upload result, detail | immediate mock `UNREVIEWED` | 201 result; `submissions.status`, metrics; no separate ETL status API | PARTIAL: define validation/processing result retrieval if asynchronous behavior is required; test failures. |
| ETL output | Detail/evidence links, `getSubmissionDetail` | mock metrics; no file | `GET /submissions/{id}` and `/evidence/processed`; `traceability.py` | PARTIAL: align canonical units/provenance, verify authorized processed download. |
| Auditor assignment/queue | `ReviewPlaceholder`, `getPendingReviews` | legacy mock `assignments` selector plus mock queue | `GET /reviews/submissions/pending`; `reviews/service.py`, `reviews` | PARTIAL: no real assignment API/table; decide global vs assigned queue, test policy. |
| Decision | `ReviewPlaceholder`, `decideSubmission` | mock state/history | `POST /reviews/submissions/{id}/decision`; `reviews`, `submissions` | PARTIAL: reviewer role/transition tested; verify organisation/assignment policy. |
| Approved charts | `ProjectDetailPage`, `getMetricHistory` | approved store points | `GET /projects/{id}/metrics/{metric}/history`; `metrics/submissions` | PARTIAL: approved default works; restrict `include_unreviewed` by role and test viewer denial. |
| Comparison | `ComparePage`, `getComparisonSnapshot` | store fixtures | No dedicated compare API; existing catalogue + history endpoints | PARTIAL: preserve approved-only aggregation, pagination/completeness/performance tests and real-browser QA. |
| Evidence/integrity | Detail, `getSubmissionEvidenceUrl` | no mock file | `/submissions/{id}/evidence/{type}`, `/reviews/.../evidence/{kind}`; keys/digest in `submissions` | PARTIAL: enforce project/status/org permissions server-side, verify digest before original download, then test S3 provider separately. |
| Audit report/history | Project detail, evidence link | mock review metadata | `/submissions/projects/{id}`, `/submissions/{id}/evidence/audit_report`; `reviews`/`submissions` | PARTIAL: text report exists; access scoping, completeness and real download integration tests needed. |

## 10. API/data-contract and security findings

Current upload request is multipart `project_name`, `organisation`, `reporting_period`, optional `previous_submission_id`, `file` (`src/api/submissionsApi.js`, `backend/app/api/submissions.py`); response is `{submission_id,status,message}`. This is not the mock's stable `projectId` selection contract. Current project history/detail responses include IDs, status, uploader/reviewer, evidence metadata, version links and metrics (`api/submissions.py`). Review request is `{decision,reason}` (`api/reviews.py`). No proposed replacement endpoint is represented here as existing.

**High-priority security gap:** `backend/app/submissions/traceability.py` checks only active authentication before returning project submission history, detail, original/processed files or generated report. It does not filter unreviewed/rejected records for VIEWER or enforce organisation ownership; `api/submissions.py` uses `get_current_user` for these reads. `api/projects.py` similarly permits `include_unreviewed=true` for any authenticated user. Frontend filtering in `ProjectDetailPage.jsx` cannot secure direct API calls. Real upload accepts arbitrary organisation/project names and `repositories/projects.py` creates/gets that organisation/project without validating uploader membership. Decide an explicit visibility policy before exposing real mode. Reviewer-only routes do use `Permission.REVIEW_SUBMISSION`, but the queue is not assignment-scoped. S3 access and WORM claims remain unverified.

## 11. Tests and verification

| Command | Result | Limit |
|---|---|---|
| `npm test -- --run` | 18 files, **98/98 passed** | Mostly unit/component/mock; not real browser E2E. |
| `npm run build` | Vite 7.3.6, 76 modules, **passed** | Bundling, not runtime integration. |
| `.venv/bin/pytest -q` | **229 passed**, 1 Starlette/httpx deprecation warning | Database fixtures use SQLite (`backend/app/tests/db_fixtures.py`); not live PostgreSQL. |
| Code inspection | Frontend/backend routes, ETL, storage, models, migrations, tests inspected | No S3 account, live DB, migration execution, production deployment or real-mode start-to-finish test. |

`backend/app/tests/test_{auth,database,etl,storage,submissions_api,submissions_service,reviews_api,reviews_service,submission_traceability,projects_api,performance_service,discovery_api}.py` provide focused coverage. No CI workflow was found. The new untracked XLSX pack is a proposed demo fixture set; manifest/expected outputs are not evidence that the production ETL passed all of its scenarios.

## 12. Proposed eight-requirement RTM

These IDs are an **audit baseline, not supervisor sign-off**.

| ID / use case | Status | Evidence | Remaining gate |
|---|---|---|---|
| RTM-01 Access, UC01/UC02 | PARTIAL | `auth/*`, route guards, auth tests | Server-side ownership and approved-only reads. |
| RTM-02 Building/upload, UC01 | PARTIAL | Mock company pages; real `POST /submissions` | Real owner-scoped CRUD/stable ID and upload binding. |
| RTM-03 ETL, UC01 | PARTIAL | `etl/*`, `test_etl.py`, upload tests | Unit/domain standardisation, PostgreSQL and real-file scenarios. |
| RTM-04 Evidence/SHA/storage, UC01/UC02 | PARTIAL | `storage/local.py`, `integrity/hashing.py`, storage tests | Authorised retrieval; S3 Object Lock/WORM if required. |
| RTM-05 Submission/history, UC01/UC02 | PARTIAL | `submissions/traceability.py`, API tests | Processing lifecycle and access scoping. |
| RTM-06 Review/publication, UC01/UC02 | PARTIAL | `reviews/service.py`, review tests, approved performance query | Review assignment policy and direct-API visibility. |
| RTM-07 Visualisation/compare, UC02 | PARTIAL | Chart/compare components, performance tests | Real dataset/browser and approved-only API verification. |
| RTM-08 Downloads, UC02 | PARTIAL | Existing original/processed/audit-report route and tests | Role/status/organisation rules and production storage. |

Five strongest *candidate* live demos: role-specific sign-in/navigation (RTM-01), CSV upload/validation (RTM-02/03), auditor decision (RTM-06), approved metrics and comparison (RTM-07), and submission history/evidence/audit report (RTM-05/08). Use mock mode for a continuous demonstration unless real-mode preflight proves its environment and authorisation. Supervisor agreement must be obtained separately.

## 13. Prioritised integration plan

| Order / responsible owner | Prerequisite and code area | Acceptance/test |
|---|---|---|
| 1. Contract review — Hong Guan + Bradley + Gavyn + Hui Zern | Compare `src/services/dataService.js`, `src/api/*`, `backend/app/api/*`, ETL schema; agree stable project ID, period/units, error/visibility policy | Versioned agreed examples and contract tests; no fabricated endpoint. |
| 2. DB policy — Bradley + Hui Zern | `models/*`, revisions, membership and project/submission relationships; approve migration if needed | PostgreSQL migration up/down in disposable DB; ownership constraints and preservation tests. |
| 3. Identity/ownership — Bradley backend, Hong Guan frontend | `auth/dependencies.py`, `repositories/projects.py`, company pages | Foreign-org upload/create/edit/read denied by direct API tests; mock UX maps to real membership. |
| 4. Building/submission API — Bradley + Hong Guan | Owner list/create/edit and stable-ID upload contract | Company creates/selects a real building; submission attached to correct org/ID; negative tests. |
| 5. ETL parity — Gavyn + Bradley | `etl/*`, mock preview, fixture pack | CSV/XLSX outcomes and units agreed, invalid files rejected, processed result traceable. |
| 6. Evidence/integrity — Hui Zern + Bradley | `StorageService`, keys/digest metadata, download permissions | Original/processed retrieval matches digest; missing/tampered and failure tests. |
| 7. WORM decision/config — Hui Zern | Cloud bucket/account/config and approved retention policy | If in scope, verify S3 Object Lock in a disposable environment with version/retention evidence; otherwise label planned. |
| 8. Review/publication — Bradley + Hong Guan | Assignment/visibility policy, review routes, detail UI | Auditor decision, 409 repeat decision, viewer cannot direct-read unreviewed/rejected data. |
| 9. Viewer/compare/downloads — Hong Guan + Bradley | Approved endpoints, report permissions, pagination | Real charts/compare only approved points; authorized report/file downloads and denial cases. |
| 10. End-to-end QA — all owners | Steps 1-9 and seeded disposable environment | UC01/UC02 cross-role browser + API + PostgreSQL/storage regression evidence, CI and release checklist. |

Blockers: no approved shared contract, missing building API, weak direct-read/upload organisation policy, no cloud WORM, and no integrated deployment test. Sequence 3 should precede broad real-data demos because hiding records in React is not access control.

## 14. Final technical assessment and evidence

The project has credible separately tested frontend and backend foundations, but the two final use cases are **PARTIAL as an integrated real system**. The strongest immediate deliverable is a labelled mock end-to-end demonstration plus targeted real API tests. Do not claim official certification, green-finance eligibility, blockchain decentralisation, production WORM, or supervisor-approved RTM status.

Primary evidence: `src/App.jsx`, `src/services/*`, `src/mocks/*`, `src/pages/*`, `src/api/*`, `backend/app/api/*`, `backend/app/models/*`, `backend/app/migrations/versions/*`, `backend/app/{etl,storage,integrity,submissions,reviews,performance}/*`, `src/test/*`, `backend/app/tests/*`, and the command results in section 11. Open confirmation: product visibility policy, real-mode architecture/contract, S3 retention scope, live PostgreSQL migration, supervisor RTM agreement and team contribution records.
