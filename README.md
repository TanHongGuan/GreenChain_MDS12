# GreenChain MDS12

GreenChain is a building sustainability data platform. Its broader aim is to support company data submission, validation and integrity checks, auditor review, visibility of approved sustainability records, and preparation of evidence for green-building certification.

This repository has a FastAPI/PostgreSQL backend and a React/Vite frontend. The current frontend also has a **mock mode** for company building management, consultant review and unofficial certification preparation; those features are not yet integrated with the real backend. See [Current Implementation Status](#current-implementation-status) before using the site as more than a local demonstration.

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

### 8. Initialise local storage

With the Python virtual environment active:

```bash
python -m backend.app.scripts.setup_storage
```

This prepares and checks `var/storage/original/` and `var/storage/processed/`. It is local filesystem storage, **not** production S3 or WORM storage.

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

The current **mock mode** (`VITE_DATA_MODE=mock`) adds deterministic demo personas, organisation-owned My Buildings, building selection at upload, GBI NREB/GreenRE ENRB representative preparation checklists, consultant assignment/review and an unofficial HTML preparation package. Mock records live in browser session storage and never write to the real backend. To use it, set `VITE_DATA_MODE=mock` in `.env`, restart Vite and sign in with a listed persona such as `uploader@demo.greenchain.test`, `auditor@demo.greenchain.test` or `viewer@demo.greenchain.test`; any nonempty demo password works. The frontend also seeds `future-uploader@demo.greenchain.test` and `second-auditor@demo.greenchain.test`. Mock role checks are UX simulation, not backend security.

**Not integrated:** real-mode company building management, certification preparation, consultant assignment/review and package export. Real-mode service wrappers for those mock-only operations return 501. Production S3 Object Lock/WORM storage, official certification scoring/eligibility/issuance, registration, OAuth and MFA are not implemented here. The illustrative checklists are not official certification assessments. See `docs/BATCH_06_INTEGRATION_HANDOVER.md` and `BATCH_06_IMPLEMENTATION_REPORT.md` for current gaps and QA status; Batch 6 is partially complete.

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
| `VIEWER` | Home, Highlighted, Projects, Compare | `/upload`, `/review`, `/my-buildings/*`, `/preparation-reviews/*` |
| `UPLOADER` | Home, Highlighted, Projects, Compare, Upload Data; My Buildings in mock mode | `/review`, `/preparation-reviews/*` |
| `AUDITOR` | Home, Highlighted, Projects, Compare, Review; Preparation Reviews in mock mode | `/upload`, `/my-buildings/*` |

In real mode, the backend authenticates with an HttpOnly cookie and enforces its existing API permissions. Refresh after login should retain the authenticated user; logout returns to `/login`; protected routes redirect to `/login` when signed out; wrong-role routes show Access Denied. Mock persona selection and frontend route guards do not replace backend authorisation.

## API Contract

Authentication uses an HttpOnly cookie named `greenchain_access_token`. Frontend JavaScript does not read or store the JWT. These are the existing backend endpoints, not proposed certification APIs.

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

The implemented storage service can write original and processed files to the local filesystem. Its main pieces are:

- `backend/app/storage/base.py`: `StorageService` protocol.
- `backend/app/storage/local.py`: local storage implementation.
- `backend/app/storage/dependencies.py`: `get_storage_service()`.
- `backend/app/storage/models.py`: `StoredFile`, accepted extensions/content types.
- `backend/app/integrity/hashing.py`: SHA-256 helper.
- `backend/app/scripts/setup_storage.py`: local storage initialization and writability check.

The existing dependency pattern is:

```python
storage = Depends(get_storage_service)
stored_file = storage.store_original(upload.file, upload.filename, upload.content_type)
```

`StoredFile` contains `storage_key`, `original_filename`, `size_bytes`, `content_type` and `storage_backend`. Runtime contents under `var/storage/original/` and `var/storage/processed/` are ignored by Git; only `var/storage/.gitkeep` is tracked. SHA-256/evidence metadata does **not** by itself establish immutable or WORM storage. S3/Object Lock integration is future work.

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
