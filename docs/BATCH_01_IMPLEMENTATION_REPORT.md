# GreenChain frontend mock foundation: Batches 0–1

Date: 18 October 2026. Scope: frontend mock-data foundation only. No backend, database, storage, ETL, official scheme rules, or shared API contracts were changed. No commit, push or merge was made.

## 1. Baseline and delivered behavior

Before edits, `npm test -- --run` passed **78/78 tests in 15 files** (exit 0), and `npm run build` passed (exit 0; Vite 7.3.6, 72 modules). Existing routes, pages, upload/review transitions, approved-only analytics, and the 8-project/22-submission comparison fixture were retained. No Batch 2–6 management, certification, assignment, or export page was added.

Batch 1 now provides exact seeded demo identities, organisation-linked mock projects, versioned session-state migration, scoped **read-only foundation selectors**, and a confirmation-gated reset. Mock identity/ownership checks are demonstration behavior, **not backend authorization**. Existing `getPendingReviews`, `getReviewDetail`, `decideSubmission`, and free-text upload behavior intentionally remain unchanged until the later assignment/review batches; the new scoped selectors are not wired into those existing workflows yet.

## 2. Files created or modified

| File | Change |
|---|---|
| `src/mocks/identity.js` (new) | Fixed organisation/persona catalogue, exact email lookup, current identity/session helpers. |
| `src/mocks/selectors.js` (new) | Owned-building, building-submission, pending/reviewed and accepted-assignment selectors. |
| `src/mocks/store.js` | Schema v2, deterministic entities, legacy migration, cache-clearing helper and seed reset. |
| `src/mocks/mockService.js` | Role/ownership-checked read methods for future company/consultant UI; reset method; organisation link on legacy free-text project creation. Existing upload/review methods preserved. |
| `src/services/dataService.js` | Exact demo login, existing real API branch preserved; mock-only company/consultant read boundary and explicit-confirmation reset boundary. |
| `src/services/comparisonService.js` | Return detached mock comparison snapshots instead of array references to mutable store objects; calculations unchanged. |
| `src/pages/LoginPage.jsx` | Mock-only explicit persona selector and non-security disclaimer; real login remains unchanged. |
| `src/components/Navbar.jsx` | Mock-only Reset demo data command guarded by native confirmation. |
| `src/test/MockFoundation.test.js` (new) | Identity switching, migration/reload, corruption recovery, selectors, ownership, reset. |
| `src/test/DataMode.test.js` | Unknown-prefix rejection, confirmed reset boundary, real-mode isolation. |
| `docs/BATCH_01_IMPLEMENTATION_REPORT.md` (new) | This report. |

The pre-existing untracked `GreenChain_Implementation_Audit_Report.md` and `docs/FRONTEND_MOCK_COMPLETION_PLAN.md` were not changed in this batch.

## 3. Mock entities and relationships

These are internal demo structures, **not final backend contracts**.

| Entity | Exact current fields | Relationship |
|---|---|---|
| `organisation` | `{id: string, name: string}` | IDs `demo-civic-trust` and `demo-future-works`; migrated legacy names receive stable `legacy-${encodeURIComponent(name)}` IDs. |
| `user/persona` | `{id: number, name: string, email: string, role: VIEWER\|UPLOADER\|AUDITOR, organisation_id: string\|null}` | Viewer ID 1; Civic uploader ID 2; primary auditor ID 3; Future Works uploader ID 4; second auditor ID 5. Uploader belongs to one demo organisation. |
| `project/building` | Existing `{project_id,project_name,organisation,location,description,created_at,...}` plus `organisation_id` | Existing IDs 101–108 unchanged; organisation name remains for compatibility with catalogue/API-shaped fixtures. New free-text mock uploads attach a matching or newly registered legacy organisation. |
| `submission` | Existing `{submission_id,project_id,reporting_period,status,submitted_at,metrics,...}` | Continues to reference `project_id`; existing review reason/status/metric values are not rewritten. |
| `assignment` | `{id:number,project_id:number,consultant_id:number,status:string}` | Seed assignment ID 1 accepts auditor 3 for project 103. It is used only by the new scoped selector; invitation/decision UI is **not** implemented. |
| `highlights` | Existing `{[user_id]: project_id[]}` | Preserved as-is through migration; remains per mock persona. |
| `store` | Existing collections/counters plus `schemaVersion:2`, `organisations`, `users`, `assignments` | One mutable in-memory cache serialized to `sessionStorage` key `greenchain-demo-v1`; counters remain monotonic after migration. |

`src/mocks/selectors.js` derives `ownedBuildings`, `buildingSubmissions`, `pendingSubmissions`, `reviewedSubmissions`, `acceptedAssignments`, and `assignedSubmissions`. `mockService.getOwnedBuildings/getOwnedBuilding` require a signed-in UPLOADER and scope by their `organisation_id`; `getAssignedSubmissions` requires an AUDITOR and accepted assignment. They return detached copies. Existing global pending-review behavior is intentionally preserved for this batch, so these helpers do **not** imply that the existing review screen is consultant-scoped.

## 4. Migration and reset decisions

- `getStore()` reads the **same** `greenchain-demo-v1` key and upgrades legacy records to `schemaVersion:2`; no key switch discards old sessions.
- A valid old `{projects,submissions}` document keeps every project, submission (including decisions/reasons/metrics), highlight map, and unknown extra properties. Missing organisation links are added by name. Missing comparison fixtures are added only by their known IDs, avoiding duplicates. `nextProjectId`/`nextSubmissionId` advance beyond both old counters and the highest saved IDs.
- A project with a legacy organisation name gets a stable generated ID and an organisation record; its displayed name remains unchanged. Existing seed project/submission IDs and analytics values remain unchanged.
- Malformed JSON or a structurally unusable store falls back to the deterministic seed and rewrites the session key. This recovery can lose unrecoverable malformed data; no silent claim of archival recovery is made. A storage write failure leaves the in-memory demo usable for that tab but may not persist after reload.
- Mock login accepts only the five exact seeded emails (case-insensitive after trimming) plus a nonempty demo password. It no longer derives an UPLOADER/AUDITOR role from arbitrary email prefixes. `getCurrentUser()` rejects an unknown/stale stored ID instead of falling back to VIEWER.
- Reset is visible only in mock mode, asks for native confirmation, requires `resetDemoData(true)` at the service boundary, restores the deterministic seed and reloads the page. It leaves the selected demo identity in place. Tests cover state reset and confirmation requirement; they do not automate the browser's native confirm dialog.
- Real mode still uses the existing FastAPI clients. The new mock-only read/reset methods return an unsupported-operation error in real mode; they do not fabricate a backend endpoint or write to real data.

## 5. Verification results

| Check | Result |
|---|---|
| Baseline `npm test -- --run` | Exit 0: 15 files, 78 tests passed. |
| Baseline `npm run build` | Exit 0: Vite 7.3.6, 72 modules. |
| Interim full test run | Exit 1: 77 passed/1 failed in `ProjectDetail.test.jsx`, “renders multiple metric cards without visualization tabs”; the unchanged page rendered a Water metric tab. This did not recur on subsequent full runs. No project-detail code was edited; treat as intermittent/pre-existing test fragility for later triage. |
| Final `npm test -- --run` | Exit 0: **16 files, 85 tests passed**. |
| Final `npm run build` | Exit 0: Vite 7.3.6, 74 modules. |
| `git diff --check` | Exit 0; no whitespace errors. |

Coverage added: exact persona lookup and switching without data loss; legacy migration with custom project/rejected history/highlights and reload; malformed-store recovery; ownership/assignment/review-state selectors; non-owner/unauthenticated denial in new mock-service methods; detached result copies; reset persistence; mock-mode no-fetch and real-mode adapter isolation. Existing lifecycle, review, upload, discovery, project and comparison tests passed in the final run.

## 6. Existing behavior changed and remaining limitations

Changed: mock login now requires a listed demo email instead of accepting arbitrary prefixes; the mock login screen exposes those identities. A mock-only reset button appears in the navbar. Comparison snapshots are copied, so callers cannot mutate the underlying mock store through their returned objects. New mock-created projects get an organisation ID. No existing seed metrics, submission IDs, routes, real API calls, or approval rules changed.

Limitations: demo passwords are deliberately not secure; browser `sessionStorage` is single-session, not cross-device or server persistence; the mock state is mutable from developer tools; mock role checks are not a security boundary. Old arbitrary-name organisations are retained for compatibility but are not automatically claimed by one of the two seeded uploaders. Existing global auditor review methods are still global; assignment scoping is a future integration step. The seed assignment is a foundation fixture, not an implemented consultant invitation. No official GBI/GreenRE criteria, readiness, score, certification decision, or package is represented. This batch did not perform browser screenshot QA.

## 7. Batch 2 dependencies

Batch 2 can build My Buildings on `getOwnedBuildings/getOwnedBuilding`, the seeded organisation ID, and the stable `project_id` relationship. Before enabling create/edit actions, add mock-service mutation methods that enforce owner identity and duplicate-name validation; do not rely on `RoleRoute` alone. Decide how an existing legacy project is claimed, rather than silently transferring it. Connect owned-building selection to upload while preserving the current free-text path until tests prove compatibility. Revisit the intermittent project-detail tab assertion during broader UI regression work. Do not broaden real-mode API contracts from these internal mock fields yet.

## 8. Git state

No commit was created. At report time, the changed files listed in section 2 were working-tree changes; `src/mocks/identity.js`, `src/mocks/selectors.js`, `src/test/MockFoundation.test.js` and this report were untracked/new. The earlier audit and completion-plan Markdown files were already untracked before this batch and remain untouched. No push or merge was performed.
