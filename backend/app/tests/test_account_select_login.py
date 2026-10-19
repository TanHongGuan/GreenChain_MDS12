import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import Settings, get_settings
from backend.app.core.database import get_db
from backend.app.main import create_app
from backend.app.models.user import User
from backend.app.repositories.users import get_user_repository
from backend.app.tests.db_fixtures import build_session_factory, install_repository_override, seed_test_auth_users


@pytest.fixture
def session_factory(tmp_path):
    factory = build_session_factory(tmp_path / "account-select.sqlite3")
    with factory() as db:
        seed_test_auth_users(db)
    return factory


def make_client(session_factory, *, enabled: bool) -> TestClient:
    app = create_app()
    install_repository_override(app, get_user_repository, session_factory)
    settings = Settings(_env_file=None, ACCOUNT_SELECT_LOGIN=enabled)
    app.dependency_overrides[get_settings] = lambda: settings

    def db_override():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = db_override
    return TestClient(app)


def user_id(session_factory, email: str) -> str:
    with session_factory() as db:
        return db.query(User).filter(User.email == email).one().id


def test_account_list_is_hidden_when_disabled(session_factory) -> None:
    client = make_client(session_factory, enabled=False)

    assert client.get("/auth/accounts").status_code == 404
    response = client.post("/auth/select", json={"user_id": user_id(session_factory, "auditor@greenchain.test")})
    assert response.status_code == 404
    assert "greenchain_access_token" not in response.cookies


def test_account_list_returns_active_users_without_secrets(session_factory) -> None:
    with session_factory() as db:
        db.query(User).filter(User.email == "viewer@greenchain.test").one().is_active = False
        db.commit()
    client = make_client(session_factory, enabled=True)

    accounts = client.get("/auth/accounts").json()["accounts"]

    emails = {account["email"] for account in accounts}
    assert emails == {"uploader@greenchain.test", "auditor@greenchain.test"}
    assert all(set(account) == {"id", "name", "email", "role", "organisation_id"} for account in accounts)


def test_selecting_an_account_signs_in_as_that_user(session_factory) -> None:
    client = make_client(session_factory, enabled=True)

    response = client.post("/auth/select", json={"user_id": user_id(session_factory, "auditor@greenchain.test")})

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "AUDITOR"
    assert client.get("/auth/me").json()["user"]["email"] == "auditor@greenchain.test"
    assert client.get("/reviews/submissions/pending").status_code != 403


def test_selected_account_keeps_its_role_boundaries(session_factory) -> None:
    client = make_client(session_factory, enabled=True)
    client.post("/auth/select", json={"user_id": user_id(session_factory, "viewer@greenchain.test")})

    assert client.get("/reviews/submissions/pending").status_code == 403


def test_unknown_or_inactive_account_cannot_be_selected(session_factory) -> None:
    with session_factory() as db:
        db.query(User).filter(User.email == "uploader@greenchain.test").one().is_active = False
        db.commit()
    client = make_client(session_factory, enabled=True)

    assert client.post("/auth/select", json={"user_id": "does-not-exist"}).status_code == 401
    inactive = client.post("/auth/select", json={"user_id": user_id(session_factory, "uploader@greenchain.test")})
    assert inactive.status_code == 401


def test_password_login_still_works_when_account_select_is_enabled(session_factory) -> None:
    client = make_client(session_factory, enabled=True)

    response = client.post("/auth/login", json={"email": "viewer@greenchain.test", "password": "password"})

    assert response.status_code == 200


def test_production_refuses_account_select_login() -> None:
    with pytest.raises(ValueError, match="ACCOUNT_SELECT_LOGIN"):
        Settings(
            _env_file=None,
            ENVIRONMENT="production",
            JWT_SECRET="a" * 48,
            COOKIE_SECURE=True,
            FRONTEND_ORIGIN="https://greenchain.example",
            DATABASE_URL="postgresql+psycopg://app:realpassword@db:5432/greenchain",
            ACCOUNT_SELECT_LOGIN=True,
        )
