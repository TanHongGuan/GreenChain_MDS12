# Monthly ETL implementation report

## Previous behaviour

`POST /submissions` accepted CSV or an active-sheet XLSX with flat `metric_name,value,unit[,category]` rows and a quarterly period. The ETL cleaned flat rows, stored original and processed evidence, recorded hashes and created `metrics` rows. The frontend supported free-text project/organisation and a legacy CSV preview; XLSX had no browser preview. Approved quarterly metrics fed existing project charts and comparisons. No canonical monthly table, owned-building selector or monthly processing metadata existed.

## Implemented

- Format A and B monthly CSV/XLSX parsing, Decimal unit conversion, month validation, duplicate/overlap checks, and canonical CSV output.
- Additive migration `20261020_0009` adds `monthly_records`, `submissions.input_format` and `submissions.processing_status`. Existing data is untouched. Three quarterly `metrics` totals are derived from each successful monthly submission for compatibility.
- Organisation-scoped owned-building list/create API and `project_id` multipart upload field. The service checks ownership before storing evidence. Legacy free-text upload and response shape remain available.
- Submission monthly-detail API and approved-only project monthly-history API. Non-approved monthly details/evidence are available only to the owner or auditor. Existing processed-data download now uses a `.csv` filename for XLSX originals too.
- Upload page now loads owned buildings, permits creating one, previews monthly CSVs, explains both templates, and shows the actual backend submission result. XLSX preview is still unavailable; no misleading `0 parsed rows` appears.
- Project Detail has an approved-only month-level trend panel for the three core metrics, alongside existing quarterly performance and comparison views.
- Three synthetic, upload-ready Q1 2026 CSV files are in `test_datasets/monthly/`. They are not seeded into PostgreSQL.

## Verification

Before changes: 354 backend tests passed with `ACCOUNT_SELECT_LOGIN=false`, 90 frontend tests passed. The local `.env` has passwordless account selection enabled, which conflicts with two production-default tests unless overridden for the test process.

After changes: `ACCOUNT_SELECT_LOGIN=false .venv/bin/pytest -q` passed **373 tests** (one upstream Starlette/httpx deprecation warning); `npm test -- --run` passed **91 tests**; `npm run build` passed. `git diff --check` passed. The local PostgreSQL revision was `20261019_0008`; `alembic upgrade head` succeeded and `alembic current` reported `20261020_0009 (head)`. The migration was non-destructive. FastAPI was restarted on `http://127.0.0.1:8001` and the live OpenAPI document contains the new routes.

## Limitations and handover

- Processing status is `COMPLETED` only for successful submissions. Rejected input is returned as 400 and not persisted as a failed-processing record; durable failed-attempt tracking would need a separate policy and audit design.
- A quarterly submission may include one, two or three months. The UI/chart does not infer missing months or annual totals.
- Duplicate-month checks run in application logic; simultaneous uploads should be serialised or backed by a project/month uniqueness strategy before high-volume production use.
- Legacy free-text uploads retain their prior identity model and do not inherit the new owned-building guarantee. The selected-building monthly path is the secure one.
- Local evidence storage does not provide WORM retention. Hui Zern must configure and verify S3 Object Lock separately if that is a deployment requirement.
- The monthly API and additive upload response need agreement with Bradley (API/database), Gavyn (ETL data contract), Hui Zern (processed evidence storage), and Hong Guan (frontend and company-building UX) before production rollout.
- Frontend CSV preview is advisory; final backend validation is authoritative. XLSX needs backend confirmation to inspect content.
- Existing seeded benchmark figures remain separate demonstration content and are not inferred from these synthetic datasets.
- The earlier `D01_Bayview_2026_Q1_VALID.xlsx` raw workbook is **not** one of the two agreed monthly input formats; it needs an explicit conversion to the `Monthly_Data` contract before upload. This implementation does not guess its meter-sheet layout.

The repository already contained unrelated tracked deletions under `GreenChain_Realistic_Raw_Datasets_ETL_Pack (1)/` before this work; they were not restored or staged. No commit, push or PR was created.
