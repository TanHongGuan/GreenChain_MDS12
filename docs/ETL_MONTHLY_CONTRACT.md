# GreenChain monthly sustainability ETL contract

This is a GreenChain-defined upload contract, not a GBI or GreenRE template. The only core measurements are electricity consumption (kWh), water consumption (m3), and reported CO2-equivalent emissions (tCO2e). Values in `test_datasets/monthly/` are synthetic.

## Upload flow

1. Sign in as an uploader with an organisation and select a building owned by that organisation. `GET /projects/owned` lists eligible buildings; `POST /projects/owned` creates one from `{ "name": "...", "location": "..." }`. Organisation identity is derived from the account, not the request body.
2. Select a quarterly submission period (`YYYY-Q1` through `YYYY-Q4`) and upload a CSV or XLSX file, up to the configured upload limit. Each monthly row must be within that quarter. One or more months may be submitted; missing months are not filled in.
3. `POST /submissions` accepts multipart `project_id`, `reporting_period`, and `file`. The existing `project_name`/`organisation` legacy path remains supported. Monthly uploads require `project_id`.
4. The response reports `submission_id`, `status` (`UNREVIEWED`), `project_id`, `input_format`, `monthly_record_count`, and `processing_status` (`COMPLETED`). ETL completion does not mean auditor approval.

## Formats

| Format | Exact CSV/XLSX headers after case/whitespace normalisation | Month text | Units |
| --- | --- | --- | --- |
| A, standard | `reporting_period,electricity_kwh,water_m3,co2_tco2e` | `YYYY-MM` | kWh, m3, tCO2e |
| B, alternative | `Month,Electricity (MWh),Water (Litres),Carbon (kgCO2e)` | `Jan-2026` etc. | MWh, litres, kgCO2e |
| Legacy | `metric_name,value,unit` with optional `category` | Quarterly metadata only | Existing metric-specific units |

For monthly XLSX, put the header in row 1 of a worksheet named **`Monthly_Data`**. Other sheets are ignored. Legacy XLSX continues to use its active sheet. There is no generic workbook interpretation or daily aggregation.

Alternative units are converted with Decimal arithmetic: MWh × 1000 to kWh; litres ÷ 1000 to m3; kgCO2e ÷ 1000 to tCO2e. For example, `Jan-2026,29.5,980000,14100` becomes `2026-01,29500,980,14.1`. The canonical processed CSV always uses `reporting_period,electricity_kwh,water_m3,co2_tco2e` and sorted month rows.

## Validation and persistence

Monthly uploads reject missing, extra or duplicate headers; empty rows/files; malformed months; duplicate months within a file; months outside the selected quarter; missing, negative, nonfinite or nonnumeric measurements; and values exceeding `NUMERIC(24,8)` precision. The supported units are fixed by the chosen template; no arbitrary unit suffixes are accepted. Overlapping months for the same building are rejected unless explicitly submitted as a correction of the same previous submission. Legacy rows are validated through their existing parser and are **not** given invented monthly dates.

`monthly_records` stores one canonical row per submission/month and links to `submissions` and `projects`. `submissions.input_format` identifies the parser used; `submissions.processing_status` records `COMPLETED` for successfully persisted uploads. Existing quarterly `metrics` rows are **derived totals** from monthly records to preserve current dashboards and comparisons. These totals are not independent monthly source data. Invalid uploads return a 400 validation error before persistence; failed attempts are not stored as processing records.

The original file and canonical processed CSV are separate storage artifacts linked from the same submission. Original SHA-256 and processed SHA-256 checks remain in place. `GET /submissions/{id}/evidence/original` and `/processed` serve authorised downloads. An audit report is separate and exists only after review. Local storage is not WORM; S3 Object Lock requires separate configuration and verification.

`GET /submissions/{id}/monthly` returns that submission's monthly records to its owning uploader, an auditor, or any authenticated user after approval. Unapproved monthly submission details, histories and evidence are not exposed to unrelated accounts. `GET /projects/{id}/monthly` returns approved-only monthly history for charting; where approved corrections overlap, the most recent approved submission by creation time/ID supplies that month. Existing quarterly chart/comparison endpoints remain unchanged and continue to use approved totals.

## Demo files

- `test_datasets/monthly/SYNTHETIC_Bayview_2026_Q1_standard.csv`
- `test_datasets/monthly/SYNTHETIC_Riverside_2026_Q1_alternative.csv`
- `test_datasets/monthly/SYNTHETIC_Hillcrest_2026_Q1_standard.csv`

These are fictional measurements for three fictional buildings. Create/select a separate owned building for each, select `2026-Q1`, and upload. They are not loaded into the database automatically.

## Deployment

Run `alembic upgrade head` before starting the updated backend. This is an additive migration; it does not backfill, delete or rewrite legacy submissions. Restart FastAPI after deploying code. The frontend uses the existing real API service boundary; it does not fabricate data or write to mock storage.
