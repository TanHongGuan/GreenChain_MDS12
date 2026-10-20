# Gemini AI-assisted ETL implementation report

## Previous and new behaviour

Previously, GreenChain parsed only the three recognised file contracts (standard monthly, alternative monthly, and legacy metric rows). The new optional path calls **real Gemini** for unfamiliar CSV/XLSX structure, receives a Pydantic-validated suggestion, lets the uploader correct and confirm it, and runs deterministic ETL on the confirmed references. Recognised formats remain rule-based and do not incur AI calls.

Changed backend files: `backend/app/etl/ai_mapping.py`, `backend/app/api/submissions.py`, `backend/app/submissions/service.py`, `backend/app/models/submission.py`, `backend/app/repositories/submissions.py`, `backend/app/submissions/traceability.py`, `backend/app/core/config.py`, migration `20261020_0010_ai_mapping_provenance.py`, `requirements.txt`, and `.env.example`. New smoke command: `backend/app/scripts/smoke_gemini_mapping.py`.

Changed frontend files: `src/pages/UploadPlaceholder.jsx`, `src/api/submissionsApi.js`, `src/services/dataService.js`, and `src/styles.css`. Added tests: `backend/app/tests/test_ai_mapping.py`, updated `backend/app/tests/test_submissions_api.py` and `src/test/UploadSubmission.test.jsx`.

New API: `POST /submissions/mapping-preview`. Existing `POST /submissions` gains optional `confirmed_mapping` multipart JSON. Submission detail gains `input_format` and `confirmed_mapping`. The migration only adds nullable `submissions.mapping_json`; existing submissions and evidence are untouched. The local PostgreSQL revision is `20261020_0010 (head)`.

Example synthetic source: `Billing Month,TNB Usage (MWh),Water Bill (L),GHG Emissions (kgCO2e)` with `Jan 2026,30,850000,14200`. Gemini mapped the four headers with source units; Python produced `2026-01,30000,850,14.2`. Gemini did not compute those values.

Verification: `ACCOUNT_SELECT_LOGIN=false .venv/bin/pytest -q` passed **384** tests; `npm test -- --run` passed **92** tests; `npm run build` passed. The real SDK smoke request succeeded with the configured `gemini-3.5-flash-lite` model and two canonical rows. Test results distinguish this live request from mocked integration tests.

Remaining integration needs: rotate the API key exposed in chat and screenshot; add production request quotas/billing alerts; agree on metadata-snippet sharing policy with company users; coordinate backend/API ownership with Bradley, storage/provenance with Hui Zern, ETL contract with Gavyn, and upload UX with Hong Guan. The pre-existing dataset-pack deletions and earlier uncommitted monthly ETL changes were preserved. No commit, push or PR was made.
