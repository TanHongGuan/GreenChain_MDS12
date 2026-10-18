# GreenChain Batch 2: Company and Building Management

Date: 18 October 2026. Scope: frontend **mock mode only**. Batch 1's uncommitted foundation was used as-is. No backend, database, storage, ETL, certification, consultant assignment, or export code was changed. No commit, push or merge was made.

## 1. Functional result

An UPLOADER can now open **My Buildings**, see only buildings linked to their demo organisation, create a building, edit its name/location/description, and upload a CSV to an existing owned building by stable `project_id`. The list shows location, description, submission count and latest submission period/status. It has loading, empty and error states. The existing public Projects catalogue, review workflow, charts and comparison calculations remain separate and operational.

This is mock UX behavior, **not real tenant authorization**. No official certification status or eligibility is represented.

## 2. Files created or modified in Batch 2

| File | Purpose |
|---|---|
| `src/pages/MyBuildingsPage.jsx` (new) | Private company list, submission summary, View/Edit/Upload actions and load states. |
| `src/pages/BuildingFormPage.jsx` (new) | Create/edit form, immutable organisation display, validation/error states. |
| `src/App.jsx` | Mock-only, UPLOADER-gated company routes. |
| `src/components/Navbar.jsx` | Mock-only My Buildings link for UPLOADER. |
| `src/pages/UploadPlaceholder.jsx` | Mock owned-building selector and selected-ID submission path; legacy form retained. |
| `src/mocks/mockService.js` | Owner-scoped list/detail/create/edit, submission summaries and selected-building upload validation. |
| `src/services/dataService.js` | Mock-only company methods; real mode explicitly returns unsupported operation for them. |
| `src/styles.css` | Scoped company list/form and upload-mode responsive styling. |
| `src/test/MockBuildings.test.js` (new) | Service ownership, validation, stable-ID/history, persistence and upload association. |
| `src/test/MockBuildingPages.test.jsx` (new) | List/form states, selected-building upload UI and role-route denial. |
| `src/test/DataMode.test.js` | New company methods cannot call nonexistent real endpoints. |

Previously uncommitted Batch 1 files and the audit/plan documents were not discarded or committed. See the working-tree section below.

## 3. Routes, UI actions and service methods

| Mock-only route | User action | Service method |
|---|---|---|
| `/my-buildings` | Browse owned buildings; View public detail, Edit, Upload, Create | `getOwnedMockBuildings()` → `mock.getOwnedBuildings()` |
| `/my-buildings/new` | Create name/location/description | `createMockBuilding(input)` → `mock.createBuilding(input)` |
| `/my-buildings/:buildingId/edit` | Load/edit permitted metadata | `getOwnedMockBuilding(id)`, `updateMockBuilding(id,input)` |
| `/upload?building=:id` | Preselect owned building, preview CSV, confirm | Existing `createSubmission()` with **mock-only** `projectId` argument |

`/my-buildings*` routes are guarded by `RoleRoute` for an UPLOADER in mock mode; Navbar shows My Buildings only to that role in mock mode. VIEWER/AUDITOR get Access Denied on direct navigation. The mock service independently checks current persona and ownership. In real mode the company routes are unavailable, the My Buildings link is absent, and existing `/upload` behavior/API request shape is unchanged.

## 4. Exact mock fields and relationships

No seeded IDs, metric values, reviews or historical submission records were rewritten. `project/building` retains its Batch 1 fields: `project_id`, `project_name`, `organisation`, `organisation_id`, `location`, `description`, `created_at`. New buildings additionally receive `updated_at`; edits update only `project_name`, `location`, `description`, `updated_at`. Existing seeded buildings need not have `updated_at` until edited. `organisation_id` comes from the signed-in uploader's seeded persona, and the display name comes from the matching stored organisation.

`getOwnedBuildings()` returns **derived response-only** fields `submission_count` (number of stored submissions for that `project_id`) and `latest_submission` (newest by `submitted_at`, or `null`). These are not duplicated into the store. New submissions still use the existing `submission_id`, `project_id`, `reporting_period`, `status`, `submitted_at`, `metrics`, `file_size`, `source_filename` shape. The selected-building path adds an optional `projectId` argument to **mock** `createSubmission` only; it resolves the owned project and ignores conflicting submitted names/organisation values. The established real API contract is untouched.

## 5. Ownership and validation rules

- All create/edit/read company operations require a signed-in mock UPLOADER. Owned buildings are filtered by exact `organisation_id`; foreign edit/detail returns 404-style mock error, foreign selected upload returns 403-style mock error. These are frontend simulation guards, not security controls.
- The create form offers no organisation selector. Service code ignores supplied `organisation_id`/`project_id` on create, assigns the uploader's organisation, allocates the next monotonic `project_id`, and stores timestamps.
- Name is required; name, location and description are trimmed. Limits: 255 characters for name/location and 1000 for description. Duplicate names are rejected **within the same organisation** after trimming and case-insensitive `toLowerCase()` comparison. Internal whitespace is not normalised. The same name in a different organisation is allowed.
- Edit uses an explicit allowed-field list. It never mutates `project_id`, `organisation_id`, `organisation`, `created_at`, submission history, review decisions or metric values. Duplicate-name checks exclude the record being edited.
- A selected upload must resolve to an owned stable ID at the mock-service boundary, even if an outdated or malicious query parameter is supplied. New submissions are linked to that ID and appear in My Buildings/history; the project is not duplicated.

## 6. Compatibility and behavior changes

Existing routes, public catalogue filters, seeded 8 projects/22 submissions, approved-only histories, comparison fixtures, upload CSV preview/confirmation, and auditor approve/reject paths remain in place. The real-mode upload form and FastAPI calls are unchanged. Mock upload now defaults to **My Buildings** selection, with a separate **Legacy free-text** mode for compatibility. A My Buildings Upload action opens `/upload?building=<stable ID>` and preselects that owned building. New buildings appear in the selector immediately on navigation.

The legacy mock path still permits free-text project/organisation creation for old demos, but when a signed-in UPLOADER's text resolves to an **existing foreign-owned building**, the mock service rejects it instead of silently claiming or reusing that project. Newly typed legacy organisation names remain separate legacy organisations; they are not automatically owned by the signed-in company. This path is intentionally transitional and does not model real tenant security.

## 7. Verification

| Check | Result |
|---|---|
| Fresh pre-edit `npm test -- --run` | Exit 0: **85/85 tests**, 16 files. |
| Fresh pre-edit `npm run build` | Exit 0: Vite 7.3.6, 74 modules. |
| Post-edit full `npm test -- --run` | Exit 0: **97/97 tests**, 18 files. Includes all previous upload/review/analytics/comparison tests. |
| Post-edit `npm run build` | Exit 0: Vite 7.3.6, 76 modules. |
| `git diff --check` | Exit 0: no whitespace errors. |
| Local mock-mode Vite | Started on `http://127.0.0.1:5175/`, HTTP 200. Port 5174 was already occupied. Initial sandboxed server start returned EPERM; approved local retry succeeded. |

New tests cover owned-list filtering, create/reload/persona switching, required/duplicate names, edit ID/history/metric preservation, foreign mutation denial, selected-upload project association, route denial for VIEWER/AUDITOR, empty/error UI, and mock/real method isolation. The intermittent `ProjectDetail` metric-tab assertion mentioned in Batch 1 did **not** recur in baseline or post-edit full runs; no unrelated project-detail code was changed.

## 8. Known limitations

- `sessionStorage` persists only within the browser session; persona switching shares that local demo state. Mock role checks and editable browser state do not protect real data.
- The public catalogue still derives a building's displayed status from its latest submission. A newly created building with no submissions can appear as UNREVIEWED, which is a catalogue-label semantics issue for a later scoped change, not a review decision.
- The legacy free-text path remains available for compatibility and can create an unowned legacy organisation record. It should be removed or governed only after the selected-building path is accepted by the team.
- No consultant assignment, certification scheme, preparation checklist, package export, backend endpoint or official scoring is implemented here.
- Component tests and build pass, but this batch did not capture browser screenshots or conduct a full mobile visual audit; that remains a later UI verification task.

## 9. Batch 3 dependencies

Batch 3 can attach an **illustrative** scheme choice and preparation workspace to stable `project_id` records, using `organisation_id` for owner-facing mock views. It must keep scheme/preparation state separate from submission review status; preserve exact submission IDs in evidence links; and avoid official criterion IDs, scores or eligibility claims until source documents are reviewed. No shared backend contract should be finalised from this mock shape yet.

## 10. Git working tree

No commit, push or merge was made. Batch 2 modified `src/App.jsx`, `src/components/Navbar.jsx`, `src/mocks/mockService.js`, `src/pages/UploadPlaceholder.jsx`, `src/services/dataService.js`, `src/styles.css`, and `src/test/DataMode.test.js`; it added the two pages, two test files and this report. The tree also still contains uncommitted Batch 1 changes and untracked audit/plan/Batch 1 documents. None of those earlier changes was reverted or overwritten.
