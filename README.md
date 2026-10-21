# GreenChain MDS12

GreenChain is a sustainability evidence management and transparency platform. Organisations can submit building sustainability data, preserve evidence integrity, maintain traceable audit records, and share reviewed electricity, water and CO2 emissions information.

This repository has a FastAPI/PostgreSQL backend and a React/Vite frontend. The frontend always uses the real backend; there is no browser-side mock data. See [Current Implementation Status](#current-implementation-status) before using the site as more than a local demonstration.

## Quick Start: Run GreenChain Locally

Two processes have to be running at the end of this: the **backend** on port 8000 and the
**frontend** on port 5173. Part A sets up the backend, Part B the frontend, Part C walks the app.
Do them in order — the frontend is useless without the backend, and the backend needs its database
before it starts.

Every command runs from the repository root. Each step ends with a check; if the check fails, stop
there rather than continuing.

If you would rather one machine ran everything in Docker for the whole team, skip to
[Shared team demo](#shared-team-demo-one-host-everyone-else-uses-a-browser).

---

### Step 0 — Prerequisites

| Tool | Version | Check |
|---|---|---|
| Git | any recent | `git --version` |
| Python | 3.12+ | `python --version` |
| Node.js | 20.19+ or 22.12+ | `node --version` |
| npm | ships with Node | `npm --version` |
| Docker Desktop | any recent, **running** | `docker ps` |

On systems where Python 3 is `python3`, use that everywhere below. Start Docker Desktop now —
`docker ps` must return without error before Step A3.

### Step 0b — Get the code

```bash
git clone https://github.com/TanHongGuan/GreenChain_MDS12.git
cd GreenChain_MDS12
```

Already cloned: `git switch main && git pull --ff-only origin main`.

Clone into a normal folder such as `~/Projects`, **not** an iCloud-synced folder (`~/Documents` or
`~/Desktop` with iCloud Drive). iCloud offloads files, including Git's own, and Git commands hang.

---

## Part A — Backend

### A1. Create `.env`

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Then open `.env` and set these five values. The rest of the file can stay as shipped.

```env
FRONTEND_ORIGIN=http://127.0.0.1:5173
VITE_API_BASE_URL=http://127.0.0.1:8000
ACCOUNT_SELECT_LOGIN=true
DEV_SEED_PASSWORD=change-this-local-password
GEMINI_API_KEY=
```

- **Use `127.0.0.1` in both URLs, not `localhost`.** They must match exactly or the browser will
  send credentialed requests the backend's CORS rejects.
- `ACCOUNT_SELECT_LOGIN=true` turns the login page into an account picker with no password. Local
  demo only — anyone who can reach the API can select any listed account. The backend refuses to
  start with this enabled in production.
- `GEMINI_API_KEY` is only needed to upload a spreadsheet whose layout GreenChain does not already
  recognise; see [Gemini ETL setup](docs/ETL_GEMINI_INTEGRATION.md). Leave it blank for now.
  **Never** put it in a `VITE_` variable — those are compiled into the browser bundle.
- Keep `POSTGRES_DB`, `POSTGRES_USER` and `POSTGRES_PASSWORD` consistent with `DATABASE_URL`.

`.env` is Git-ignored. Never commit it.

**Check:** `.env` exists in the repository root.

### A2. Create the virtual environment and install Python dependencies

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

**Keep this terminal and its activated environment for A3–A6.** Every new terminal needs the
activation line again.

**Check:** `python -c "import fastapi, alembic, sqlalchemy; print('ok')"` prints `ok`.

### A3. Start PostgreSQL

```bash
docker compose up -d postgres
docker compose ps
```

**Check:** the `postgres` service shows as `running` (or `healthy`).

If port 5432 is already taken, set `POSTGRES_PORT=5433` in `.env` *and* change the port inside
`DATABASE_URL` to `5433`, then run the two commands again. Do **not** use `docker compose down -v`
to resolve a port conflict — it deletes the database volume.

### A4. Create the database tables

```bash
alembic upgrade head
```

**Check:** `alembic current` prints a revision id and the word `(head)`.

### A5. Create the login accounts

```bash
python -m backend.app.scripts.seed_auth
```

It prints what it did, one line per account. Expect four accounts:

| Email | Role shown in the UI | Organisation |
|---|---|---|
| `sonwoy@greenchain.test` | COMPANY | Sonwoy |
| `monosh@greenchain.test` | COMPANY | Monosh |
| `aisyah@greenchain.test` | AUDITOR (Aisyah Rahman) | — |
| `daniel@greenchain.test` | AUDITOR (Daniel Chong) | — |
| `priya@greenchain.test` | AUDITOR (Priya Nair) | — |
| `viewer@greenchain.test` | VIEWER | — |

All six use whatever `DEV_SEED_PASSWORD` is currently set to — there is no universal password.
Re-running the script is safe: it does not duplicate users, but it **does reset their passwords**
to the current setting.

The two company accounts belong to different organisations on purpose. Each can only create
buildings and upload for its own, which is how tenant isolation is demonstrated rather than
asserted. The role is stored as `UPLOADER`; `COMPANY` is only what the interface calls it.

Auditors belong to no organisation — they review across all of them. A company appoints one per
building under **Manage Buildings**, and only that auditor may review that building's submissions.
There are three so the appointment is a real choice.

**Check:** the output ends with `Seeded development auth accounts.`

### A6. Prepare evidence storage

```bash
python -m backend.app.scripts.setup_storage
```

With the default `STORAGE_BACKEND=local` this creates and checks `var/storage/original/` and
`var/storage/processed/`. That is plain disk storage with no tamper protection, which is fine
locally. For the S3 Object Lock backend see [Optional extras](#optional-extras) below.

**Check:** `var/storage/original` and `var/storage/processed` exist.

### A7. Run the backend

Leave this terminal running for as long as you are using GreenChain.

```bash
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

**Check:** in a second terminal, `curl http://127.0.0.1:8000/health` returns a JSON body.
`http://127.0.0.1:8000` is the API, not the website.

---

## Part B — Frontend

Open a **new terminal** in the repository root. It does not need the Python environment.

### B1. Install frontend dependencies

```bash
npm ci
```

`npm ci` installs exactly the locked set from `package-lock.json`. Use it rather than
`npm install`.

**Check:** a `node_modules/` folder exists.

### B2. Run the frontend

Leave this terminal running too.

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

**Check:** Vite prints `Local: http://127.0.0.1:5173/`.

If Vite reports 5173 is occupied it will choose another port. Either free 5173, or use the port it
printed and change `FRONTEND_ORIGIN` in `.env` to match — then restart the backend, since it reads
`.env` only at startup.

Changing any `VITE_` value also requires restarting this frontend server.

### B3. Open the site

```text
http://127.0.0.1:5173
```

**Check:** the GreenChain sign-in page loads, showing an account dropdown.

A blank page or network errors in the browser console almost always mean the backend is not
running, or `FRONTEND_ORIGIN` and `VITE_API_BASE_URL` do not match the addresses actually in use.

---

## Part C — First run through the app

With both servers running:

1. **Sign in** as `sonwoy@greenchain.test` from the dropdown (no password with
   `ACCOUNT_SELECT_LOGIN=true`).
2. **Manage Buildings → Add a building.** Give it a name and address. Buildings are created here,
   not on the upload page.
3. **Upload Data.** Pick that building, choose the reporting year and quarter, and select a
   spreadsheet. Ready-made files are in [`test_datasets/sonwoy/`](test_datasets/sonwoy) — start
   with `SONWOY_TOWER_2026_Q1.xlsx`, and read that folder's `README.md` first, because its water
   meter is cumulative and needs an opening reading.
4. **Check what we found in your file.** For an unfamiliar layout, Gemini proposes which column is
   which; anything it could not settle is flagged and opened for you. Correct anything wrong, tick
   the confirmation and continue. *(This step needs `GEMINI_API_KEY`. A spreadsheet already in a
   recognised format skips it entirely.)*
5. **Back in Manage Buildings, appoint an auditor** for that building — pick one of the three from
   the **Auditor** dropdown. Until you do, the submission reaches nobody's queue and cannot be
   approved.
6. **Sign out, sign in as that auditor, open Assigned Projects** and approve the submission.
   Nothing appears in charts, Projects or Compare until an auditor approves it.
7. **Sign in as `monosh@greenchain.test`** and repeat with
   [`test_datasets/monosh/`](test_datasets/monosh) to see two organisations side by side.

---

## Optional extras

**Demonstration benchmarks.** Not for real datasets:

```bash
python -m backend.app.scripts.seed_benchmarks
```

These are **placeholder figures** attributed to `GreenChain Demo Benchmark Set demo-2026.1`, not to
any real standards body. The provider and version are shown beside every comparison. Replace them
with licensed data and bump `SOURCE_VERSION` before showing a comparison outside the project team.

Benchmarks match on a project's country and property type, which uploads do not collect, so set
them explicitly for any project you want benchmarked:

```bash
python -m backend.app.scripts.set_project_scope "Your Building Name" Malaysia Office
```

A project without a scope reports `PROJECT_SCOPE_UNKNOWN` rather than being compared against a
guess.

**S3 Object Lock evidence storage.** Instead of local disk, in `.env`:

```env
STORAGE_BACKEND=s3
S3_BUCKET=greenchain-evidence-test
AWS_REGION=ap-southeast-1
AWS_PROFILE=greenchain-dev
```

Then re-run `python -m backend.app.scripts.setup_storage`, which verifies the bucket has versioning
and Object Lock enabled. Every upload is stored as a locked S3 version. Credentials stay in
`~/.aws`; never put access keys in `.env`. Setup, IAM policy and verification:
[`docs/STORAGE_S3_OBJECT_LOCK.md`](docs/STORAGE_S3_OBJECT_LOCK.md).

**Password login instead of the account picker.** Set `ACCOUNT_SELECT_LOGIN=false` and restart the
backend. Sign in with an email from the table in A5 and the value of `DEV_SEED_PASSWORD`.

---

## Shared team demo: one host, everyone else uses a browser

One machine runs PostgreSQL, the API and the website in Docker; teammates on the same network open the host's address. Every upload from any laptop goes to the host's API, which stores it in the S3 Object Lock bucket. Only the host needs AWS credentials; teammates need nothing installed.

On the host (Docker Desktop running, AWS profile configured):

```bash
cp deploy/demo.env.example deploy/.env.demo   # fill in secrets, FRONTEND_ORIGIN=http://<host Wi-Fi IP>:8080, AWS_CONFIG_DIR
./deploy/demo_up.sh                           # build, start, migrate, seed accounts, verify bucket, print URL
./deploy/demo_up.sh down                      # stop (database and S3 evidence are kept)
```

Teammates open `http://<host Wi-Fi IP>:8080`, pick an account from the dropdown and press **Log In**. The host must stay awake on the same network; campus Wi-Fi may block laptop-to-laptop traffic (use a phone hotspot if so). Login is passwordless on this stack, so only run it on a trusted network. Full details: `docs/SHARED_DEMO_BACKEND.md`.

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
| Frontend cannot reach backend / cookie login fails | Check both servers, `VITE_API_BASE_URL`, `FRONTEND_ORIGIN` and exact hostname/port match; restart after `.env` changes. |
| "Authentication is required" right after logging in | The page and API are on different hosts (e.g. page on `127.0.0.1`, API on `localhost`), so the browser drops the cookie. Use the same hostname in both URLs. On the shared demo, rerun `./deploy/demo_up.sh` and refresh. |
| Login shows a password form, not a dropdown | `ACCOUNT_SELECT_LOGIN` is not `true` in the backend's environment; set it and restart the backend. |
| Git commands hang | The clone is in an iCloud-synced folder; clone again into `~/Projects`. |
| `evidence_storage: unavailable` in `/health/ready` | S3 bucket unreachable or misconfigured; check `AWS_PROFILE`, `S3_BUCKET`, `AWS_REGION` and run `python -m backend.app.scripts.setup_storage`. |
| "The AI did not answer within N seconds" on upload | The model was slow, not broken. Retry; if it persists, set a faster `GEMINI_MODEL` in `.env` and restart the backend. The backend log records the underlying error. |
| "AI mapping is not configured correctly on the backend" | `GEMINI_API_KEY` is missing or rejected. Only spreadsheets in an unrecognised layout need it. |
| Upload is refused listing several row problems | Working as intended: every bad row is reported at once, each naming its worksheet, row, date and column. Correct them all and upload again. |
| Nothing appears in Projects, Compare or the charts after uploading | The submission is still `UNREVIEWED`. Sign in as the building's appointed auditor and approve it; those views show approved data only. |
| An auditor's Assigned Projects page is empty | No company has appointed them to a building yet. The owner appoints one under **Manage Buildings**; an unappointed building reaches nobody's queue. |
| Upload page shows "You have no buildings yet" | Buildings are created under **Manage Buildings**, not on the upload page. |

## Current Implementation Status

The original Sprint 1 foundation provided FastAPI authentication/RBAC, PostgreSQL user/organisation persistence, React/Vite login and a local-storage abstraction. The checked-out backend now also has project discovery/catalogue, submissions, sustainability metrics, evidence metadata, highlights and auditor approve/reject endpoints. The frontend supports public project detail, approved-data charts and comparison, upload and review workflows. This is broader than the old Sprint 1-only README description.

The former frontend **mock mode** (fictional demo personas, buildings and submissions held in browser session storage) was removed on 2026-10-19; every page now reads and writes real backend data.

Sprint 7 home discovery shows Recently Updated, Featured and New Projects sections, each linking into Projects with a preset the catalogue accepts. Sprint 8 adds benchmark comparison and reporting consistency to Project Detail. Benchmarks only appear once benchmark data is loaded; `seed_benchmarks` inserts placeholder values and is not run on the shared demo stack.

**Evidence storage:** `STORAGE_BACKEND=s3` stores evidence in a versioned S3 bucket with Object Lock (GOVERNANCE) retention, pins each submission to exact S3 version IDs and verifies files against an S3-recorded SHA-256. It was verified against a real AWS test bucket on 2026-10-19 (see `docs/STORAGE_S3_OBJECT_LOCK.md`). Local storage remains the development default.

**Not integrated:** company building management (create/edit owned buildings); uploads name the building and organisation directly. Registration, OAuth and MFA are not implemented here. Certification preparation was removed from the active product scope. Historical Batch 3-6 documents describe discontinued mock experiments and are not current integration requirements; see `docs/CERTIFICATION_PREPARATION_REMOVAL.md`.

## Testing and Verification

These checks verify an installation; they are **not** prerequisites to opening the browser. Run from the repository root, with the Python virtual environment active for backend tests:

```bash
pytest
npm test -- --run
npm run build
git diff --check
```

The last three commands check frontend tests, its production build and whitespace in tracked changes. Frontend tests use stubbed HTTP responses; they do not prove real backend integration.

## Authentication and Role Behaviour

| Role | Core navigation | Restricted routes |
|---|---|---|
| `VIEWER` | Home, Highlighted, Projects, Compare | `/upload`, `/review` |
| `UPLOADER` | Home, Highlighted, Projects, Compare, Upload Data | `/review` |
| `AUDITOR` | Home, Highlighted, Projects, Compare, Review | `/upload` |

The backend authenticates with an HttpOnly cookie and enforces its existing API permissions. With `ACCOUNT_SELECT_LOGIN=true` (demo only; refused when `ENVIRONMENT=production`) the login page shows a dropdown of active accounts and signs in without a password; otherwise it shows email and password. Refresh after login should retain the authenticated user; logout returns to `/login`; protected routes redirect to `/login` when signed out; wrong-role routes show Access Denied. Frontend route guards do not replace backend authorisation.

## API Contract

Authentication uses an HttpOnly cookie named `greenchain_access_token`. Frontend JavaScript does not read or store the JWT. These are the existing backend endpoints.

### `POST /auth/login`

Request (the password is illustrative; use your configured `DEV_SEED_PASSWORD`):

```json
{
  "email": "sonwoy@greenchain.test",
  "password": "change-this-local-password"
}
```

Success:

```json
{
  "user": {
    "id": "...",
    "name": "GreenChain Uploader",
    "email": "sonwoy@greenchain.test",
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

### Shared demo stack with S3 Object Lock evidence

To let teammates upload from their own laptops into the S3 Object Lock bucket, run one shared stack on a host machine: `./deploy/demo_up.sh` (overlays `docker-compose.s3.yml` and `docker-compose.lan.yml` on the production file; nginx serves the API same-origin under `/api`). Setup, limits and verification: `docs/SHARED_DEMO_BACKEND.md`.

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
