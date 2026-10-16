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
10. **Upload ownership (P0):** there is no authorised-project/organisation selection API for an uploader, and the real upload endpoint does not enforce cross-organisation ownership. Project and organisation text remain editable; a frontend selector cannot be a security boundary. Backend authorization is required before production use. Mock uploads are explicitly demo-only.
11. **Catalogue approved period:** real catalogue cards expose latest-submission status/period, not a separate latest-approved period. Mock cards show the approved period when available; real catalogue does not guess it. A backend field or approved-data join would be needed for every row.
12. **Review history:** mock mode lists decided submissions from its session store. No cross-project real review-history endpoint is contracted; real mode does not fabricate one.
13. **Evidence preview:** mock review shows synthetic text derived from demo metrics, not original uploaded bytes or immutable artifacts. Real mode uses protected evidence download endpoints only; download errors are surfaced. Integrity MATCH checks consistency, not truth.
14. **Queue filters:** project/organisation/period/search filters are applied to the pending items already returned by the API. A server-side filtered/paginated queue is needed if that list grows large.
