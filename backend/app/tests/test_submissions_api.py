import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.main import create_app
from backend.app.repositories.users import get_user_repository
from backend.app.submissions.service import SubmissionProcessingError, SubmissionResult, SubmissionValidationError
from backend.app.submissions.service import get_submission_processor
from backend.app.tests.db_fixtures import build_session_factory, install_repository_override, seed_test_auth_users


@pytest.fixture(autouse=True)
def clear_dependency_caches() -> None:
    get_settings.cache_clear()


@pytest.fixture
def session_factory(tmp_path):
    factory = build_session_factory(tmp_path / "submissions-tests.sqlite3")
    with factory() as db:
        seed_test_auth_users(db)
    return factory


@pytest.fixture
def app(session_factory):
    test_app = create_app()
    install_repository_override(test_app, get_user_repository, session_factory)
    return test_app


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app)


def login(client: TestClient, email: str) -> None:
    response = client.post("/auth/login", json={"email": email, "password": "password"})
    assert response.status_code == 200


def valid_form() -> dict[str, str]:
    return {
        "project_name": "Tower A",
        "organisation": "GreenChain Demo Organisation",
        "reporting_period": "2026-Q1",
    }


async def successful_processor(*_args, **_kwargs) -> SubmissionResult:
    return SubmissionResult(submission_id=123)


def install_processor(app, processor) -> None:
    app.dependency_overrides[get_submission_processor] = lambda: processor


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [
        ("energy.csv", "text/csv"),
        ("energy.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ],
)
def test_uploader_can_submit_supported_file(client: TestClient, app, filename: str, content_type: str) -> None:
    install_processor(app, successful_processor)
    login(client, "uploader@greenchain.test")

    response = client.post(
        "/submissions",
        data=valid_form(),
        files={"file": (filename, b"meter,kwh\nA-1,10\n", content_type)},
    )

    assert response.status_code == 201
    assert response.json() == {
        "submission_id": 123,
        "status": "UNREVIEWED",
        "message": "Submission uploaded successfully",
    }


def test_submission_requires_authentication(client: TestClient) -> None:
    response = client.post(
        "/submissions",
        data=valid_form(),
        files={"file": ("energy.csv", b"meter,kwh\n", "text/csv")},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


@pytest.mark.parametrize("email", ["viewer@greenchain.test", "auditor@greenchain.test"])
def test_submission_requires_uploader_role(client: TestClient, email: str) -> None:
    login(client, email)

    response = client.post(
        "/submissions",
        data=valid_form(),
        files={"file": ("energy.csv", b"meter,kwh\n", "text/csv")},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_submission_rejects_unsupported_file_type(client: TestClient) -> None:
    login(client, "uploader@greenchain.test")

    response = client.post(
        "/submissions",
        data=valid_form(),
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["error"] == "INVALID_FILE"


@pytest.mark.parametrize("field", ["project_name", "organisation", "reporting_period"])
def test_submission_requires_metadata(client: TestClient, field: str) -> None:
    login(client, "uploader@greenchain.test")
    form = valid_form()
    form[field] = " "

    response = client.post(
        "/submissions",
        data=form,
        files={"file": ("energy.csv", b"meter,kwh\n", "text/csv")},
    )

    assert response.status_code == 400
    assert response.json()["error"] == "MISSING_METADATA"


def test_submission_handles_malformed_request(client: TestClient) -> None:
    login(client, "uploader@greenchain.test")

    response = client.post("/submissions", data={"project_name": "Tower A"})

    assert response.status_code == 400
    assert response.json()["error"] == "MISSING_FILE"


def test_submission_returns_processing_validation_error(client: TestClient, app) -> None:
    async def invalid_processor(*_args, **_kwargs) -> SubmissionResult:
        raise SubmissionValidationError("CSV is missing required columns.")

    install_processor(app, invalid_processor)
    login(client, "uploader@greenchain.test")

    response = client.post(
        "/submissions",
        data=valid_form(),
        files={"file": ("energy.csv", b"meter,kwh\n", "text/csv")},
    )

    assert response.status_code == 400
    assert response.json() == {"error": "INVALID_FILE", "message": "CSV is missing required columns."}


@pytest.mark.parametrize("exception", [SubmissionProcessingError("storage failed"), RuntimeError("secret path")])
def test_submission_returns_safe_processing_failure(client: TestClient, app, exception: Exception) -> None:
    async def failing_processor(*_args, **_kwargs) -> SubmissionResult:
        raise exception

    install_processor(app, failing_processor)
    login(client, "uploader@greenchain.test")

    response = client.post(
        "/submissions",
        data=valid_form(),
        files={"file": ("energy.csv", b"meter,kwh\n", "text/csv")},
    )

    assert response.status_code == 500
    assert response.json() == {
        "error": "SUBMISSION_PROCESSING_FAILED",
        "message": "Submission could not be processed. Please try again.",
    }
