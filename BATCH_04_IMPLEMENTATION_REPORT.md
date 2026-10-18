# Batch 4 implementation report

18 October 2026. Frontend mock mode only. Branch: `codex/building-organisation-compare`. No commit, push or merge.

## Completed workflow

The owning uploader opens **My Buildings → Preparation**, selects one of the two seeded Auditor identities, and sees the current consultant and criterion feedback. The assigned Auditor opens **Preparation Reviews** (separate from the existing sustainability submission **Review** page), sees only assigned active preparations, inspects the selected scheme and company evidence, and saves **Accepted for Preparation** or **Needs Revision** with feedback. A revision request requires a nonblank note. These labels are explicitly internal preparation-review outcomes, not GBI/GreenRE decisions or certification status.

The company can update its evidence status, note or linked submission IDs in response. Any such substantive change marks prior review feedback outdated and returns the current review state to Pending Review; the historical reviewer, outcome and note remain visible. An unchanged save or different ordering of the same submission IDs does not invalidate review. Reassignment requires confirmation; the former consultant loses access and their outcomes become historical rather than being attributed to the replacement. Switching schemes retains each preparation's assignment/review history under its own preparation ID; inactive preparations are not in consultant queues.

## Files changed

Modified `src/mocks/store.js`, `src/mocks/mockService.js`, `src/services/dataService.js`, `src/pages/BuildingPreparationPage.jsx`, `src/App.jsx`, `src/components/Navbar.jsx`, `src/styles.css`, `src/test/MockBuildingPages.test.jsx`, `src/test/DataMode.test.js`, and `docs/FRONTEND_MOCK_COMPLETION_PLAN.md`. Added `src/pages/PreparationReviewsPage.jsx`, `src/test/MockPreparationReview.test.js`, `src/test/PreparationReviewPages.test.jsx`, and this report. Pre-existing uncommitted Batch 1–3 work was preserved.

## Data and migration

The existing `greenchain-demo-v1` session store advances from schema 3 to 4. Migration adds `preparationAssignments: []`, `preparationReviews: []`, and `nextPreparationReviewId: 1` without resetting projects, submissions, highlights, preparations or criterion responses. Reset restores these new collections to empty while retaining valid seed projects/submissions. Existing sustainability-submission `assignments` and review semantics are unchanged.

One current assignment per preparation stores `{ preparation_id, consultant_id, assigned_by, assigned_at, revision }`. Reassigning replaces the current consultant and increments `revision`; no unrestricted directory or external invitation is created. A review stores `{ id, preparation_id, criterion_id, reviewer_id, outcome, feedback, reviewed_at, evidence_revision, assignment_revision }`. Reviews append to history; repeating an identical review against unchanged evidence is a no-op.

Each company criterion response gains an `evidence_revision` on substantive changes. The revision increases only when the normalized evidence status, trimmed note or set of submission IDs changes. For migrated Batch 3 responses without this field, revision 0 is the baseline. A review is current only when its criterion evidence revision, assignment revision and reviewer ID all match the current preparation. This prevents a former review from becoming current after reassignment, even if evidence is unchanged. The service derives `PENDING_REVIEW`, `ACCEPTED_FOR_PREPARATION`, or `NEEDS_REVISION` without changing company `MISSING`/`PROVIDED`/`NEEDS_ATTENTION` statuses.

## Access boundaries

Mock service checks, not just route links, enforce owning organisation for company reads, evidence writes and assignment changes. Consultant queue/detail/review methods require the seeded `AUDITOR` identity, the current assignment, an active preparation and a matching building/organisation. Viewers, foreign uploaders, unassigned auditors and former auditors cannot access private preparation records through these methods. Company users cannot submit consultant outcomes; consultants cannot save company evidence or change assignments. Real-mode wrappers throw 501 and do not call backend APIs. These checks simulate UX behavior and are **not production security**.

## Verification

- Baseline before Batch 4: `npm test -- --run` passed **104/104 tests in 20 files**; `npm run build` passed.
- Final `npm test -- --run` passed **113/113 tests in 22 files**. New tests cover eligible identity validation, ownership, assignment/reassignment, queue isolation, persistence, feedback validation, freshness, history, scheme isolation, migration, reset, viewer route denial and real-mode isolation. Existing submission-review tests remain green.
- `npm run build` passed, with 79 modules transformed. `git diff --check` passed.
- An earlier full run showed two intermittent `ProjectDetail` assertions failing on duplicate `kWh` text and a late metric tab; the following full run passed without production changes to that page. The test flake remains a residual risk, not a Batch 4 behavior change.
- Browser QA on the local `http://127.0.0.1:5175/` mock site verified the company assignment panel, consultant navigation, assigned queue and review detail in an isolated demo tab. A 390px viewport reported `scrollWidth === clientWidth === 390`, so no horizontal page overflow was observed. This is a focused visual check, not exhaustive device/accessibility testing. The user's original browser tab was restored to My Buildings.

## Limitations and later integration

The mock store persists only for the browser session. There are no external invitations, notifications, official assessor decisions, file-integrity claims, scoring, certification package or export. A page already open in another tab does not live-refresh when another persona edits the same session state; reload or revisit to see updates. The reviewer may mark Missing evidence Accepted for Preparation because this is an internal manual judgement, not an automated eligibility rule.

Batch 5 still requires an explicitly unofficial preparation package preview/export, with stable criterion/evidence references and visible gaps. Future handover candidates only: Bradley for authenticated assignment/review APIs and server authorisation; Hui Zern for durable review history and evidence provenance; Gavyn for validated sustainability evidence mapping. No backend, database, storage or ETL changes were made and no shared API contract was finalised.

## Git state

The working tree remains dirty with the preserved earlier Batch 1–3 files and the Batch 4 files above. No changes were committed or pushed.
