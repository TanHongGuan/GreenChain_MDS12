"""Sprint 9 security regression: every route, not just the ones we remembered.

The point of enumerating the router rather than listing endpoints by hand is
that a new endpoint is covered the moment it is added. A hand-written list only
ever tests what someone thought to add, which is exactly how an unprotected
route reaches production.

If a new public route is genuinely intended, add it to PUBLIC_ROUTES with a
reason. Failing here is the system working.
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.main import create_app
from backend.app.repositories.users import get_user_repository
from backend.app.storage.dependencies import get_storage_service
from backend.app.storage.local import LocalStorageService
from backend.app.tests.db_fixtures import build_session_factory, install_repository_override, seed_test_auth_users

# Routes that are intentionally reachable without a session, and why.
PUBLIC_ROUTES = {
    ("POST", "/auth/login"): "Credentials are exchanged here; requiring a session would be circular.",
    ("GET", "/health"): "Liveness probe. A load balancer cannot authenticate.",
    ("GET", "/health/ready"): "Readiness probe. Reports dependency status only, no user data.",
    # Reviewed 2026-10-19: logout only calls response.delete_cookie. It reads no
    # data, touches no database row and changes nothing but the caller's own
    # cookie, so an anonymous call is a no-op. Keeping it idempotent avoids a
    # client being stuck unable to clear a stale or already-expired session.
    ("POST", "/auth/logout"): "Idempotent cookie clear; no data access and no server-side state.",
}

# FastAPI's own documentation routes, which carry no data of their own.
DOC_PATHS = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}

# Placeholder values for path parameters. The auth dependency runs before the
# handler, so a non-existent id must still produce 401 rather than 404.
PATH_PARAM_VALUES = {
    "project_id": "1",
    "submission_id": "1",
    "metric_name": "Electricity",
    "artifact_type": "original",
    "kind": "original",
}


@pytest.fixture(autouse=True)
def clear_dependency_caches() -> None:
    get_settings.cache_clear()
    get_storage_service.cache_clear()


@pytest.fixture
def session_factory(tmp_path):
    factory = build_session_factory(tmp_path / "security-tests.sqlite3")
    with factory() as db:
        seed_test_auth_users(db)
    return factory


@pytest.fixture
def app(session_factory, tmp_path):
    test_app = create_app()
    install_repository_override(test_app, get_user_repository, session_factory)
    test_app.dependency_overrides[get_storage_service] = lambda: LocalStorageService(tmp_path / "storage")

    def db_override():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    test_app.dependency_overrides[get_db] = db_override
    return test_app


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app)


def login(client: TestClient, email: str) -> None:
    response = client.post("/auth/login", json={"email": email, "password": "password"})
    assert response.status_code == 200, response.text


def concrete_path(path: str) -> str:
    resolved = path
    for name, value in PATH_PARAM_VALUES.items():
        resolved = resolved.replace(f"{{{name}}}", value).replace(f"{{{name}:path}}", value)
    return resolved


def protected_routes(app) -> list[tuple[str, str]]:
    """Every documented operation that is not on the public allowlist.

    Read from the generated OpenAPI schema rather than app.routes: this FastAPI
    version nests included routers instead of flattening them, so walking
    app.routes silently finds nothing and the sweep passes without testing
    anything (test_route_inventory_is_not_empty guards that).
    """
    found: list[tuple[str, str]] = []
    for path, operations in app.openapi()["paths"].items():
        if path in DOC_PATHS:
            continue
        for method in operations:
            verb = method.upper()
            if verb in {"HEAD", "OPTIONS", "PARAMETERS"}:
                continue
            if (verb, path) in PUBLIC_ROUTES:
                continue
            found.append((verb, path))
    return sorted(found)


def test_route_inventory_is_not_empty(app) -> None:
    # Guards against the sweep silently passing because it found nothing.
    assert len(protected_routes(app)) >= 15


def test_every_non_public_route_rejects_anonymous_access(app, client) -> None:
    offenders = []
    for method, path in protected_routes(app):
        response = client.request(method, concrete_path(path))
        # 401 is the expected answer. 422 is accepted only when the body is
        # rejected before the session is checked, which still denies access.
        if response.status_code not in (401, 422):
            offenders.append(f"{method} {path} -> {response.status_code}")

    assert not offenders, (
        "These routes answered an unauthenticated caller without demanding a session:\n  "
        + "\n  ".join(offenders)
        + "\nAdd an auth dependency, or justify it in PUBLIC_ROUTES."
    )


def test_public_routes_are_reachable_without_a_session(client) -> None:
    assert client.get("/health").status_code == 200
    assert client.get("/health/ready").status_code == 200
    # Login is public but still rejects bad credentials.
    assert client.post("/auth/login", json={"email": "nobody@greenchain.test", "password": "x"}).status_code == 401


# --- role boundaries -------------------------------------------------------------------

UPLOADER_ONLY = [("POST", "/submissions")]
AUDITOR_ONLY = [
    ("GET", "/reviews/submissions/pending"),
    ("GET", "/reviews/submissions/1"),
    ("POST", "/reviews/submissions/1/decision"),
    ("GET", "/reviews/submissions/1/evidence/original"),
]


@pytest.mark.parametrize("email", ["viewer@greenchain.test", "auditor@greenchain.test"])
@pytest.mark.parametrize("method,path", UPLOADER_ONLY)
def test_upload_routes_reject_non_uploaders(client, email, method, path) -> None:
    login(client, email)
    assert client.request(method, path).status_code == 403


@pytest.mark.parametrize("email", ["viewer@greenchain.test", "uploader@greenchain.test"])
@pytest.mark.parametrize("method,path", AUDITOR_ONLY)
def test_review_routes_reject_non_auditors(client, email, method, path) -> None:
    login(client, email)
    assert client.request(method, path).status_code == 403


def test_logout_revokes_access_to_a_protected_route(client) -> None:
    login(client, "viewer@greenchain.test")
    assert client.get("/projects").status_code == 200

    assert client.post("/auth/logout").status_code == 204
    assert client.get("/projects").status_code == 401


@pytest.mark.parametrize("token", ["not-a-jwt", "", "a.b.c"])
def test_malformed_session_cookie_is_rejected(client, token) -> None:
    client.cookies.set("access_token", token)
    assert client.get("/projects").status_code == 401


def test_error_responses_do_not_leak_internal_detail(client) -> None:
    body = client.get("/projects").json()
    assert body["error"]["code"]
    serialised = str(body).lower()
    for secret in ("traceback", "sqlalchemy", "password", "postgresql://", "jwt_secret"):
        assert secret not in serialised
