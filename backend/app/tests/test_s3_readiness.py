import boto3
import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import Settings, get_settings
from backend.app.core.database import get_db
from backend.app.main import create_app
from backend.app.repositories.users import get_user_repository
from backend.app.storage.dependencies import build_s3_client, get_storage_service
from backend.app.storage.s3 import S3StorageService
from backend.app.tests.db_fixtures import build_session_factory, install_repository_override, seed_test_auth_users
from backend.app.tests.s3_fixtures import TEST_BUCKET, TEST_REGION, s3_client  # noqa: F401


@pytest.fixture(autouse=True)
def clear_caches():
    get_settings.cache_clear()
    get_storage_service.cache_clear()
    yield
    get_settings.cache_clear()
    get_storage_service.cache_clear()


def make_client(tmp_path) -> TestClient:
    factory = build_session_factory(tmp_path / "readiness.sqlite3")
    with factory() as db:
        seed_test_auth_users(db)
    app = create_app()
    install_repository_override(app, get_user_repository, factory)

    def db_override():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = db_override
    return TestClient(app)


def test_aws_profile_from_settings_is_passed_to_boto3(monkeypatch) -> None:
    captured = {}

    class FakeSession:
        def __init__(self, profile_name=None):
            captured["profile"] = profile_name

        def client(self, service, **kwargs):
            captured["service"] = service
            captured.update(kwargs)
            return object()

    monkeypatch.setattr(boto3, "Session", FakeSession)

    build_s3_client(Settings(AWS_PROFILE="greenchain-dev", AWS_REGION=TEST_REGION))

    assert captured["profile"] == "greenchain-dev"
    assert captured["service"] == "s3"
    assert captured["region_name"] == TEST_REGION


def test_no_profile_uses_default_credential_chain(monkeypatch) -> None:
    captured = {}

    class FakeSession:
        def __init__(self, profile_name=None):
            captured["profile"] = profile_name

        def client(self, service, **kwargs):
            return object()

    monkeypatch.delenv("AWS_PROFILE", raising=False)
    monkeypatch.setattr(boto3, "Session", FakeSession)

    build_s3_client(Settings(_env_file=None))

    assert captured["profile"] is None


def test_readiness_checks_object_lock_bucket_when_using_s3(tmp_path, s3_client, monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    client = make_client(tmp_path)
    monkeypatch.setattr(
        "backend.app.api.health.get_storage_service",
        lambda: S3StorageService(s3_client, TEST_BUCKET),
    )

    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "checks": {"database": "ok", "evidence_storage": "ok"}}


def test_readiness_fails_without_leaking_bucket_details(tmp_path, s3_client, monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    client = make_client(tmp_path)
    monkeypatch.setattr(
        "backend.app.api.health.get_storage_service",
        lambda: S3StorageService(s3_client, "secret-missing-bucket-name"),
    )

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["evidence_storage"] == "unavailable"
    assert "secret-missing-bucket-name" not in response.text


def test_readiness_does_not_touch_storage_for_local_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    client = make_client(tmp_path)

    def fail():
        raise AssertionError("local readiness must not initialise storage")

    monkeypatch.setattr("backend.app.api.health.get_storage_service", fail)

    assert client.get("/health/ready").json()["checks"] == {"database": "ok"}
