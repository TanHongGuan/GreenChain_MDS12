# Compare data integration

The Compare page uses the existing GreenChain project, submission and metric contracts. It does not add a backend endpoint or write to the backend.

## Mock mode

`src/mocks/store.js` adds four fictional buildings and quarterly submissions to the existing demo store. A one-time additive seed update keeps existing browser-session uploads and review decisions. The comparison reads those same records; it has no separate hardcoded organisation totals. Set `VITE_DATA_MODE=mock` for this mode.

## Real mode

`src/services/comparisonService.js` pages through the existing `/projects` catalogue, then requests the three approved metric histories per project. It reconstructs approved submission-level records using the returned submission IDs. The pure calculations in `src/utils/comparison.js` are shared by both modes. Real mode does not generate sample values or call mock storage.

This client-side adapter is suitable for a small catalogue. A large deployment would benefit from a paginated aggregate endpoint with a server-side snapshot and explicit reporting coverage. Until then, loading many projects makes multiple history requests and may be slower. A failure in any history request is surfaced as an error rather than silently presenting an incomplete total.

## Aggregation rules

- Only `APPROVED` submissions contribute.
- For each building and quarter, use the latest approved submission. The real history contract does not expose submission timestamps, so a higher submission ID is used as the version ordering fallback.
- A missing metric in that submission stays missing; an older version is not substituted.
- Electricity is kWh, water is m3, and CO2e is tCO2e. Existing kgCO2e records are converted to tCO2e by the shared metric normalizer. Unsupported units are omitted rather than added.
- Organisation totals sum available building values for the selected quarter. Coverage counts are metric-specific.
- Quarter-over-quarter percentages use only buildings with valid values in both consecutive quarters; the count is shown.
- Absolute totals are not efficiency scores. Floor area, occupancy, operating hours and certification data are not available in the current contract.

The comparison does not expose evidence files, integrity hashes or auditor-only review actions.
