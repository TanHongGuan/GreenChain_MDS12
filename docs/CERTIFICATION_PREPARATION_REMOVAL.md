# Certification preparation removal

## Current scope

GreenChain manages building sustainability submissions, evidence integrity, auditor decisions, approved metrics, discovery and comparison. GBI/GreenRE preparation, criterion mapping, readiness, consultant reviews and preparation package export are no longer active product features. Sustainability audit reports and original-file evidence actions remain separate and unchanged.

## Removed frontend functionality

- Company preparation and package pages, auditor preparation queue/detail page, their routes and navigation/actions.
- Mock scheme catalogue, criterion responses, preparation assignment/review services and HTML package generator.
- Preparation-only CSS and tests. The mock store now uses schema version 5 and drops preparation fields when loading a prior session. Existing projects, organisations, submissions, metrics, auditor decisions, highlights and IDs are retained.

No real backend endpoint, model, migration or database table for certification preparation was found under `backend/`. No database migration or persistent-data deletion was performed. The mock `assignments[].consultant_id` field predates preparation and drives the **core auditor submission queue**; it remains for session compatibility. It does not represent an active certification-consultant workflow.

## Historical documents

Batch 3-6 implementation reports, the Batch 6 RTM/test/defect logs and integration handover, the original frontend mock completion plan, and supplied certification source material describe the former experimental scope. They are retained as historical records, not current requirements or proof of active features. The current README and this note take precedence for active scope. Reference material may still inform ETL evidence requirements; no certification scoring or eligibility is claimed.

## Verification

- `npm test -- --run`: 18 files, 98 tests passed.
- `npm run build`: passed, Vite 7.3.6, 76 modules.
- `git diff --check`: see final task report.
- Live local browser: Projects catalogue loaded for an uploader; navigation showed Home, Highlighted, Projects, Compare, My Buildings and Upload Data, with no preparation entry. Direct navigation to `/preparation-reviews` redirected to `/projects` and showed the catalogue. A complete cross-role browser walkthrough was not performed.

Changes remain uncommitted. No backend, storage, ETL or database files were modified.
