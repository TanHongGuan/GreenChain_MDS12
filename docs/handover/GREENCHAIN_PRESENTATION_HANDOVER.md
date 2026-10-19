# GreenChain presentation and demonstration handover

For a 12-minute, four-member Monash FIT3162/3164/3189 group presentation. **Confirmed** means supported by inspected source/tests; **Proposed** means slide or demo advice; **To confirm** means evidence is missing. Technical details and source paths are in `docs/handover/GREENCHAIN_TECHNICAL_IMPLEMENTATION_AUDIT.md`.

## 1. Project and motivation

GreenChain is a building sustainability evidence management and transparency platform. Organisations submit electricity, water and CO2 emissions records; auditors approve or reject submissions; viewers explore approved metrics and comparisons. The motivation is accountable, traceable sustainability information for infrastructure stakeholders. The original blockchain-inspired concept has evolved into database records, SHA-256 checks and a **planned**, not implemented, immutable cloud-storage approach. SHA-256 is an integrity check, not immutability (`backend/app/integrity/hashing.py`, `backend/app/storage/dependencies.py`).

## 2. Users, stakeholder value and use cases

| Role | Value and current screen |
|---|---|
| VIEWER | Discover buildings and compare approved electricity, water and CO2 data (`/projects`, `/projects/:id`, `/compare`). |
| UPLOADER | In mock mode, manage owned buildings (`/my-buildings`) and submit evidence (`/upload`); real mode has upload but not company building CRUD. |
| AUDITOR | Inspect pending submissions and decide APPROVED/REJECTED (`/review`). |

**UC01:** Company selects a building, uploads CSV/XLSX, data is parsed/validated, original and processed evidence plus digest are recorded, and an auditor reviews the submission. **UC02:** Viewer browses buildings, sees approved metrics, compares buildings and accesses permitted evidence/audit information. The complete UC01/UC02 flow is currently more demonstrable in **mock mode** than against a real integrated deployment (`src/services/dataService.js`, technical audit sections 8-10).

Scope exclusions: certification preparation, GBI/GreenRE mapping, consultant reviews, scores, eligibility, package exports, official certification and financing decisions. Historical Batch 3-6 documentation is superseded for active scope (`docs/CERTIFICATION_PREPARATION_REMOVAL.md`).

## 3. Architecture for a non-developer audience

React/Vite presents role-specific pages. In demo mode, an exact set of fictional users and buildings is stored in the browser session; switching users preserves that session. In real mode, the same frontend calls FastAPI. FastAPI authenticates with a cookie, stores people/projects/submissions/metrics/reviews in PostgreSQL via SQLAlchemy, parses CSV/XLSX, and writes originals/processed CSVs to **local filesystem storage**. It records an original-file SHA-256 and checks it on selected reads. S3 Object Lock has not been implemented. See `src/services/dataService.js`, `backend/app/submissions/service.py`, `backend/app/storage/local.py`, `backend/app/models/*`.

## 4. Honest completion snapshot

| Capability | Confirmed status | Presentation wording |
|---|---|---|
| Role sign-in and navigation | PARTIAL overall; mock persona and real cookie/RBAC tested | “Role-specific demo and tested backend authentication.” |
| Company building management | MOCK-ONLY | “Interactive demo workflow; real owner-scoped building API remains.” |
| CSV/XLSX upload and ETL | PARTIAL integration | “Backend accepts CSV/XLSX and writes processed CSV; mock preview handles CSV.” |
| Evidence integrity | PARTIAL | “SHA-256 recorded and checked with local files; cloud WORM remains planned.” |
| Auditor approve/reject | PARTIAL integration | “Backend decisions and mock workflow tested; assignment/access policy remains.” |
| Approved charts/comparison | COMPLETE in tested mock; PARTIAL real | “Working demo visualisation; real deployment QA remains.” |
| Audit/history/downloads | PARTIAL | “Existing backend routes for original, processed CSV and text audit report; access control needs hardening.” |

The audit found a **priority security gap**: direct real API calls can access non-approved submission history/detail/evidence and `include_unreviewed=true` metric history with authentication but without intended viewer/organisation filtering. Real upload accepts a client-supplied organisation name. Do not present frontend hiding as real security (`backend/app/submissions/traceability.py`, `backend/app/api/projects.py`, `backend/app/repositories/projects.py`).

## 5. Proposed eight-requirement RTM

This is an audit baseline, **not confirmed supervisor sign-off**.

| ID | Use case | Status | Demonstrable evidence and remaining issue |
|---|---|---|---|
| RTM-01 role/organisation access | Both | PARTIAL | Auth tests/role UI; direct API ownership/visibility gap. |
| RTM-02 building and upload | UC01 | PARTIAL | Mock My Buildings and upload; real building CRUD absent. |
| RTM-03 ETL extraction/validation | UC01 | PARTIAL | CSV/XLSX backend tests; domain/unit standardisation incomplete. |
| RTM-04 evidence, SHA-256, secure storage | Both | PARTIAL | Local-file and hash tests; no S3 Object Lock. |
| RTM-05 submission/history | Both | PARTIAL | Traceability routes/tests; access and processing-lifecycle gaps. |
| RTM-06 review/publication | Both | PARTIAL | Review tests; assignment and direct-read enforcement gap. |
| RTM-07 visualisation/comparison | UC02 | PARTIAL real | Mock charts/compare tested; real browser integration not verified. |
| RTM-08 downloads/reports | UC02 | PARTIAL | Original/processed/text audit report routes; permission/storage verification needed. |

**Five candidate significant demos, proposed for supervisor agreement:** (1) role-specific sign-in/navigation, (2) upload/validation, (3) auditor decision, (4) approved charts and building comparison, (5) history, evidence metadata and audit report. These are candidates, **not supervisor-agreed requirements**. For a coherent live demonstration, use the labelled mock mode unless real mode passes a separate preflight. Avoid calling simulated file evidence an actual stored file.

## 6. Precise demo storyboard

1. **Preflight:** run Vite with `VITE_DATA_MODE=mock`, verify local URL and seed personas in `src/mocks/identity.js`. Use fictional data only. Show the “Demo data” label. Do not reset the session mid-demo (`README.md`, `src/components/Navbar.jsx`).
2. **Uploader:** sign in as `uploader@demo.greenchain.test` with any nonempty demo password. Open `/my-buildings`, choose an owned building or create one, then `/upload?building=<project_id>`. Use `public/greenchain-sample.csv` or a validated `test_datasets/` CSV. Preview and confirm. Record the new submission ID; mock upload does not create a real file in backend storage (`src/pages/UploadPlaceholder.jsx`).
3. **Auditor:** switch to `auditor@demo.greenchain.test`; open `/review`, find the submission and approve or reject. For a rejection example use a separate submission. The mock queue and decisions are browser-session state, not production authorisation (`src/pages/ReviewPlaceholder.jsx`, `src/mocks/mockService.js`).
4. **Viewer:** switch to `viewer@demo.greenchain.test`; open `/projects`, the chosen `/projects/:id`, then `/compare`. Show approved-only chart points and explain that a rejection must not appear in approved performance (`src/pages/ProjectDetailPage.jsx`, `src/pages/ComparePage.jsx`).
5. **Evidence:** show submission history, digest/metadata and review result. In mock mode original-file download is unavailable; for a real stored-file/report demonstration, preflight a disposable FastAPI/PostgreSQL/local-storage environment and authorised account first. Do not substitute a fake link (`src/pages/ProjectDetailPage.jsx`, `backend/app/api/submissions.py`).

The demo requires a seeded session and predictable reporting periods; rehearse user switching and test the exact dataset before the presentation. Real mode and mock mode use different accounts and URLs/credentials (`README.md`).

## 7. Visuals and evidence

No repository screenshots, diagrams or image assets were found in the inspected tree. Actual chart screens can be captured during a controlled demo; `src/components/{MetricCharts,ComparisonCharts}.jsx` is the source. `public/greenchain-sample.csv`, `test_datasets/`, and the untracked `GreenChain_Realistic_Raw_Datasets_ETL_Pack (1)/` contain sample/demonstration data, **not screenshots**. Confirm fixture suitability before the live demo; expected-output files in the pack are not a passing test by themselves.

Verified locally on 19 October 2026: `npm test -- --run` **98/98 passed**; `npm run build` passed (Vite 7.3.6, 76 modules); `.venv/bin/pytest -q` **229 passed**, one Starlette/httpx deprecation warning. Backend DB tests use SQLite fixtures, not a live PostgreSQL migration or cloud storage. No end-to-end real-mode browser test, S3 Object Lock test or production deployment verification was performed. These limits belong on the testing slide (`docs/handover/GREENCHAIN_TECHNICAL_IMPLEMENTATION_AUDIT.md`, section 11).

## 8. Challenges, decisions and trade-offs

Confirmed technical decisions: a mock/real service switch enables frontend iteration; local storage provides a testable evidence interface; SHA-256 helps detect byte changes; approved-only chart adapters avoid mixing pending data; certification preparation was removed to refocus on evidence accountability. Trade-off: mock demonstrations are coherent but can mask missing real APIs and security checks. Real backend ETL preserves many source metric names/units rather than guaranteeing canonical domain units; real comparison performs multiple history requests instead of using a dedicated compare endpoint. See technical audit sections 6-10.

Achieved in scope: role-oriented UI, mock company workflow, backend upload/review/evidence foundation, approved-data charts and comparison. Outstanding: real building CRUD and stable ownership binding; server-side visibility/organisation policy; agreed ETL units/periods and PostgreSQL integration test; cloud WORM decision and implementation if still required; real end-to-end QA. Do not call these complete in a conclusion.

## 9. Team contribution and lessons

Responsibility assignments supplied for planning: Hong Guan (frontend), Bradley (backend), Hui Zern (database/storage/integrity), Gavyn (ETL). Repository code alone does **not** prove who authored each contribution. Obtain commit/PR and member confirmation before claiming completed individual work. No specific consultation record, supervisor sign-off, teamwork incident or project-management retrospective was found in the inspected source. **Proposed lesson prompts, not facts:** “How did mock-first development expose integration assumptions?” and “How did scope reduction affect milestone planning?” Ask the team for a concrete incident, action and outcome for each; do not invent anecdotes.

## 10. Claims to avoid and confirmations needed

Do not claim official GBI/GreenRE certification, automated compliance/finance eligibility, blockchain consensus, production immutability, AWS Object Lock, secure approved-only access across all real APIs, complete real-mode integration, supervisor-approved RTM, or individual contributions without evidence. Do not describe a browser-session mock login as secure backend authentication.

Confirm before slides: supervisor agreement on five requirements; actual consultation/background sources; each member's demonstrable contribution; two specific lessons; whether S3 Object Lock is still an in-scope deliverable; real deployment availability; permission policy for unreviewed evidence; current dataset/credentials for demo; actual screenshots; rehearsal timing.

## 11. Suggested 12-minute slide sequence

| Time | Presenter (proposed, confirm with team) | Content |
|---|---|---|
| 0:00-1:00 | Member 1 | Team, problem, research/consultation evidence and two use cases. |
| 1:00-2:00 | Member 2 | Architecture, trust model and honest mock/real boundary. |
| 2:00-2:45 | Member 3 | Eight-requirement RTM and five **candidate** live-demo requirements. |
| 2:45-8:45 | All four, rehearsed hand-offs | Start-to-finish UC01 to UC02 mock demonstration: uploader, auditor, viewer, comparison/evidence; label simulated versus real. |
| 8:45-10:00 | Member 4 | Testing evidence, limitations and key security/integration blockers. |
| 10:00-11:15 | Members 1-2 | Achieved/unachieved goals and a verified teamwork/project-management lesson each. |
| 11:15-12:00 | All | Conclusion and questions buffer. |

This sequence is proposed, not evidence of presentation compliance. If the supervisor requires five *agreed* RTM items, secure written agreement before presenting the candidate list as agreed. Refer to the technical audit for precise code/API/test evidence.
