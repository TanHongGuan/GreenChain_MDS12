"""Sprint 9: deployment smoke surface and production configuration guards."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from backend.app.core.config import DEFAULT_DB_PASSWORD, DEFAULT_JWT_SECRET, Settings, get_settings
from backend.app.core.database import get_db
from backend.app.main import create_app
from backend.app.repositories.users import get_user_repository
from backend.app.storage.dependencies import get_storage_service
from backend.app.tests.db_fixtures import build_session_factory, install_repository_override, seed_test_auth_users

PROD = {
    "ENVIRONMENT": "production",
    "JWT_SECRET": "a" * 48,
    "COOKIE_SECURE": "true",
    "FRONTEND_ORIGIN": "https://greenchain.example",
    "DATABASE_URL": "postgresql+psycopg://app:realpassword@db:5432/greenchain",
}


def settings_for(**overrides) -> Settings:
    values = {**PROD, **overrides}
    return Settings(**{key: value for key, value in values.items()})


@pytest.fixture(autouse=True)
def clear_dependency_caches() -> None:
    get_settings.cache_clear()
    get_storage_service.cache_clear()


@pytest.fixture
def session_factory(tmp_path):
    factory = build_session_factory(tmp_path / "deployment-tests.sqlite3")
    with factory() as db:
        seed_test_auth_users(db)
    return factory


@pytest.fixture
def client(session_factory) -> TestClient:
    app = create_app()
    install_repository_override(app, get_user_repository, session_factory)

    def db_override():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = db_override
    return TestClient(app)


# --- health endpoints -------------------------------------------------------------------


def test_liveness_reports_the_service_without_touching_the_database(client) -> None:
    payload = client.get("/health").json()

    assert payload["status"] == "ok"
    assert payload["service"] == "greenchain-api"


def test_readiness_reports_database_reachable(client) -> None:
    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "checks": {"database": "ok"}}


def test_readiness_returns_503_when_the_database_is_unreachable(session_factory) -> None:
    app = create_app()
    install_repository_override(app, get_user_repository, session_factory)

    def broken_db():
        class Broken:
            def execute(self, *_args, **_kwargs):
                raise OperationalError("SELECT 1", {}, Exception("connection refused"))

        yield Broken()

    app.dependency_overrides[get_db] = broken_db
    response = TestClient(app).get("/health/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["database"] == "unavailable"


def test_readiness_failure_does_not_leak_the_connection_string(session_factory) -> None:
    app = create_app()
    install_repository_override(app, get_user_repository, session_factory)

    def broken_db():
        class Broken:
            def execute(self, *_args, **_kwargs):
                raise OperationalError("SELECT 1", {}, Exception("postgresql://app:hunter2@db:5432/greenchain"))

        yield Broken()

    app.dependency_overrides[get_db] = broken_db
    body = str(TestClient(app).get("/health/ready").json())

    assert "hunter2" not in body
    assert "postgresql://" not in body


# --- production configuration guards ----------------------------------------------------


def test_valid_production_configuration_is_accepted() -> None:
    assert settings_for().is_production is True


def test_development_defaults_are_allowed_outside_production() -> None:
    settings = Settings(
        ENVIRONMENT="development",
        JWT_SECRET=DEFAULT_JWT_SECRET,
        COOKIE_SECURE="false",
        FRONTEND_ORIGIN="http://localhost:5173",
    )
    assert settings.is_production is False


@pytest.mark.parametrize(
    "overrides,expected",
    [
        ({"JWT_SECRET": DEFAULT_JWT_SECRET}, "development default"),
        ({"JWT_SECRET": "tooshort"}, "at least 32 characters"),
        ({"COOKIE_SECURE": "false"}, "COOKIE_SECURE"),
        ({"FRONTEND_ORIGIN": "*"}, "must not be '*'"),
        ({"FRONTEND_ORIGIN": "http://greenchain.example"}, "must use https"),
        ({"FRONTEND_ORIGIN": "http://localhost:5173"}, "localhost"),
        ({"DATABASE_URL": f"postgresql+psycopg://app:{DEFAULT_DB_PASSWORD}@db:5432/x"}, "default password"),
    ],
)
def test_production_rejects_unsafe_configuration(overrides, expected) -> None:
    with pytest.raises(ValueError, match=expected):
        settings_for(**overrides)


def test_production_error_names_every_problem_at_once() -> None:
    # A deploy should not have to fix one misconfiguration per restart.
    with pytest.raises(ValueError) as error:
        settings_for(JWT_SECRET=DEFAULT_JWT_SECRET, COOKIE_SECURE="false", FRONTEND_ORIGIN="*")

    message = str(error.value)
    assert "JWT_SECRET" in message
    assert "COOKIE_SECURE" in message
    assert "'*'" in message


def test_multiple_production_origins_are_supported() -> None:
    settings = settings_for(FRONTEND_ORIGIN="https://a.example, https://b.example")
    assert settings.frontend_origins == ["https://a.example", "https://b.example"]
