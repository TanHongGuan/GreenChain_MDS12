# Batch 3 implementation report

18 October 2026. Branch: `codex/building-organisation-compare`. Frontend mock mode only. No commit or push.

## Summary

An uploader can open **My Buildings → Preparation**, select GBI NREB or GreenRE ENRB for an owned building, browse six scheme-specific categories, record evidence availability and a note, link existing submissions from that building, and see representative-checklist gaps and progress. Selection and responses persist in the existing session store. The UI explicitly says this is preparation, not certification, eligibility, a score or an official application.

## Source catalogue and scope

The source-indexed catalogue is `src/mocks/certificationSchemes.js`. Every item carries scheme ID/version, category ID/name, identifier, title, an original summary, evidence guidance, source document and printed page. Source PDFs were available locally and checked against the supplied source handover:

- GBI NREB Assessment Criteria Tool, V1.1 (January 2011): EE5, EE6, EE8, EQ1, SM2, MR5, WE5, IN1. The six category point allocations (EE 38, EQ 21, SM 10, MR 9, WE 12, IN 10) are retained only as source metadata; the UI never calculates from them. The four explicitly prioritised IDs and titles match the original tool. The extra four are also verified from that tool.
- GreenRE ENRB Design Reference Guide, V4.0 (February 2026): ENRB 1-9, 2-1, 3-3, 4-1, 5-1, 6-1, one representative item in each category. The GreenRE allocation page uses both “Sustainable Practices and Green Innovation” and “Other Green Features” for Part 5. The UI shows the handover's “Other Green Features” category and acknowledges the alternate PDF heading rather than inventing a second category.
- These documents are explicitly versioned historical references, not claims that they are current or complete. Summaries/guidance are preparation prompts, not transcribed requirements or determinations. No points, thresholds or formal assessment outcomes are computed. Operational CO2e values are not treated as proof of GreenRE development carbon emissions; water consumption is not proof of leak detection; electricity data is not proof of GBI BEI compliance.

## Files and data

Added `src/mocks/certificationSchemes.js`, `src/pages/BuildingPreparationPage.jsx`, `src/test/MockPreparation.test.js`, and `src/test/BuildingPreparationPage.test.jsx`. Modified `src/mocks/store.js`, `src/mocks/mockService.js`, `src/services/dataService.js`, `src/App.jsx`, `src/pages/MyBuildingsPage.jsx`, `src/styles.css`, and `docs/FRONTEND_MOCK_COMPLETION_PLAN.md`. Pre-existing uncommitted Batch 1/2 and other workspace files were preserved.

The existing `greenchain-demo-v1` storage key now migrates to `schemaVersion: 3` by adding `preparations: []` and `nextPreparationId: 1`. Existing projects, submissions, reviews, highlights and comparison fixtures are retained. Each preparation record has `id`, `project_id`, `organisation_id`, `scheme_id`, `scheme_version`, `active`, `created_at`, `updated_at` and `responses`. Each response has `status` (`MISSING`, `PROVIDED`, `NEEDS_ATTENTION`), `note`, exact `submission_ids`, and `updated_at`. Existing company metadata and submission values are not altered by this feature. Demo reset restores an empty preparation list.

One scheme is active per building. A change requires explicit UI confirmation and a service `confirmed` flag; previous scheme responses remain stored but inactive, and are restored if that scheme is reselected. No responses carry across schemes. Unknown schemes/criteria/statuses and foreign-building submission IDs are rejected. The mock service checks uploader role and organisation ownership on **read and write**; the route is also uploader-only. This is demo UX isolation, not backend security. Real-mode preparation wrappers return 501 and do not call or mutate the backend.

Submission references are exact IDs. Linked submissions retain their independent audit status. A missing/deleted reference appears as a stale-reference warning; the UI can save to remove it. A linked item is **not** automatically marked Provided. Progress is `round(Provided / total representative items × 100)`, unweighted, with separate Missing and Needs Attention counts. A company can record Provided without a linked submission for non-CSV documentation; this is self-reported availability only and no file is fabricated.

## Verification

Baseline before Batch 3: `npm test -- --run`: 97/97 passing in 18 files. `npm run build`: passed. Added service tests cover both scheme versions/categories, building association, ownership, cross-building link denial, status/progress, reload, scheme switching, stale links, migration and reset. Added UI tests cover selection, category navigation, evidence save and reload, and disclaimer. Full final results are recorded below after the final run.

Visual browser verification: not yet performed; no screenshot or responsive visual inspection is claimed. Automated UI tests are not a substitute for visual QA.

## Limits and next batches

Only representative criteria are included; this is not a complete checklist. The guide's detailed evidence requirements, official scoring, current-version verification, full document storage and actual assessor determinations are outside Batch 3. Browser `sessionStorage` persists across reloads in the same tab/session, not across browser sessions or devices. Mock ownership checks are not real authorisation. Source file paths are local to the handover machine and not bundled into the frontend.

Batch 4 still needs consultant assignment and review of preparation evidence, with scope enforced in the mock service. Batch 5 still needs an explicitly unofficial preparation package preview/export. Later handover candidates: Bradley - owner-scoped preparation APIs and authorisation; Hui Zern - persistent preparation/evidence references and integrity storage; Gavyn - validated metric/evidence mapping. None of these are established API contracts or implemented backend dependencies yet.

## Final command results and Git status

`npm test -- --run`: **20 files, 104 tests passed, 0 failed**. The first new UI-test run failed because the harness used real mode; it was corrected to use the mock service. A second focused run found an ambiguous checkbox query because three criteria each list the same building submissions; that query was scoped to EE5. The final full run above passed. `npm run build`: passed (78 modules transformed). `git diff --check`: passed. No browser screenshot was taken; responsive visual verification remains open.

The working tree remains dirty with pre-existing Batch 1/2 files plus the Batch 3 files listed above. No commit, push or merge was made.
