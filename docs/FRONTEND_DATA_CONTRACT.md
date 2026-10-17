# Frontend data contract

Source of truth: existing FastAPI serializers in `backend/app/api/` and clients in `src/api/`. Frontend keys remain snake_case to avoid wire renaming. Mock mode implements the same service operations; additions below are adapters, not backend promises.

| Entity | Existing fields and types | Optional / proposed |
|---|---|---|
| User | `id: number`, `name: string`, `email: string`, `role: VIEWER\|UPLOADER\|AUDITOR` — EXISTING, verified from auth source | No new fields |
| Organisation | `organisation: string` on project/submission responses — EXISTING | Organisation ID in project responses — PROPOSED, backend change required |
| Project | `project_id: number`, `project_name: string`, `organisation: string`; catalogue also `location: string\|null`, `status`, `reporting_period`, `submission_id`, `submitted_at`, `updated_at` — EXISTING | `description`, project-level totals — PROPOSED, backend change required; shown in mock only |
| Submission | `submission_id`, `project_id`, `project_name`, `organisation`, `reporting_period`, `status`, `submitted_by`, `submitted_at`, `review`, `evidence`, `previous_submission`, `corrected_by` — EXISTING | Mock uses same shape; upload response has only ID/status/message |
| Sustainability metric | `metric_name: string`, `value: number`, `unit: string`, `category: string\|null`, `submission_id`, `reporting_period`, `status` — EXISTING | UI recognizes Electricity/kWh, Water/m3, CO2e/tCO2e (or kgCO2e converted to tCO2e in display adapter). Domain whitelist/conversion — PROPOSED, backend change required |
| History point | `submission_id`, `reporting_period`, `value`, `unit`, `category`, `status` — EXISTING | No interpolation; period is `YYYY-Q1..Q4` for usable charts |
| Review | `review_id`, `reviewer_id`, `reviewer_name`, `reviewer_email`, `decision`, `reason`, `reviewed_at` — EXISTING | UI requires rejection reason; backend does not — NEEDS TEAM DECISION |
| Evidence artifact | `artifact_type`, `available`, `filename`, `content_type`, `size_bytes`, `storage_backend`, `sha256`, `integrity` — EXISTING | WORM version/retention — PROPOSED, backend change required |
| Highlight | project card `highlighted: boolean`, `trusted_metric` — EXISTING | None |
| Catalogue | `projects`, `page`, `page_size`, `total_items`, `total_pages`, `filters` with `value/count` options — EXISTING | Per-row metric summary beyond `trusted_metric` — PROPOSED |
| Home | `recently_updated`, `featured`, `new_projects`, `featured_rule` — EXISTING | Platform totals/activity endpoint — PROPOSED; mock derives totals, real UI omits unavailable counts |
| Upload validation | HTTP 400/413 with `detail` or `error` object; successful `{submission_id,status,message}` — EXISTING | Client preview errors are advisory, not backend acceptance claims |

Status enum: `UNREVIEWED`, `APPROVED`, `REJECTED`. Decision enum: `APPROVED`, `REJECTED`. Integrity: `MATCH`, `MISMATCH`, `UNAVAILABLE`. Metric names/units are not constrained by backend. Frontend adapters filter to the three core metrics and never chart unapproved points. No score or certification is inferred.

| Operation | Existing endpoint | Request / response | Frontend consumer |
|---|---|---|---|
| Login/current/logout | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | Cookie auth; `{user}` | AuthContext |
| Home | `GET /discovery/home` | Home shape above | Home |
| Catalogue | `GET /projects` | `search,location,organisation,reporting_period,status,sort,page,page_size` query; catalogue shape | Projects |
| Detail/history | `GET /projects/{id}`, `GET /projects/{id}/metrics/{name}/history?include_unreviewed=false` | `{project,metrics}` / `{metric_name,points}` | Project Detail |
| Submissions | `GET /submissions/projects/{id}`, `GET /submissions/{id}` | `{submissions}` / `{submission}` | Project/Submission Detail |
| Upload | `POST /submissions` | Multipart `project_name,organisation,reporting_period,file[,previous_submission_id]`; result above | Upload |
| Evidence | `GET /submissions/{id}/evidence/{artifact_type}` | File download; cookie required | Submission Detail |
| Review | `GET /reviews/submissions/pending`, `GET /reviews/submissions/{id}`, `POST /reviews/submissions/{id}/decision` | `{submissions}`, `{submission}`, `{decision,reason}` → decision result | Review |
| Highlight | `GET /highlighted/projects`, `POST/DELETE /highlighted/projects/{id}` | `{projects}`, `{project}`, removal result | Home/Projects/Highlighted |

Real requests use `credentials: include`. Error responses vary between `error.message`, `message`, and FastAPI `detail`; clients normalize message/status. No frontend extension changes these endpoints. `location` is nullable; `description` is mock-only. The current backend may include other metric names and kgCO2e; display adapters must not fabricate or combine incompatible units. `reported_at` is not a separate field: catalogue `updated_at`, submission `submitted_at` are used. See `FRONTEND_BACKEND_GAPS.md`.
