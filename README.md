# GreenChain MDS12

GreenChain Sprint 1 implements authentication and role access for the MVP.

Current Sprint 1 scope:

- FastAPI backend authentication and RBAC
- PostgreSQL authentication persistence
- React/Vite frontend authentication flow
- Local storage/environment foundation for Sprint 2 upload and ETL readiness

Not included yet: upload processing, project catalogue APIs, auditor review workflow, ETL, metrics, investor dashboards, production S3/WORM storage, registration, OAuth, or MFA.

## Prerequisites

Install these before setup:

- Git
- Python 3.12 or newer
- Node.js 20 or newer
- npm
- Docker Desktop

Docker Desktop must be running before starting PostgreSQL.

## Clone The Repository

```bash
git clone https://github.com/35100621/GreenChain_MDS12.git
cd GreenChain_MDS12
git switch codex/sprint-1-integration
```

## Backend Setup

macOS/Linux:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
```

## Frontend Setup

```bash
npm install
```

## Environment Setup

Create a local `.env` file from the example.

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

For local development, make sure `.env` contains:

```env
ENVIRONMENT=development

JWT_SECRET=change-me-in-real-environments-local-only
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60
COOKIE_SECURE=false

FRONTEND_ORIGIN=http://127.0.0.1:5173
VITE_API_BASE_URL=http://127.0.0.1:8000

POSTGRES_DB=greenchain
POSTGRES_USER=greenchain
POSTGRES_PASSWORD=change-this-local-password
POSTGRES_PORT=5432
DATABASE_URL=postgresql+psycopg://greenchain:change-this-local-password@localhost:${POSTGRES_PORT}/greenchain

DEV_SEED_PASSWORD=change-this-local-password

STORAGE_BACKEND=local
LOCAL_STORAGE_ROOT=./var/storage
MAX_UPLOAD_SIZE_MB=25
```

Never commit `.env`. It is ignored by git.

## Database Setup

Start PostgreSQL:

```bash
docker compose up -d postgres
```

If port `5432` is already used by another local PostgreSQL install, set `POSTGRES_PORT=5433` in `.env` and update `DATABASE_URL` to:

```env
DATABASE_URL=postgresql+psycopg://greenchain:change-this-local-password@localhost:5433/greenchain
```

Run migrations:

```bash
alembic upgrade head
```

Seed Sprint 1 development users:

```bash
python -m backend.app.scripts.seed_auth
```

The seed command is idempotent. Running it multiple times will not create duplicate users.

## Storage Setup

Initialise local storage directories:

```bash
python -m backend.app.scripts.setup_storage
```

This creates:

```text
var/storage/
  original/
  processed/
```

Runtime storage contents are ignored by git. Only `var/storage/.gitkeep` is tracked.

## Run The Tests

Backend tests:

```bash
pytest
```

Frontend tests:

```bash
npm test
```

Frontend production build:

```bash
npm run build
```

## Start The Application

Start the backend in terminal 1.

macOS/Linux:

```bash
source .venv/bin/activate
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Windows PowerShell:

```powershell
.venv\Scripts\activate
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend in terminal 2:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173
```

## Development Login Accounts

Use the password from `DEV_SEED_PASSWORD`.

Default local password when using `.env.example` unchanged:

```text
123
```

Accounts:

```text
viewer@greenchain.test
uploader@greenchain.test
auditor@greenchain.test
```

Expected role behavior:

| Role | Navigation | Denied Routes |
| --- | --- | --- |
| `VIEWER` | Home, Highlighted, Projects | `/upload`, `/review` |
| `UPLOADER` | Home, Highlighted, Projects, Upload Data | `/review` |
| `AUDITOR` | Home, Highlighted, Projects, Review | `/upload` |

Also check:

- Refresh after login keeps the user authenticated.
- Logout returns to `/login`.
- Protected routes redirect to `/login` after logout.
- Wrong-role routes show Access Denied.

## API Contract

Authentication uses an HttpOnly cookie named `greenchain_access_token`. Frontend JavaScript does not read or store the JWT.

### `POST /auth/login`

Request:

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

Missing, malformed, expired, or invalid tokens return `401`.

### `POST /auth/logout`

Returns `204 No Content` and clears the auth cookie.

## Frontend API Usage

All auth requests must include credentials.

Fetch:

```ts
fetch("http://127.0.0.1:8000/auth/me", {
  credentials: "include",
});
```

Axios:

```ts
axios.get("http://127.0.0.1:8000/auth/me", {
  withCredentials: true,
});
```

## Backend Architecture

Authentication flow:

```text
Auth Router
  -> Auth Service
  -> UserRepository
  -> SQLAlchemy
  -> PostgreSQL
```

Main backend pieces:

- `backend/app/main.py`: FastAPI app and CORS setup
- `backend/app/api/auth.py`: `/auth/login`, `/auth/me`, `/auth/logout`
- `backend/app/auth/security.py`: password hashing and JWT helpers
- `backend/app/auth/dependencies.py`: `get_current_user()` and `require_roles(...)`
- `backend/app/repositories/users.py`: SQLAlchemy user repository
- `backend/app/models/`: Sprint 1 SQLAlchemy models
- `backend/app/migrations/`: Alembic migrations
- `backend/app/scripts/seed_auth.py`: development auth seed data

Database tables in Sprint 1:

- `users`
- `organisations`
- `organisation_members`

Valid roles are exactly:

- `VIEWER`
- `UPLOADER`
- `AUDITOR`

## Storage Architecture

Sprint 1 storage is a foundation only. It prepares the interface Sprint 2 will use for upload and ETL work.

Main storage pieces:

- `backend/app/storage/base.py`: `StorageService` protocol
- `backend/app/storage/local.py`: local filesystem storage implementation
- `backend/app/storage/dependencies.py`: `get_storage_service()`
- `backend/app/storage/models.py`: `StoredFile`, accepted extensions, accepted content types
- `backend/app/integrity/hashing.py`: standalone SHA-256 helper
- `backend/app/scripts/setup_storage.py`: local storage setup check

Future Sprint 2 upload flow should use:

```python
storage = Depends(get_storage_service)
stored_file = storage.store_original(upload.file, upload.filename, upload.content_type)
```

The `StoredFile` contract contains:

- `storage_key`
- `original_filename`
- `size_bytes`
- `content_type`
- `storage_backend`

## Useful Commands

Stop PostgreSQL:

```bash
docker compose down
```

Reset local PostgreSQL data:

```bash
docker compose down -v
docker compose up -d postgres
alembic upgrade head
python -m backend.app.scripts.seed_auth
```

Check git hygiene:

```bash
git status --short
```

Ignored local/generated paths include:

- `.env`
- `.venv/`
- `node_modules/`
- `dist/`
- `var/storage/original/`
- `var/storage/processed/`
