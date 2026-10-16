# Frontend/backend gaps

1. **Submission visibility:** generic detail/history/evidence APIs currently allow any authenticated role to read pending/rejected evidence. Frontend will hide evidence actions from non-auditors for non-approved submissions, but backend enforcement is required before production use.
2. **Home totals:** `/discovery/home` has sections, not total organisations/submissions/status counts. Mock derives them; real mode leaves unavailable aggregates blank rather than inventing numbers.
3. **Description/location:** project detail returns name and organisation only. Mock description/location is demo-only; real mode uses catalogue location where available and does not invent description.
4. **Metric contract:** backend accepts arbitrary names/units, including Waste. Frontend filters to Electricity, Water and CO2e; it converts kgCO2e to tCO2e only in presentation, with source value preserved. Backend needs an agreed canonical unit policy.
5. **Upload:** browser preview/period/finite-value validation is stricter than backend. No new schema is introduced; backend acceptance remains authoritative. XLSX preview is not parsed locally unless a compatible parser is added; user is told to rely on backend validation.
6. **Review reason:** frontend requires a rejection reason; backend currently treats it as optional.
7. **Persistence:** mock store lives in browser session only and does not write to API; real mode uses existing API. WORM/version/retention and immutable report are not available.
8. **Charts:** real history endpoint provides approved points, but no project overview totals or complete correction supersession semantics. Charts never interpolate missing periods or mix units.
9. **Error shape:** API clients handle both custom `error` and FastAPI `detail` forms; standard response contract remains a backend decision.
