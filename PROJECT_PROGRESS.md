# GreenChain MDS12 Project Progress

Last updated: 2026-10-09

## Repository Status

- Repository pushed to: `https://github.com/TanHongGuan/GreenChain_MDS12.git`
- Current branch: `main`
- Latest commit: `e29d545 Update audit details and test datasets`
- Local `main` is tracking `origin/main`
- Feature and integration branches for Sprints 5, 6, and 7 have also been pushed

## What Has Been Done

### Backend Foundation

- FastAPI backend is implemented.
- PostgreSQL persistence is configured through SQLAlchemy and Alembic.
- Environment-based configuration is available through `.env` and `.env.example`.
- CORS is configured for the frontend.
- Central API error handling is implemented.
- Backend tests exist for auth, database, uploads, reviews, project APIs, discovery, storage, ETL, and traceability.

### Authentication And Roles

- Login is implemented with an HttpOnly JWT cookie.
- Seeded local accounts exist:
  - `viewer@greenchain.test`
  - `uploader@greenchain.test`
  - `auditor@greenchain.test`
- Local test password is `123`.
- Role-based routing is implemented:
  - Viewer can access Home, Highlighted, and Projects.
  - Uploader can access Upload Data.
  - Auditor can access Review.

### Database And Models

- Database tables exist for:
  - users
  - organisations
  - organisation members
  - projects
  - submissions
  - metrics
  - reviews
  - highlighted projects
- Alembic migrations exist up to Sprint 7.
- Project, submission, metric, review, and highlighted-project persistence are implemented.

### Upload And ETL

- Upload endpoint is implemented: `POST /submissions`.
- CSV and XLSX uploads are supported.
- Server-side validation is implemented.
- Required upload columns:
  - `metric_name`
  - `value`
  - `unit`
- Optional upload column:
  - `category`
- Uploaded data is parsed, cleaned, converted into processed CSV, and persisted.
- Original file and processed file are stored locally.
- Upload status starts as `UNREVIEWED`.

### Integrity And Evidence

- SHA-256 is calculated from the exact uploaded original file bytes.
- Original evidence and processed evidence can be downloaded.
- Local integrity verification compares the stored file bytes against the trusted SHA-256.
- Integrity status can show:
  - `MATCH`
  - `MISMATCH`
  - `UNAVAILABLE`
- Submission detail includes traceability to uploaded evidence.

### Review Workflow

- Auditor review queue is implemented.
- Auditor can approve or reject unreviewed submissions.
- Review decisions persist reviewer, decision, reason, and timestamp.
- Invalid review transitions are blocked.
- Review detail includes submitted-by data and evidence links.
- Recent update added clearer email visibility for uploader and reviewer in audit/detail views.

### Project Catalogue And Discovery

- Project catalogue API is implemented.
- Project list supports search, filtering, sorting, pagination, and status filters.
- Project detail API returns approved metric summaries.
- Metric history API exists.
- Highlighted/watchlist project persistence exists.
- Discovery/highlighted frontend workflow exists.

### Frontend

- React/Vite frontend is implemented in `src/`.
- Login page and protected routing are implemented.
- Navbar adapts to authenticated role.
- Projects page is connected to backend APIs.
- Project detail page shows approved KPI cards, submission records, evidence status, and submission detail.
- Upload page posts real files to backend.
- Review page connects to real pending-review and decision APIs.
- Highlighted page exists.
- Frontend tests exist for auth, projects, upload, review, discovery, and project detail.

### Test Datasets

- Valid upload datasets were created for testing:
  - `test_datasets/GreenChain_Uploader_Original.csv`
  - `test_datasets/GreenChain_Uploader_Tampered.csv`
  - `test_datasets/greenchain_original_valid.csv`
  - `test_datasets/greenchain_tampered_valid.csv`
- The original and tampered files differ by one value, producing different SHA-256 hashes.

### Data Cleanup Work

- Existing uploaded datasets were cleared when requested.
- Later, SNS and Monash uploaded datasets were removed while preserving Sunway Library.
- Current intended preserved dataset state was Sunway Library only.

## What Has Not Been Done Yet

### AWS S3 And WORM Storage

- AWS S3 integration is not implemented.
- S3 Object Lock / WORM is not implemented.
- S3 version IDs are not stored.
- Retention mode and retention duration are not configured.
- Governance versus Compliance retention has not been tested.
- IAM policy and cloud security setup are not implemented.
- Current storage is local filesystem storage only.

### Stronger Integrity Architecture

- No immutable protected manifest exists yet.
- No WORM-protected approved snapshot exists yet.
- SHA-256 proves file-byte integrity only; it does not prove the submitted sustainability measurements are true.
- Trusted digest is currently stored in PostgreSQL, which is useful for MVP checking but not a complete tamper-proof architecture by itself.

### Visualization Work

- Full chart visualizations are not implemented yet.
- Project detail currently shows KPI cards and comparison badges, not real trend charts.
- Metric history API exists, but frontend chart UI does not fully consume it yet.
- No cross-project comparison chart exists.
- No polished approved/unreviewed/rejected chart toggle exists.

### Metric Scope Alignment

- The next-step guides say visible sustainability metrics should be limited to:
  - Electricity
  - Water
  - CO2 Emissions
- Some code still references `Waste` in canonical metric ordering.
- CO2 naming should be standardized across backend, frontend, tests, and sample data.

### Documentation Updates

- `README.md` is outdated in places.
- It still describes some features as not included even though upload, review, project APIs, and traceability now exist.
- README should be updated before final submission or handoff.

### Production Readiness

- No production deployment has been configured.
- No real cloud credentials or production secrets should be committed.
- No registration, OAuth, MFA, or full account-management flow exists.
- No final end-to-end AWS-backed demo has been completed.

## Recommended Next Steps

1. Update `README.md` to match the actual current project state.
2. Align visible metrics with the agreed scope: Electricity, Water, and CO2 Emissions only.
3. Standardize metric names and units across sample files, backend tests, and frontend display.
4. Add proper sustainability visualizations using the existing metric history API.
5. Design and document the AWS S3 Object Lock storage contract before implementation.
6. Add database fields for S3 bucket, object key, version ID, retention metadata, and verification status once the storage contract is agreed.
7. Implement S3 upload and verification behind the existing storage interface.
8. Add WORM/Object Lock tests using a non-production bucket.
9. Run a final end-to-end workflow:
   - upload file
   - store protected evidence
   - persist metadata
   - review submission
   - show approved metrics
   - verify evidence integrity

## Current Development Commands

Backend setup:

```bash
source .venv/bin/activate
python -m pip install -r requirements.txt
alembic upgrade head
python -m backend.app.scripts.seed_auth
python -m backend.app.scripts.setup_storage
```

Run backend:

```bash
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Run frontend:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Run tests:

```bash
pytest
npm test
npm run build
```

## Notes For Team Handoff

- Treat the three GreenScope guide files as next-step planning documents, not as proof that all listed work already exists.
- The current project has real backend/frontend integration for local MVP workflows.
- The main unresolved architectural gap is cloud-backed immutable evidence storage.
- The main unresolved frontend gap is proper visualization beyond KPI cards and traceability tables.
