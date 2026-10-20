# Gemini-assisted ETL mapping

GreenChain uses Gemini **only to interpret unfamiliar spreadsheet structure**. Existing standard, alternative, and legacy templates continue through the deterministic parser without an AI request. A mapping suggestion is not an audit decision and never calculates or changes measurements.

## Configuration

Install backend dependencies with `pip install -r requirements.txt`. Put the secret only in the backend `.env` (Git-ignored):

```dotenv
GEMINI_API_KEY=your-rotated-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Never place the key in `VITE_` variables, source, test fixtures, or browser requests. **The key previously pasted into chat and shown in a screenshot must be rotated.** Until rotation, treat it as compromised. The model is configurable because availability and pricing can change.

## Workflow and API

1. Uploader selects an owned building and a quarterly reporting period.
2. For unfamiliar CSV or XLSX, `POST /submissions/mapping-preview` receives the file and first checks the known-format parser. Known formats return `{ "kind": "known", "input_format": "..." }` without Gemini.
3. For an unfamiliar structure, the backend inspects up to four worksheets, their first ten possible header rows, up to 20 columns, and two sample rows per candidate. It sends that bounded structural excerpt to Gemini using the official `google-genai` SDK and a Pydantic JSON response schema. It does **not** send the entire file, filename, project name, organisation name, or uploader identity. Email-like and long sample cells are redacted, but uploaded headers and short sample values are transmitted to Google; companies should only use this path when permitted to share those snippets externally.
4. The response includes exact worksheet/header-row/header references, source units, uncertainty flags and warnings. Bad references are flagged for correction. The uploader selects/corrects each column and unit, then explicitly checks the confirmation box.
5. `POST /submissions` receives the original file plus `confirmed_mapping` JSON and `project_id`. The backend reopens the original file, checks the references and units, requires four distinct columns from one worksheet/header row, parses every data row, validates numbers and months, converts units with Decimal arithmetic, enforces the selected quarter and owned-building rule, and stores the canonical monthly records. There is no second Gemini call at confirmation.
6. The confirmed mapping is stored in `submissions.mapping_json`; `input_format` is `MONTHLY_AI_MAPPED`. Original evidence, processed CSV, hashes, audit review, and approved-only viewer visibility follow the existing paths. Submission detail exposes the confirmed mapping to authorised readers.

Supported confirmed units: `month`; electricity `kWh` or `MWh`; water `m3` or `L`; CO2e `tCO2e` or `kgCO2e`. Supported month cells: `YYYY-MM`, `Jan-2026`, `Jan 2026`, `YYYY/MM`, `YYYY-MM-DD`, or an Excel date cell. No missing value is filled, and CO2e is not estimated. Unknown units and ambiguous/missing mappings block processing.

Preview is stateless: it does not write a submission or cache source data on the backend. If Gemini is unconfigured, times out, or is rate-limited, preview returns `503 AI_MAPPING_UNAVAILABLE`; no monthly records are saved. There are no unbounded retries. Users can instead use a documented known template.

## Verification

Mocked SDK tests exercise malformed, missing, ambiguous, cross-sheet, wrong-unit, timeout and rate-limit cases. A separate live smoke test sends only synthetic unfamiliar headers and values, validates the real structured response and deterministic canonical output, and makes no database writes:

```bash
.venv/bin/python -m backend.app.scripts.smoke_gemini_mapping
```

The live smoke test succeeded on 2026-10-20 with `gemini-3.5-flash-lite`, producing two expected canonical months. Rotate the exposed key before further use.

## Limits

- Mapping rows across different worksheets is intentionally disallowed because row alignment would otherwise be ambiguous. The user may choose one worksheet with all four measurements.
- Only the first four worksheets and first ten candidate header rows are offered to Gemini. Reformat deeper workbooks into a known template.
- This is assisted structural interpretation, not official data verification or automatic approval. Auditor review remains separate.
- The preview endpoint has no distributed cost quota; production deployment should add per-account rate limits and billing alerts before exposing the service broadly.
- A frontend role check is not backend security. The preview and upload APIs still enforce uploader permission and selected-building ownership.
