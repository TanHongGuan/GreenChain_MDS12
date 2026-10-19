# GreenChain MDS12

GreenChain is a sustainability evidence management and transparency platform. Organisations can submit building sustainability data, preserve evidence integrity, maintain traceable audit records, and share reviewed electricity, water and CO2 emissions information.

This repository has a FastAPI/PostgreSQL backend and a React/Vite frontend. The frontend also has a **mock mode** for company building management and demo workflows; it does not write to the real backend. See [Current Implementation Status](#current-implementation-status) before using the site as more than a local demonstration.

## Quick Start: Run GreenChain Locally

Run commands from the repository root. The default instructions below use the **real API mode**, PostgreSQL and local file storage.

### 1. Install prerequisites

- Git
- Python 3.12 or newer (the existing project setup target; no Python version is pinned in a manifest)
- Node.js 20.19+ or 22.12+ (required by the installed Vite 7 package), with npm
- Docker Desktop

Start Docker Desktop before starting PostgreSQL. Confirm the commands `git`, `python`, `node`, `npm` and `docker` are available in your terminal. On systems where Python 3 is named `python3`, use that command in the Python steps.

### 2. Clone the repository

The configured Git remote is `https://github.com/TanHongGuan/GreenChain_MDS12.git`. The branch inspected for this guide is `codex/building-organisation-compare`, which also exists as a remote-tracking branch:

```bash
git clone https://github.com/TanHongGuan/GreenChain_MDS12.git
cd GreenChain_MDS12
git switch codex/building-organisation-compare
```

Check with the team which branch you should use. **This local working tree contains uncommitted frontend mock changes**; a fresh clone will not contain those changes until they are reviewed and published. The default `main` branch may therefore differ from the later mock features described below.

### 3. Configure environment variables

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` for your machine. Keep `POSTGRES_DB`, `POSTGRES_USER` and `POSTGRES_PASSWORD` aligned with `DATABASE_URL`; use an explicit port number in `DATABASE_URL`. Set `DEV_SEED_PASSWORD` to the local development password you intend to use. Replace the example `JWT_SECRET` outside throwaway local development. For the URLs and Vite mode in this guide, set:

```env
FRONTEND_ORIGIN=http://127.0.0.1:5173
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_DATA_MODE=real
```

Use the same hostname (`127.0.0.1`) in both URLs so the credentialed frontend requests match the backend CORS origin. The other supplied defaults are `ENVIRONMENT=development`, `JWT_ALGORITHM=HS256`, `JWT_EXPIRE_MINUTES=60`, `COOKIE_SECURE=false`, `POSTGRES_PORT=5432`, `STORAGE_BACKEND=local`, `LOCAL_STORAGE_ROOT=./var/storage` and `MAX_UPLOAD_SIZE_MB=25`. Never commit `.env`; it is Git-ignored. If you change a `VITE_` value, restart the frontend server.

### 4. Install backend dependencies

macOS/Linux:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Keep the virtual environment active for the migration, seed, storage and backend commands. In new terminals, activate it again.

### 5. Install frontend dependencies

```bash
npm ci
```

The repository has a `package-lock.json`, so `npm ci` installs the locked dependency set.

### 6. Start PostgreSQL

```bash
docker compose up -d postgres
docker compose ps
```

The `postgres` service should show as running. If port 5432 is occupied, set `POSTGRES_PORT=5433` and change the port in `DATABASE_URL` to `5433`, then start the service again. Do not use `docker compose down -v` to fix a port conflict; it removes local database volumes.

### 7. Initialise the database

With the Python virtual environment active:

```bash
alembic upgrade head
python -m backend.app.scripts.seed_auth
```

The seed script creates or updates the local development accounts and sets their password from `DEV_SEED_PASSWORD`. Re-running it does not create duplicate users, but it **does update their passwords** to the current setting.

Load the Sprint 8 demonstration benchmark set as well:

```bash
python -m backend.app.scripts.seed_benchmarks
```

These are **placeholder figures** attributed to `GreenChain Demo Benchmark Set demo-2026.1`, not to any real standards body. The provider and version are shown beside every comparison in the UI. Replace them with licensed data and bump `SOURCE_VERSION` before showing a comparison outside the project team.

Benchmarks are matched on a project's country and property type, which no earlier sprint collects. Set them explicitly for any project you want benchmarked:

```bash
python -m backend.app.scripts.set_project_scope "Your Project Name" Malaysia Office
```

A project without a scope reports `PROJECT_SCOPE_UNKNOWN` rather than being compared against a guessed target.

### 8. Initialise local storage

With the Python virtual environment active:

```bash
python -m backend.app.scripts.setup_storage
```

This prepares and checks `var/storage/original/` and `var/storage/processed/`. It is local filesystem storage, **not** production S3 or WORM storage. With `STORAGE_BACKEND=s3`, the same command instead checks that the configured bucket has versioning and Object Lock enabled; see `docs/STORAGE_S3_OBJECT_LOCK.md`.

### 9. Start the backend

**Terminal 1 — Backend.** From the repository root, activate the virtual environment if needed, then keep this terminal running:

macOS/Linux:

```bash
source .venv/bin/activate
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

### 10. Start the frontend

**Terminal 2 — Frontend.** From the repository root, keep this terminal running:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

### 11. Open GreenChain in the browser

```text
http://127.0.0.1:5173
```

You should see the GreenChain sign-in page (or be redirected there). `http://127.0.0.1:8000` is the backend API, not the website. If Vite reports that 5173 is occupied, use the port it actually prints and update `FRONTEND_ORIGIN` to that exact frontend origin; restart the backend after changing `.env`.

### 12. Log in with a development account

For `VITE_DATA_MODE=real`, use one of the accounts seeded in step 7. All three use **the value currently set in your `.env` as `DEV_SEED_PASSWORD`**, not a universal password:

| Email | Role |
|---|---|
| `viewer@greenchain.test` | VIEWER |
| `uploader@greenchain.test` | UPLOADER |
| `auditor@greenchain.test` | AUDITOR |

The unchanged `.env.example` value is `change-this-local-password`; `123` is **not** its default. These are local development accounts only.

## Common Setup Problems

| Symptom | Check / action |
|---|---|
| Docker Desktop is not running | Start Docker Desktop, then rerun `docker compose up -d postgres` and `docker compose ps`. |
| PostgreSQL port 5432 is occupied | Set `POSTGRES_PORT=5433` and `DATABASE_URL` with port `5433` in `.env`; restart the Compose service. |
| Python virtual environment is inactive | Run `source .venv/bin/activate` (macOS/Linux) or `.venv\Scripts\Activate.ps1` (PowerShell). |
| Python dependency or `uvicorn`/`alembic` is missing | With the virtual environment active, run `python -m pip install -r requirements.txt`. |
| Frontend dependency or Vite is missing | Run `npm ci` from the repository root. |
| Database tables are missing | Run `alembic upgrade head` with PostgreSQL running and the virtual environment active. |
| Development account does not exist | Run `python -m backend.app.scripts.seed_auth`. |
| Development password is rejected | Check `DEV_SEED_PASSWORD` in `.env`, then rerun the seed command; it updates seeded passwords. |
| Port 8000 or 5173 is unavailable | Stop the conflicting service or choose another port; update the corresponding API URL or `FRONTEND_ORIGIN` and restart affected servers. |
| Frontend cannot reach backend / cookie login fails | Check both servers, `VITE_API_BASE_URL`, `FRONTEND_ORIGIN`, exact hostname/port match and `VITE_DATA_MODE=real`; restart after `.env` changes. |

## Current Implementation Status

The original Sprint 1 foundation provided FastAPI authentication/RBAC, PostgreSQL user/organisation persistence, React/Vite login and a local-storage abstraction. The checked-out backend now also has project discovery/catalogue, submissions, sustainability metrics, evidence metadata, highlights and auditor approve/reject endpoints. The frontend supports public project detail, approved-data charts and comparison, upload and review workflows. This is broader than the old Sprint 1-only README description.

The current **mock mode** (`VITE_DATA_MODE=mock`) adds deterministic demo personas, organisation-owned My Buildings, building selection at upload, sustainability submissions and auditor review. Mock records live in browser session storage and never write to the real backend. To use it, set `VITE_DATA_MODE=mock` in `.env`, restart Vite and sign in with a listed persona such as `uploader@demo.greenchain.test`, `auditor@demo.greenchain.test` or `viewer@demo.greenchain.test`; any nonempty demo password works. The frontend also seeds `future-uploader@demo.greenchain.test` and `second-auditor@demo.greenchain.test`. Mock role checks are UX simulation, not backend security.

Sprint 7 home discovery shows Recently Updated, Featured and New Projects sections, each linking into Projects with a preset the catalogue accepts. Sprint 8 adds benchmark comparison and reporting consistency to Project Detail, in both real and mock mode.

**Evidence storage:** `STORAGE_BACKEND=s3` stores evidence in a versioned S3 bucket with Object Lock (GOVERNANCE) retention, pins each submission to exact S3 version IDs and verifies files against an S3-recorded SHA-256. It was verified against a real AWS test bucket on 2026-10-19 (see `docs/STORAGE_S3_OBJECT_LOCK.md`). Local storage remains the development default.

**Not integrated:** real-mode company building management; its mock-only service wrappers return 501. Registration, OAuth and MFA are not implemented here. Certification preparation was removed from the active product scope. Historical Batch 3-6 documents describe discontinued mock experiments and are not current integration requirements; see `docs/CERTIFICATION_PREPARATION_REMOVAL.md`.

## Testing and Verification

These checks verify an installation; they are **not** prerequisites to opening the browser. Run from the repository root, with the Python virtual environment active for backend tests:

```bash
pytest
npm test -- --run
npm run build
git diff --check
```

The last three commands check frontend tests, its production build and whitespace in tracked changes. Do not interpret mock-mode test coverage as proof of real backend integration.

## Authentication and Role Behaviour

| Role | Core navigation | Restricted routes |
|---|---|---|
| `VIEWER` | Home, Highlighted, Projects, Compare | `/upload`, `/review`, `/my-buildings/*` |
| `UPLOADER` | Home, Highlighted, Projects, Compare, Upload Data; My Buildings in mock mode | `/review` |
| `AUDITOR` | Home, Highlighted, Projects, Compare, Review | `/upload`, `/my-buildings/*` |

In real mode, the backend authenticates with an HttpOnly cookie and enforces its existing API permissions. Refresh after login should retain the authenticated user; logout returns to `/login`; protected routes redirect to `/login` when signed out; wrong-role routes show Access Denied. Mock persona selection and frontend route guards do not replace backend authorisation.

## API Contract

Authentication uses an HttpOnly cookie named `greenchain_access_token`. Frontend JavaScript does not read or store the JWT. These are the existing backend endpoints.

### `POST /auth/login`

Request (the password is illustrative; use your configured `DEV_SEED_PASSWORD`):

```json
{
  "email": "uploader@greenchain.test",
  "password": "change-this-local-password"
}
```

Success:

```json
{
  "user": {
    "id": "...",
    "name": "GreenChain Uploader",
    "email": "uploader@greenchain.test",
    "role": "UPLOADER",
    "organisation_id": "..."
  }
}
```

Invalid credentials:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect."
  }
}
```

### `GET /auth/me`

Returns the current authenticated user:

```json
{
  "user": {
    "id": "...",
    "name": "...",
    "email": "...",
    "role": "VIEWER",
    "organisation_id": null
  }
}
```

Missing, malformed, expired or invalid tokens return `401`.

### `POST /auth/logout`

Returns `204 No Content` and clears the auth cookie.

### `GET /insights/projects/{project_id}/benchmarks`

Sprint 8. Compares each metric's latest **APPROVED** value against the best-matching benchmark. Unreviewed and rejected data are never benchmarked. Any authenticated role may read it.

```json
{
  "project": { "project_id": 105, "project_name": "Bukit Civic Annex", "organisation": "Demo Civic Trust",
               "country": "Malaysia", "property_type": "Office" },
  "tolerance_percent": 5.0,
  "comparisons": [
    { "metric_name": "Electricity", "reporting_period": "2026-Q2", "submission_id": 1112,
      "value": 90000.0, "unit": "kWh", "direction": "LOWER_IS_BETTER",
      "benchmark_value": 95000.0, "benchmark_unit": "kWh",
      "difference_percent": -5.26, "classification": "BETTER_THAN_TARGET", "reason": null,
      "source": { "provider": "GreenChain Demo Benchmark Set", "source_version": "demo-2026.1", "year": 2026 } }
  ]
}
```

`classification` is `BETTER_THAN_TARGET`, `AT_TARGET`, `WORSE_THAN_TARGET` or `NOT_COMPARABLE`. A value within `tolerance_percent` of the benchmark is `AT_TARGET`.

A metric that cannot be benchmarked is still returned, with a machine-readable `reason`:

| `reason` | Meaning |
|---|---|
| `PROJECT_SCOPE_UNKNOWN` | The project has no recorded country/property type. |
| `NO_BENCHMARK_FOR_SCOPE` | No benchmark published for that scope/metric at or before the reporting year. |
| `UNIT_MISMATCH` | The reported unit is not the canonical unit and has no documented conversion. |
| `UNKNOWN_METRIC_DIRECTION` | The metric is not one of the canonical three. |
| `BENCHMARK_NOT_USABLE` | The benchmark value is zero, so a percentage difference is undefined. |
| `PERIOD_NOT_PARSEABLE` | The reporting period is not `YYYY-Qn`. |

The UI renders these reasons rather than hiding the metric: a dropped bar and a passing bar look identical to someone scanning.

### `GET /insights/projects/{project_id}/consistency`

Sprint 8. Which metric x period cells have approved data.

```json
{
  "project_id": 105,
  "metrics": ["CO2e", "Electricity", "Water"],
  "periods": ["2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2"],
  "cells": [
    { "metric_name": "CO2e", "reporting_period": "2026-Q1", "state": "MISSING",
      "value": null, "unit": null, "submission_id": null }
  ],
  "approved_cells": 11, "total_cells": 12, "approved_coverage_percent": 91.67
}
```

`state` is `APPROVED`, `UNREVIEWED` or `MISSING`. `approved_coverage_percent` measures **reporting completeness, not sustainability performance** — the raw counts are returned alongside it so the UI can say so.

### Canonical metrics

Both insights endpoints resolve metric names and units through `backend/app/benchmarks/canonical.py`, the server-side mirror of `CORE_METRICS` in `src/utils/metrics.js`. **Change both together.**

| Metric | Accepted names | Canonical unit | Accepted conversions |
|---|---|---|---|
| Electricity | `Electricity`, `electricity_consumption` | `kWh` | none |
| Water | `Water`, `water_consumption` | `m3` | none |
| CO2e | `CO2e`, `CO2 Emissions`, `carbon_emissions` | `tCO2e` | `kgCO2e` x 0.001 |

No other conversion is applied. An unrecognised unit is reported as `UNIT_MISMATCH` rather than converted on an assumed factor.

## Frontend API Usage

Credentialed auth requests must include browser credentials:

```js
fetch("http://127.0.0.1:8000/auth/me", {
  credentials: "include",
});
```

With Axios (only if your own client installs it; this frontend currently uses Fetch):

```js
axios.get("http://127.0.0.1:8000/auth/me", {
  withCredentials: true,
});
```

## Backend Architecture

Authentication flow:

```text
Auth Router -> Auth Service -> UserRepository -> SQLAlchemy -> PostgreSQL
```

Key files:

- `backend/app/main.py`: FastAPI app and CORS setup.
- `backend/app/api/auth.py`: `/auth/login`, `/auth/me`, `/auth/logout`.
- `backend/app/auth/security.py`: password hashing and JWT helpers.
- `backend/app/auth/dependencies.py`: current-user and permission dependencies.
- `backend/app/repositories/users.py`: SQLAlchemy user repository.
- `backend/app/models/`: SQLAlchemy models.
- `backend/app/migrations/`: Alembic migrations.
- `backend/app/scripts/seed_auth.py`: development auth seeding.

Current models include `users`, `organisations`, `organisation_members`, `projects`, `submissions`, `metrics`, `reviews` and `highlighted_projects`. Sprint 1 originally included the first three. Valid roles are exactly `VIEWER`, `UPLOADER` and `AUDITOR`.

## Storage Architecture

The storage service writes original and processed evidence either to the local filesystem (`STORAGE_BACKEND=local`, development) or to a versioned AWS S3 bucket with Object Lock retention (`STORAGE_BACKEND=s3`). Full design, trust model, AWS setup and verification steps: `docs/STORAGE_S3_OBJECT_LOCK.md`. Its main pieces are:

- `backend/app/storage/base.py`: `StorageService` protocol (version-aware reads, `describe`, version-specific deletes).
- `backend/app/storage/local.py`: local storage implementation.
- `backend/app/storage/s3.py`: S3 implementation with `VersionId` pinning, Object Lock retention and S3-recorded SHA-256 checksums.
- `backend/app/storage/dependencies.py`: `get_storage_service()`.
- `backend/app/storage/models.py`: `StoredFile`, `StoredObjectInfo`, accepted extensions/content types.
- `backend/app/integrity/hashing.py`: SHA-256 helper.
- `backend/app/integrity/verification.py`: verification of one exact stored version against the database digest and the provider checksum.
- `backend/app/scripts/setup_storage.py`: local storage initialisation, or S3 bucket versioning/Object Lock check.
- `backend/app/scripts/worm_evidence_check.py`: produces a JSON evidence report from a real test bucket (denied delete of a locked version, unchanged hash after overwrite).

The existing dependency pattern is:

```python
storage = Depends(get_storage_service)
stored_file = storage.store_original(upload.file, upload.filename, upload.content_type)
```

`StoredFile` contains `storage_key`, `original_filename`, `size_bytes`, `content_type`, `storage_backend`, `sha256` and, on S3, `version_id`, `retention_mode` and `retain_until`; these are persisted on the submission (migration `20261019_0008`). Runtime contents under `var/storage/original/` and `var/storage/processed/` are ignored by Git; only `var/storage/.gitkeep` is tracked. SHA-256 alone does **not** establish immutable or WORM storage; the S3 backend's Object Lock behaviour is tested against moto and was verified on a real AWS test bucket with `worm_evidence_check`.

## Deployment and Operations (Sprint 9)

### Health endpoints

Both are unauthenticated: a load balancer cannot log in, and neither exposes user or project data.

| Endpoint | Answers | Use it for |
|---|---|---|
| `GET /health` | Is the process alive? No dependencies checked. | Container restart policy |
| `GET /health/ready` | Can it reach PostgreSQL? Returns **503** with `{"checks":{"database":"unavailable"}}` if not. | Deploy gate, rolling update readiness |

Keep them separate. If a restart probe also checks the database, a database outage looks like a dead process and the orchestrator restarts a perfectly healthy container in a loop.

### Production configuration is enforced at startup

With `ENVIRONMENT=production`, the app **refuses to boot** on any of these, reporting all problems at once rather than one per restart:

- `JWT_SECRET` left at its development default, or shorter than 32 characters
- `COOKIE_SECURE` not `true` (the session cookie would travel over plain HTTP)
- `FRONTEND_ORIGIN` set to `*` (invalid with credentialed CORS), using `http://`, or pointing at localhost
- `DATABASE_URL` still containing the shipped development password

These are cheap to check at boot and expensive to discover in production, where a misconfigured deploy looks healthy and is silently insecure.

### Running the production-shaped stack

```bash
npm run build                      # produces dist/, which nginx serves
export POSTGRES_DB=greenchain POSTGRES_USER=greenchain POSTGRES_PASSWORD='<strong>'
export JWT_SECRET="$(openssl rand -hex 32)"
export FRONTEND_ORIGIN=https://your-host
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

`docker-compose.prod.yml` defaults nothing — a missing variable fails immediately instead of deploying a development value. Evidence is stored on the `greenchain_evidence` volume; **anything written inside the container is lost on the next deploy**.

`docker-compose.yml` (PostgreSQL only) is still the local development stack.

### Deployment smoke test

```bash
./deploy/smoke_test.sh http://localhost:8000 "$DEV_SEED_PASSWORD"
```

22 checks covering the full acceptance journey plus the negative paths: health, anonymous access denied, role boundaries enforced, malformed and oversized uploads rejected, upload → `UNREVIEWED` → approve → approved metrics visible → insights. It exits non-zero on the first failure, so it can gate a deploy. It is safe to run repeatedly; each run creates its own submission.

### Continuous integration

`.github/workflows/ci.yml` runs three independent jobs so a red tick names the layer that broke:

| Job | What it proves |
|---|---|
| `backend` | `pytest` against SQLite fixtures |
| `migrations` | The chain upgrades, downgrades one revision and re-upgrades **against real PostgreSQL**, then both seed scripts run. Migration `0004` uses ALTER-constraint operations SQLite cannot execute, so this is the only place the chain is genuinely proven. |
| `frontend` | `vitest` and a production build |

### Handover notes

- **Python 3.12 or newer.** The codebase uses syntax that 3.10 (the macOS default) cannot parse. CI and the Docker image both pin 3.12.
- **Seed scripts are idempotent.** Re-running `seed_auth` updates existing users' passwords to the current `DEV_SEED_PASSWORD`; `seed_benchmarks` reports `0 new rows` on a second run.
- **Benchmark data is placeholder.** Attributed to `GreenChain Demo Benchmark Set demo-2026.1`, never to a real standards body. Replace before any external claim.
- **Storage is local filesystem only.** S3 Object Lock / WORM is separate in-progress work behind the same `StorageService` protocol.
- **Known gap — no tenant isolation.** `POST /submissions` accepts a caller-supplied organisation name with no membership check, and the auditor queue is global. Role boundaries are enforced; organisation boundaries are not. Do not run multi-organisation data on this until that is closed.

## Useful Development Commands

Stop PostgreSQL without removing its Compose volume:

```bash
docker compose down
```

**Destructive local reset:** `docker compose down -v` removes Compose-managed database volumes and destroys their local data. Run it only when you intend to discard that data:

```bash
docker compose down -v
docker compose up -d postgres
alembic upgrade head
python -m backend.app.scripts.seed_auth
```

Rerun migrations or seed accounts without a reset:

```bash
alembic upgrade head
python -m backend.app.scripts.seed_auth
```

Check the working tree:

```bash
git status --short
```

Ignored local/generated paths include `.env`, `.venv/`, `node_modules/`, `dist/`, `var/storage/original/` and `var/storage/processed/`.
