from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from backend.app.auth.dependencies import AUTH_COOKIE_NAME, require_roles
from backend.app.auth.models import AuthUser, UserRole
from backend.app.auth.schemas import UserResponse
from backend.app.core.config import get_settings
from backend.app.main import create_app
from backend.app.repositories.users import get_user_repository


@pytest.fixture(autouse=True)
def clear_dependency_caches() -> None:
    get_settings.cache_clear()
    get_user_repository.cache_clear()


@pytest.fixture
def client() -> TestClient:
    app = create_app()
    return TestClient(app)


def login(client: TestClient, email: str, password: str = "password"):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_valid_viewer_login_succeeds(client: TestClient) -> None:
    response = login(client, "viewer@greenchain.test")

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "VIEWER"
    assert AUTH_COOKIE_NAME in response.cookies


def test_valid_uploader_login_succeeds(client: TestClient) -> None:
    response = login(client, "uploader@greenchain.test")

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "UPLOADER"


def test_valid_auditor_login_succeeds(client: TestClient) -> None:
    response = login(client, "auditor@greenchain.test")

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "AUDITOR"


@pytest.mark.parametrize(
    ("email", "password"),
    [
        ("missing@greenchain.test", "password"),
        ("viewer@greenchain.test", "wrong-password"),
    ],
)
def test_invalid_credentials_return_401(client: TestClient, email: str, password: str) -> None:
    response = login(client, email, password)

    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "INVALID_CREDENTIALS",
            "message": "Email or password is incorrect.",
        }
    }


def test_login_response_does_not_expose_password_or_hash(client: TestClient) -> None:
    response = login(client, "viewer@greenchain.test")

    assert response.status_code == 200
    payload = response.json()
    assert "password" not in str(payload).lower()
    assert "hash" not in str(payload).lower()


def test_me_while_authenticated_returns_current_user(client: TestClient) -> None:
    login_response = login(client, "uploader@greenchain.test")
    response = client.get("/auth/me")

    assert login_response.status_code == 200
    assert response.status_code == 200
    assert response.json()["user"] == login_response.json()["user"]


def test_me_while_logged_out_returns_401(client: TestClient) -> None:
    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


def test_logout_clears_authentication(client: TestClient) -> None:
    login(client, "viewer@greenchain.test")
    logout_response = client.post("/auth/logout")
    me_response = client.get("/auth/me")

    assert logout_response.status_code == 204
    assert me_response.status_code == 401


def test_me_after_logout_returns_401(client: TestClient) -> None:
    login(client, "auditor@greenchain.test")
    client.post("/auth/logout")

    response = client.get("/auth/me")

    assert response.status_code == 401


def test_missing_token_returns_401(client: TestClient) -> None:
    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


def test_malformed_token_returns_401(client: TestClient) -> None:
    client.cookies.set(AUTH_COOKIE_NAME, "not-a-valid-jwt")

    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_TOKEN"


def test_expired_token_returns_401(client: TestClient) -> None:
    settings = get_settings()
    token = jwt.encode(
        {
            "sub": "dev-viewer",
            "iat": datetime.now(UTC) - timedelta(minutes=10),
            "exp": datetime.now(UTC) - timedelta(minutes=5),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    client.cookies.set(AUTH_COOKIE_NAME, token)

    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "TOKEN_EXPIRED"


def make_rbac_client() -> TestClient:
    app = create_app()

    @app.get("/rbac/uploader", response_model=UserResponse)
    def uploader_route(current_user: AuthUser = Depends(require_roles(UserRole.UPLOADER))) -> AuthUser:
        return current_user

    @app.get("/rbac/auditor", response_model=UserResponse)
    def auditor_route(current_user: AuthUser = Depends(require_roles(UserRole.AUDITOR))) -> AuthUser:
        return current_user

    return TestClient(app)


@pytest.mark.parametrize("email", ["viewer@greenchain.test", "auditor@greenchain.test"])
def test_non_uploaders_fail_uploader_only_authorization(email: str) -> None:
    client = make_rbac_client()
    login(client, email)

    response = client.get("/rbac/uploader")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_uploader_passes_uploader_authorization() -> None:
    client = make_rbac_client()
    login(client, "uploader@greenchain.test")

    response = client.get("/rbac/uploader")

    assert response.status_code == 200
    assert response.json()["role"] == "UPLOADER"


@pytest.mark.parametrize("email", ["viewer@greenchain.test", "uploader@greenchain.test"])
def test_non_auditors_fail_auditor_only_authorization(email: str) -> None:
    client = make_rbac_client()
    login(client, email)

    response = client.get("/rbac/auditor")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_auditor_passes_auditor_authorization() -> None:
    client = make_rbac_client()
    login(client, "auditor@greenchain.test")

    response = client.get("/rbac/auditor")

    assert response.status_code == 200
    assert response.json()["role"] == "AUDITOR"


def test_rbac_missing_authentication_returns_401() -> None:
    client = make_rbac_client()

    response = client.get("/rbac/uploader")

    assert response.status_code == 401
