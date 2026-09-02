# GreenChain_MDS12

## Sprint 1 Backend Authentication

This repository currently contains Sprint 1 authentication work:

- Member 2: FastAPI authentication and reusable role-based access control.
- Member 3: PostgreSQL persistence for authentication users and organisations.

### Local Setup

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Windows activation:

```powershell
.venv\Scripts\activate
python -m pip install -r requirements.txt
```

Start the backend:

```bash
uvicorn backend.app.main:app --reload
```

Run tests:

```bash
pytest
```

### PostgreSQL Setup

Start local PostgreSQL with Docker Compose:

```bash
docker compose up -d postgres
```

Configure `.env` from `.env.example`, then run migrations:

```bash
alembic upgrade head
```

Seed Sprint 1 development auth users:

```bash
python -m backend.app.scripts.seed_auth
```

Migration downgrade/upgrade check:

```bash
alembic downgrade -1
alembic upgrade head
```

### Environment

Copy `.env.example` to `.env` for local development. Never commit `.env`.

Required/configurable values:

- `JWT_SECRET`: signing secret. Replace the example value outside local development.
- `JWT_ALGORITHM`: defaults to `HS256`.
- `JWT_EXPIRE_MINUTES`: access token lifetime.
- `COOKIE_SECURE`: set `true` in HTTPS production environments.
- `FRONTEND_ORIGIN`: allowed frontend origin, for example `http://localhost:5173`. Comma-separated origins are supported.
- `DATABASE_URL`: SQLAlchemy database URL, for example `postgresql+psycopg://greenchain:change-this-local-password@localhost:5432/greenchain`.
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`: used by Docker Compose for local PostgreSQL.
- `DEV_SEED_PASSWORD`: required by the development seed script. The value is hashed before storage.

### API Contract

`POST /auth/login`

Request:

```json
{
  "email": "uploader@greenchain.test",
  "password": "password"
}
```

Success returns HTTP 200 and sets the HttpOnly `greenchain_access_token` cookie:

```json
{
  "user": {
    "id": "dev-uploader",
    "name": "GreenChain Uploader",
    "email": "uploader@greenchain.test",
    "role": "UPLOADER",
    "organisation_id": "greenchain-demo"
  }
}
```

Invalid credentials return HTTP 401:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect."
  }
}
```

`GET /auth/me`

Returns HTTP 200 with the same `user` object when the auth cookie is valid. Returns HTTP 401 for missing, malformed, expired, or unknown-user tokens.

`POST /auth/logout`

Returns HTTP 204 and clears the `greenchain_access_token` cookie.

### Roles And RBAC

The only valid roles are:

- `VIEWER`
- `UPLOADER`
- `AUDITOR`

Use `require_roles(...)` from `backend.app.auth.dependencies` for future protected endpoints. Missing or invalid authentication returns 401. A valid user with the wrong role returns 403.

MVP permissions:

| Action | VIEWER | UPLOADER | AUDITOR |
| --- | --- | --- | --- |
| View projects | Yes | Yes | Yes |
| Highlight projects | Yes | Yes | Yes |
| Upload data | No | Yes | No |
| Review submissions | No | No | Yes |

Upload and review endpoints are intentionally not implemented in Sprint 1.

### Temporary Development Users

Run `python -m backend.app.scripts.seed_auth` after migrations to create:

- `viewer@greenchain.test`
- `uploader@greenchain.test`
- `auditor@greenchain.test`

Their password is the value of `DEV_SEED_PASSWORD`. Only Argon2 password hashes are stored in PostgreSQL. Running the seed command repeatedly is safe and will not duplicate users or organisations.

### Member 3 Database Integration

Authentication uses `SQLAlchemyUserRepository` in `backend.app.repositories.users`, backed by the Sprint 1 tables:

- `users`
- `organisations`
- `organisation_members`

The repository provides:

- `get_user_by_email(email)`
- `get_user_by_id(user_id)`

Future database work should add Alembic migrations under `backend/app/migrations/versions`. Do not edit existing migrations after they have been shared unless the team deliberately resets local databases.

Foreign keys from `organisation_members` use `ON DELETE RESTRICT`, so users and organisations cannot be silently removed while memberships reference them.

### Member 1 Frontend Integration

The React/Vite frontend implements Sprint 1 authentication only:

- `/login`
- protected app routes
- role-restricted `/upload` and `/review` placeholders
- shared role-aware navbar
- logout through `POST /auth/logout`

Start the frontend:

```bash
npm install
npm run dev
```

Build the frontend:

```bash
npm run build
```

Run frontend tests:

```bash
npm test
```

Because JWTs are stored in an HttpOnly cookie, the React frontend does not decode tokens. It uses `/auth/me` as the source of truth on app startup and refresh.

Fetch example:

```ts
fetch("http://localhost:8000/auth/me", {
  credentials: "include",
});
```

Axios example:

```ts
axios.get("http://localhost:8000/auth/me", {
  withCredentials: true,
});
```

Role-aware frontend behavior:

- `VIEWER`: Home, Highlighted, Projects.
- `UPLOADER`: Home, Highlighted, Projects, Upload Data.
- `AUDITOR`: Home, Highlighted, Projects, Review.

Wrong-role access shows Access Denied. Unauthenticated protected access redirects to `/login`.
