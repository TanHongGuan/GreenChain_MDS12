from datetime import datetime, timedelta
from io import BytesIO

import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.integrity.hashing import calculate_sha256
from backend.app.main import create_app
from backend.app.models.metric import Metric
from backend.app.models.submission import (
    SUBMISSION_STATUS_APPROVED,
    SUBMISSION_STATUS_REJECTED,
    SUBMISSION_STATUS_UNREVIEWED,
)
from backend.app.repositories.projects import get_or_create_project
from backend.app.repositories.submissions import create_submission
from backend.app.repositories.users import SQLAlchemyUserRepository, get_user_repository
from backend.app.storage.dependencies import get_storage_service
from backend.app.storage.local import LocalStorageService
from backend.app.tests.db_fixtures import build_session_factory, install_repository_override, seed_test_auth_users


@pytest.fixture(autouse=True)
def clear_dependency_caches() -> None:
    get_settings.cache_clear()
    get_storage_service.cache_clear()


@pytest.fixture
def session_factory(tmp_path):
    factory = build_session_factory(tmp_path / "discovery-api-tests.sqlite3")
    with factory() as db:
        seed_test_auth_users(db)
    return factory


@pytest.fixture
def storage(tmp_path):
    return LocalStorageService(tmp_path / "storage")


@pytest.fixture
def app(session_factory, storage):
    test_app = create_app()
    install_repository_override(test_app, get_user_repository, session_factory)
    test_app.dependency_overrides[get_storage_service] = lambda: storage

    def db_override():
        db = session_factory()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    test_app.dependency_overrides[get_db] = db_override
    return test_app


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app)


def login(client: TestClient, email: str) -> None:
    response = client.post("/auth/login", json={"email": email, "password": "password"})
    assert response.status_code == 200


def seed_submission(
    session_factory,
    *,
    project_name: str,
    organisation: str = "Discovery API Org",
    location: str = "Johor",
    reporting_period: str,
    status: str,
    created_at: datetime,
    project_created_at: datetime,
    value: float,
) -> int:
    with session_factory() as db:
        user = SQLAlchemyUserRepository(db).get_user_by_email("uploader@greenchain.test")
        raw_bytes = f"metric_name,value,unit\nElectricity,{value},kWh\n".encode()
        project = get_or_create_project(db, project_name, organisation, location=location)
        project.created_at = project_created_at
        submission = create_submission(
            db,
            project_id=project.id,
            uploader_id=user.id,
            reporting_period=reporting_period,
            original_filename="report.csv",
            original_storage_key=f"original/{project.id}-{reporting_period}.csv",
            processed_storage_key=f"processed/{project.id}-{reporting_period}.csv",
            original_sha256=calculate_sha256(BytesIO(raw_bytes)),
        )
        submission.status = status
        submission.created_at = created_at
        db.add(Metric(submission_id=submission.id, metric_name="Electricity", value=value, unit="kWh", category="Energy"))
        db.commit()
        return project.id


def seed_api_projects(session_factory) -> dict[str, int]:
    base = datetime(2026, 1, 1, 9, 0, 0)
    alpha = seed_submission(
        session_factory,
        project_name="API Alpha Solar",
        reporting_period="2026-Q1",
        status=SUBMISSION_STATUS_APPROVED,
        created_at=base,
        project_created_at=base,
        value=10,
    )
    seed_submission(
        session_factory,
        project_name="API Alpha Solar",
        reporting_period="2026-Q2",
        status=SUBMISSION_STATUS_REJECTED,
        created_at=base + timedelta(days=3),
        project_created_at=base,
        value=999,
    )
    beta = seed_submission(
        session_factory,
        project_name="API Beta Hydro",
        location="Penang",
        reporting_period="2026-Q2",
        status=SUBMISSION_STATUS_UNREVIEWED,
        created_at=base + timedelta(days=2),
        project_created_at=base + timedelta(days=2),
        value=20,
    )
    return {"alpha": alpha, "beta": beta}


def test_home_discovery_returns_real_sections_and_trusted_metric(client: TestClient, session_factory) -> None:
    seed_api_projects(session_factory)
    login(client, "viewer@greenchain.test")

    response = client.get("/discovery/home")

    assert response.status_code == 200
    payload = response.json()
    assert payload["recently_updated"][0]["project_name"] == "API Alpha Solar"
    assert payload["recently_updated"][0]["trusted_metric"]["value"] == 10
    assert payload["recently_updated"][0]["trusted_metric"]["reporting_period"] == "2026-Q1"
    assert payload["new_projects"][0]["project_name"] == "API Beta Hydro"
    assert "No explicit featured flag exists" in payload["featured_rule"]


def test_highlight_add_list_remove_uses_authenticated_user(client: TestClient, session_factory) -> None:
    ids = seed_api_projects(session_factory)
    login(client, "viewer@greenchain.test")

    add_response = client.post(f"/highlighted/projects/{ids['alpha']}")
    list_response = client.get("/highlighted/projects")
    remove_response = client.delete(f"/highlighted/projects/{ids['alpha']}")
    empty_response = client.get("/highlighted/projects")

    assert add_response.status_code == 200
    assert add_response.json()["project"]["highlighted"] is True
    assert [p["project_name"] for p in list_response.json()["projects"]] == ["API Alpha Solar"]
    assert remove_response.status_code == 200
    assert remove_response.json()["highlighted"] is False
    assert empty_response.json()["projects"] == []


def test_highlights_do_not_leak_between_users(client: TestClient, session_factory) -> None:
    ids = seed_api_projects(session_factory)
    login(client, "viewer@greenchain.test")
    assert client.post(f"/highlighted/projects/{ids['alpha']}").status_code == 200
    assert client.post("/auth/logout").status_code == 204

    login(client, "auditor@greenchain.test")
    response = client.get("/highlighted/projects")

    assert response.status_code == 200
    assert response.json()["projects"] == []


def test_missing_highlight_project_returns_404(client: TestClient) -> None:
    login(client, "viewer@greenchain.test")

    response = client.post("/highlighted/projects/999999")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROJECT_NOT_FOUND"


def test_unauthenticated_discovery_and_highlight_routes_are_blocked(client: TestClient) -> None:
    assert client.get("/discovery/home").status_code == 401
    assert client.get("/highlighted/projects").status_code == 401
    assert client.post("/highlighted/projects/1").status_code == 401
