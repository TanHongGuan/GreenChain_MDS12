# GreenChain Synthetic Raw-Dataset ETL Fixture Pack

**Synthetic demonstration data only.** No records are from actual companies, utilities, or verified carbon accounts. Figures are illustrative, not evidence of environmental performance. Names and organisations are fictional.

## Purpose
Six realistic XLSX inputs designed for **ETL development and reproducible demo testing**. They are *not guaranteed to be accepted by GreenChain today*: Gavyn has not yet implemented the ETL, and this pack proposes a bounded input contract that must be approved by the team before making it P0. Keep the original uploaded file unaltered, and preserve transform metadata.

## Files
- D01 Bayview 2026-Q1: valid daily main/submeter grid electricity, cumulative water readings, monthly emissions.
- D02 Bayview 2026-Q2: same format, time series continuation at a new meter opening value.
- D03 Meranti 2026-Q1: valid independent electricity feeds in MWh and kWh, water in litres, emissions in kgCO2e.
- D04 Meranti 2026-Q2: same format, later reporting quarter.
- D05 Bayview 2026-Q1: deliberately **invalid** main meter text and decreasing cumulative water readings. **Do not publish**.
- D06 Meranti 2026-Q2: structurally valid with 3 unusually high consumption days and missing explanatory evidence. Expected to be **ETL-accepted / auditor-rejected** in the scripted demo; an auditor is a human decision-maker, not an automated anomaly detector.

## Workbook sheets
Each workbook contains `00_Read_Me`, source-record sheets, and `Meter_And_ETL_Rules`. Bayview: `Electricity_Log`, `Water_Readings`, `Carbon_Register`. Meranti: `Electricity_Accounts`, `Water_Bills`, `Emissions_Data`.

## Proposed transformations (implementation contract, NOT existing functionality)
**Bayview**
1. Parse electricity dates as `DD/MM/YYYY`.
2. Use `Main Incoming Grid (kWh)` as consumption; **do not add** overlapping Level 01 / Level 02 submeters.
3. Water is **cumulative**, so daily consumption = reading - previous reading; baseline is in `Meter_And_ETL_Rules` (not a normal first data row). Never silently coerce negative consumption.
4. Monthly CO2e = `Reported Scope 2 Electricity Emissions (tCO2e)` + `Reported Other Operational Emissions (tCO2e)`. These are provided values, not emissions computed by GreenChain from electricity.

**Meranti**
1. Parse electricity `MM/DD/YYYY`, water `YYYY/MM/DD`, emissions `YYYY-MM-DD`.
2. Group independent `GRID-A` and `ANNEX-B` feeds by date; convert `GRID-A` MWh to kWh (`*1000`), add `ANNEX-B` kWh.
3. Convert water litres to m³ (`/1000`).
4. Convert reported CO2e kg to tCO2e (`/1000`).

## Reference outputs
For each **valid** or **auditor-reject** input, `expected_etl_outputs/Dxx_expected_monthly.csv` and `Dxx_expected_quarterly.csv` contain reference figures. Compare using numeric tolerances rather than string equality. D05 has an error-report reference instead of cleaned totals. D06 reference output is numerically valid yet **must not be displayed to public viewers unless approved**.

## Status and access caveats
`REPORTED_UNREVIEWED` in outputs is an illustrative post-ETL state, **not** an authoritative GreenChain API enum. Never present ETL success as auditor approval. Building IDs are synthetic; use a mapping to real database IDs if necessary. Organisation RBAC, original file SHA-256, storage retention and audit logging belong to backend/storage integration and are not demonstrated merely by these spreadsheets.

## Quarter handling
Files represent Q1 or Q2 2026 with daily source observations (90 and 91 days). Expected CSV is monthly or quarter totals. The workbook's `00_Read_Me` tells which building and period the uploader selected, but **backend should use authenticated user and selected building** as authority, rather than trusting workbook-supplied ownership metadata.

## Demo order
Preseed D02, D03, D04 as approved. Live-upload D01 and approve after verifying source/cleaned output. Upload D05 to show validation feedback and blocked publication. Upload D06 to show ETL acceptance followed by auditor rejection for unresolved evidence. Link an approved submission to GBI/GreenRE preparation as an **evidence reference**, not proof of certification.

## Limitations to disclose
- Different source formats are *known fixtures*, not generic arbitrary Excel comprehension.
- Synthetic emissions are reported values with illustrative accounting assumptions; do not advertise verified carbon estimation.
- D06 rejection is a staged reviewer decision, not a validated fraud/anomaly-detection model.
- Bayview's Q2 opening cumulative meter reading is explicitly fixture-specific; do not infer continuity with Q1 unless you have reconciled intervening starting state.
- No automatic inference of meter topology, overlapping fields, or reporting boundary. These are manually defined in the accompanying mapping rules.
