import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.main import create_app
from backend.app.models.metric import Metric
from backend.app.repositories.benchmarks import create_benchmark
from backend.app.repositories.projects import get_or_create_project
from backend.app.repositories.submissions import create_submission
from backend.app.repositories.users import SQLAlchemyUserRepository, get_user_repository
from backend.app.tests.db_fixtures import build_session_factory, install_repository_override, seed_test_auth_users


@pytest.fixture(autouse=True)
def clear_dependency_caches() -> None:
    get_settings.cache_clear()


@pytest.fixture
def session_factory(tmp_path):
    factory = build_session_factory(tmp_path / "insights-tests.sqlite3")
    with factory() as db:
        seed_test_auth_users(db)
    return factory


@pytest.fixture
def app(session_factory):
    # No storage service is installed anywhere in this file: the insights endpoints
    # read only PostgreSQL rows, so they work with no file store configured at all.
    test_app = create_app()
    install_repository_override(test_app, get_user_repository, session_factory)

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


def seed_project(
    session_factory,
    *,
    reporting_period: str = "2026-Q1",
    status: str = "APPROVED",
    metrics: list[tuple[str, float, str]] = (("Electricity", 800.0, "kWh"),),
    with_benchmark: bool = True,
    benchmark_value: float = 1000.0,
) -> int:
    with session_factory() as db:
        user = SQLAlchemyUserRepository(db).get_user_by_email("uploader@greenchain.test")
        project = get_or_create_project(db, "Green Tower", "Acme Corp")
        project.country = "Australia"
        project.property_type = "Office"
        submission = create_submission(
            db,
            project_id=project.id,
            uploader_id=user.id,
            reporting_period=reporting_period,
            original_filename="report.csv",
            original_storage_key=f"original/{reporting_period}-{status}",
            processed_storage_key=f"processed/{reporting_period}-{status}",
            original_sha256="0" * 64,
        )
        submission.status = status
        for metric_name, value, unit in metrics:
            db.add(Metric(submission_id=submission.id, metric_name=metric_name, value=value, unit=unit, category=None))
        if with_benchmark:
            create_benchmark(
                db,
                provider="Test Provider",
                source_name="Test Source",
                source_version="v1",
                source_url="https://example.test/benchmark",
                country="Australia",
                property_type="Office",
                year=2026,
                metric_name="Electricity",
                unit="kWh",
                value=benchmark_value,
            )
        db.commit()
        return project.id


# --- authentication -------------------------------------------------------------------


def test_benchmarks_requires_authentication(client, session_factory) -> None:
    project_id = seed_project(session_factory)

    response = client.get(f"/insights/projects/{project_id}/benchmarks")

    assert response.status_code == 401


def test_consistency_requires_authentication(client, session_factory) -> None:
    project_id = seed_project(session_factory)

    response = client.get(f"/insights/projects/{project_id}/consistency")

    assert response.status_code == 401


def test_viewer_can_read_insights(client, session_factory) -> None:
    project_id = seed_project(session_factory)
    login(client, "viewer@greenchain.test")

    assert client.get(f"/insights/projects/{project_id}/benchmarks").status_code == 200
    assert client.get(f"/insights/projects/{project_id}/consistency").status_code == 200


# --- benchmark payload ----------------------------------------------------------------


def test_benchmark_payload_carries_source_and_classification(client, session_factory) -> None:
    project_id = seed_project(session_factory)
    login(client, "viewer@greenchain.test")

    payload = client.get(f"/insights/projects/{project_id}/benchmarks").json()

    assert payload["project"]["country"] == "Australia"
    assert payload["project"]["property_type"] == "Office"
    assert payload["tolerance_percent"] == 5.0

    comparison = payload["comparisons"][0]
    assert comparison["metric_name"] == "Electricity"
    assert comparison["classification"] == "BETTER_THAN_TARGET"
    assert comparison["difference_percent"] == pytest.approx(-20.0)
    assert comparison["benchmark_value"] == 1000.0
    assert comparison["direction"] == "LOWER_IS_BETTER"
    assert comparison["source"]["provider"] == "Test Provider"
    assert comparison["source"]["source_version"] == "v1"
    assert comparison["reason"] is None


def test_benchmark_payload_explains_why_a_metric_is_not_comparable(client, session_factory) -> None:
    project_id = seed_project(session_factory, with_benchmark=False)
    login(client, "viewer@greenchain.test")

    payload = client.get(f"/insights/projects/{project_id}/benchmarks").json()
    comparison = payload["comparisons"][0]

    assert comparison["classification"] == "NOT_COMPARABLE"
    assert comparison["reason"] == "NO_BENCHMARK_FOR_SCOPE"
    assert comparison["source"] is None
    # The measured value is still reported, so the metric is visible rather than dropped.
    assert comparison["value"] == 800.0


def test_benchmark_unknown_project_returns_structured_404(client) -> None:
    login(client, "viewer@greenchain.test")

    response = client.get("/insights/projects/999999/benchmarks")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROJECT_NOT_FOUND"


# --- consistency payload --------------------------------------------------------------


def test_consistency_payload_shape(client, session_factory) -> None:
    project_id = seed_project(
        session_factory, metrics=[("Electricity", 800.0, "kWh"), ("Water", 50.0, "kL")]
    )
    login(client, "viewer@greenchain.test")

    payload = client.get(f"/insights/projects/{project_id}/consistency").json()

    assert payload["metrics"] == ["Electricity", "Water"]
    assert payload["periods"] == ["2026-Q1"]
    assert payload["approved_cells"] == 2
    assert payload["total_cells"] == 2
    assert payload["approved_coverage_percent"] == pytest.approx(100.0)
    assert {cell["state"] for cell in payload["cells"]} == {"APPROVED"}


def test_consistency_unknown_project_returns_structured_404(client) -> None:
    login(client, "viewer@greenchain.test")

    response = client.get("/insights/projects/999999/consistency")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROJECT_NOT_FOUND"
