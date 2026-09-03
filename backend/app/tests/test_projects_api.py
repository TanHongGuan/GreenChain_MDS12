from io import BytesIO

import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.integrity.hashing import calculate_sha256
from backend.app.main import create_app
from backend.app.repositories.metrics import bulk_create_metrics
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
    factory = build_session_factory(tmp_path / "projects-tests.sqlite3")
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
    storage,
    *,
    project_name: str = "Green Tower",
    organisation: str = "Acme Corp",
    reporting_period: str = "2026-Q1",
    status: str = "APPROVED",
    metric_name: str = "Electricity",
    value: float = 100.0,
    unit: str = "kWh",
    location: str | None = None,
) -> int:
    with session_factory() as db:
        user = SQLAlchemyUserRepository(db).get_user_by_email("uploader@greenchain.test")
        raw_bytes = f"metric_name,value,unit\n{metric_name},{value},{unit}\n".encode()
        original = storage.store_original(BytesIO(raw_bytes), "report.csv", "text/csv")
        processed = storage.store_processed(BytesIO(raw_bytes), "report.csv", "text/csv")
        project = get_or_create_project(db, project_name, organisation, location=location)
        submission = create_submission(
            db,
            project_id=project.id,
            uploader_id=user.id,
            reporting_period=reporting_period,
            original_filename="report.csv",
            original_storage_key=original.storage_key,
            processed_storage_key=processed.storage_key,
            original_sha256=calculate_sha256(BytesIO(raw_bytes)),
        )
        submission.status = status
        bulk_create_metrics(db, submission.id, [])
        from backend.app.models.metric import Metric

        db.add(Metric(submission_id=submission.id, metric_name=metric_name, value=value, unit=unit, category=None))
        db.commit()
        return project.id


def test_authenticated_user_can_list_projects(client: TestClient, session_factory, storage) -> None:
    seed_submission(session_factory, storage, location="Johor")
    login(client, "viewer@greenchain.test")

    response = client.get("/projects")

    assert response.status_code == 200
    payload = response.json()
    names = [p["project_name"] for p in response.json()["projects"]]
    assert "Green Tower" in names
    assert payload["total_items"] == 1
    assert payload["projects"][0]["status"] == "APPROVED"
    assert payload["projects"][0]["location"] == "Johor"
    assert payload["filters"]["locations"] == [{"value": "Johor", "count": 1}]


def test_unauthenticated_cannot_list_projects(client: TestClient) -> None:
    response = client.get("/projects")

    assert response.status_code == 401


def test_project_catalogue_filters_unreviewed_and_rejected_only_when_requested(
    client: TestClient, session_factory, storage
) -> None:
    seed_submission(session_factory, storage, project_name="Trusted Solar", status="APPROVED", location="Johor")
    seed_submission(session_factory, storage, project_name="Pending Hydro", status="UNREVIEWED", location="Penang")
    seed_submission(session_factory, storage, project_name="Rejected Wind", status="REJECTED", location="Johor")
    login(client, "viewer@greenchain.test")

    default_response = client.get("/projects")
    explicit_response = client.get("/projects?status=UNREVIEWED,REJECTED&location=johor&sort=project_name_asc")

    assert [p["project_name"] for p in default_response.json()["projects"]] == ["Trusted Solar"]
    assert [p["project_name"] for p in explicit_response.json()["projects"]] == ["Rejected Wind"]


def test_project_catalogue_search_period_sort_and_pagination(
    client: TestClient, session_factory, storage
) -> None:
    seed_submission(
        session_factory,
        storage,
        project_name="Alpha Solar",
        organisation="Acme Corp",
        reporting_period="2026-Q1",
        status="APPROVED",
        location="Johor",
    )
    seed_submission(
        session_factory,
        storage,
        project_name="Beta Solar",
        organisation="Acme Corp",
        reporting_period="2026-Q1",
        status="APPROVED",
        location="Johor",
    )
    login(client, "viewer@greenchain.test")

    response = client.get(
        "/projects?search=solar&organisation=acme%20corp&reporting_period=2026-Q1"
        "&sort=project_name_asc&page=2&page_size=1"
    )

    assert response.status_code == 200
    payload = response.json()
    assert [p["project_name"] for p in payload["projects"]] == ["Beta Solar"]
    assert payload["page"] == 2
    assert payload["page_size"] == 1
    assert payload["total_items"] == 2
    assert payload["total_pages"] == 2


def test_project_catalogue_invalid_filters_return_structured_400(client: TestClient) -> None:
    login(client, "viewer@greenchain.test")

    response = client.get("/projects?status=ARCHIVED")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_STATUS"


def test_project_detail_shows_latest_approved_metric(client: TestClient, session_factory, storage) -> None:
    project_id = seed_submission(session_factory, storage, value=100.0)
    login(client, "viewer@greenchain.test")

    response = client.get(f"/projects/{project_id}")

    assert response.status_code == 200
    metrics = response.json()["metrics"]
    assert any(m["metric_name"] == "Electricity" and m["latest"]["value"] == 100.0 for m in metrics)


def test_unreviewed_data_does_not_replace_trusted_latest(client: TestClient, session_factory, storage) -> None:
    project_id = seed_submission(session_factory, storage, reporting_period="2026-Q1", status="APPROVED", value=100.0)
    seed_submission(session_factory, storage, reporting_period="2026-Q2", status="UNREVIEWED", value=999.0)
    login(client, "viewer@greenchain.test")

    response = client.get(f"/projects/{project_id}")

    metrics = response.json()["metrics"]
    electricity = next(m for m in metrics if m["metric_name"] == "Electricity")
    assert electricity["latest"]["value"] == 100.0


def test_rejected_data_never_appears(client: TestClient, session_factory, storage) -> None:
    project_id = seed_submission(session_factory, storage, reporting_period="2026-Q1", status="APPROVED", value=100.0)
    seed_submission(session_factory, storage, reporting_period="2026-Q2", status="REJECTED", value=999.0)
    login(client, "viewer@greenchain.test")

    response = client.get(f"/projects/{project_id}")

    metrics = response.json()["metrics"]
    electricity = next(m for m in metrics if m["metric_name"] == "Electricity")
    assert electricity["latest"]["value"] == 100.0

    history_response = client.get(f"/projects/{project_id}/metrics/Electricity/history?include_unreviewed=true")
    values = [point["value"] for point in history_response.json()["points"]]
    assert 999.0 not in values


def test_single_approved_period_has_no_previous(client: TestClient, session_factory, storage) -> None:
    project_id = seed_submission(session_factory, storage)
    login(client, "viewer@greenchain.test")

    response = client.get(f"/projects/{project_id}")

    electricity = next(m for m in response.json()["metrics"] if m["metric_name"] == "Electricity")
    assert electricity["previous"] is None


def test_history_excludes_unreviewed_by_default(client: TestClient, session_factory, storage) -> None:
    project_id = seed_submission(session_factory, storage, reporting_period="2026-Q1", status="APPROVED")
    seed_submission(session_factory, storage, reporting_period="2026-Q2", status="UNREVIEWED")
    login(client, "viewer@greenchain.test")

    response = client.get(f"/projects/{project_id}/metrics/Electricity/history")

    statuses = {point["status"] for point in response.json()["points"]}
    assert statuses == {"APPROVED"}


def test_history_includes_unreviewed_when_requested(client: TestClient, session_factory, storage) -> None:
    project_id = seed_submission(session_factory, storage, reporting_period="2026-Q1", status="APPROVED")
    seed_submission(session_factory, storage, reporting_period="2026-Q2", status="UNREVIEWED")
    login(client, "viewer@greenchain.test")

    response = client.get(f"/projects/{project_id}/metrics/Electricity/history?include_unreviewed=true")

    statuses = {point["status"] for point in response.json()["points"]}
    assert statuses == {"APPROVED", "UNREVIEWED"}


def test_missing_project_returns_404(client: TestClient) -> None:
    login(client, "viewer@greenchain.test")

    response = client.get("/projects/999999")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROJECT_NOT_FOUND"


def test_no_approved_data_returns_empty_metrics(client: TestClient, session_factory, storage) -> None:
    project_id = seed_submission(session_factory, storage, status="UNREVIEWED")
    login(client, "viewer@greenchain.test")

    response = client.get(f"/projects/{project_id}")

    assert response.status_code == 200
    assert response.json()["metrics"] == []
