# GreenChain_MDS12

## Sprint 1 Backend Authentication

This repository currently contains a minimal FastAPI backend for Sprint 1 Member 2: authentication and reusable role-based access control only.

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

### Environment

Copy `.env.example` to `.env` for local development. Never commit `.env`.

Required/configurable values:

- `JWT_SECRET`: signing secret. Replace the example value outside local development.
- `JWT_ALGORITHM`: defaults to `HS256`.
- `JWT_EXPIRE_MINUTES`: access token lifetime.
- `COOKIE_SECURE`: set `true` in HTTPS production environments.
- `FRONTEND_ORIGIN`: allowed frontend origin, for example `http://localhost:5173`. Comma-separated origins are supported.
- `ENABLE_DEV_USERS`: enables temporary in-memory users for development/testing.
- `DEV_USER_PASSWORD`: shared password for temporary development users.

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

Until Member 3 connects PostgreSQL, `backend.app.repositories.users.InMemoryUserRepository` provides development/test-only users when `ENABLE_DEV_USERS=true`:

- `viewer@greenchain.test`
- `uploader@greenchain.test`
- `auditor@greenchain.test`

Their passwords are hashed with Argon2 before verification. The default local password is controlled by `DEV_USER_PASSWORD`.

### Member 3 Database Integration

Replace `get_user_repository()` in `backend.app.repositories.users` with a PostgreSQL-backed implementation that provides:

- `get_user_by_email(email)`
- `get_user_by_id(user_id)`

The auth router and service depend only on the repository boundary and should not need to change when persistent users are added.

### Member 1 Frontend Integration

Because JWTs are stored in an HttpOnly cookie, the React frontend should not decode tokens. Use `/auth/me` as the source of truth on app startup and refresh.

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
