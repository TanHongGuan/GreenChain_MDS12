from io import BytesIO

import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.integrity.hashing import calculate_sha256
from backend.app.main import create_app
from backend.app.models.metric import Metric
from backend.app.models.submission import SUBMISSION_STATUS_APPROVED, Submission
from backend.app.repositories.projects import get_or_create_project
from backend.app.repositories.submissions import create_submission
from backend.app.repositories.users import get_user_repository
from backend.app.repositories.users import SQLAlchemyUserRepository
from backend.app.reviews.service import decide_submission
from backend.app.storage.dependencies import get_storage_service
from backend.app.storage.local import LocalStorageService
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


def valid_form() -> dict[str, str]:
    return {
        "project_name": "Tower A",
        "organisation": "GreenChain Demo Organisation",
        "reporting_period": "2026-Q1",
    }


def seed_submission(
    session_factory,
    storage,
    *,
    status: str = "UNREVIEWED",
    original_bytes: bytes = b"metric_name,value,unit,category\nElectricity,120.5,kWh,Energy\n",
    previous_submission_id: int | None = None,
) -> int:
    with session_factory() as db:
        user = SQLAlchemyUserRepository(db).get_user_by_email("uploader@greenchain.test")
        assert user is not None
        original = storage.store_original(BytesIO(original_bytes), "report.csv", "text/csv")
        processed = storage.store_processed(BytesIO(original_bytes), "report.csv", "text/csv")
        project = get_or_create_project(db, "Green Tower", "GreenChain Demo Organisation")
        submission = create_submission(
            db,
            project_id=project.id,
            uploader_id=user.id,
            reporting_period="2026-Q1",
            original_filename="report.csv",
            original_storage_key=original.storage_key,
            processed_storage_key=processed.storage_key,
            original_sha256=calculate_sha256(BytesIO(original_bytes)),
            previous_submission_id=previous_submission_id,
        )
        submission.status = status
        db.add(Metric(submission_id=submission.id, metric_name="Electricity", value=120.5, unit="kWh", category="Energy"))
        db.commit()
        return submission.id


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


def test_project_submission_history_loads_real_records(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage, status=SUBMISSION_STATUS_APPROVED)
    with session_factory() as db:
        project_id = db.get(Submission, submission_id).project_id
    login(client, "viewer@greenchain.test")

    response = client.get(f"/submissions/projects/{project_id}")

    assert response.status_code == 200
    [record] = response.json()["submissions"]
    assert record["submission_id"] == submission_id
    assert record["evidence"]["original"]["available"] is True
    assert record["evidence"]["original"]["integrity"]["status"] == "MATCH"
    assert "var/storage" not in str(record)


def test_submission_detail_loads_metrics_and_traceability(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage)
    login(client, "viewer@greenchain.test")

    response = client.get(f"/submissions/{submission_id}")

    assert response.status_code == 200
    submission = response.json()["submission"]
    assert submission["submission_id"] == submission_id
    assert submission["metrics"][0]["submission_id"] == submission_id
    assert submission["evidence"]["processed"]["available"] is True
    assert "original_storage_key" not in str(submission)


def test_original_processed_and_audit_downloads_work_when_authorised(
    client: TestClient, session_factory, storage
) -> None:
    submission_id = seed_submission(session_factory, storage)
    login(client, "auditor@greenchain.test")
    with session_factory() as db:
        auditor = SQLAlchemyUserRepository(db).get_user_by_email("auditor@greenchain.test")
        decide_submission(submission_id, SUBMISSION_STATUS_APPROVED, "accepted", auditor.id, db=db)

    original = client.get(f"/submissions/{submission_id}/evidence/original")
    processed = client.get(f"/submissions/{submission_id}/evidence/processed")
    audit = client.get(f"/submissions/{submission_id}/evidence/audit_report")

    assert original.status_code == 200
    assert processed.status_code == 200
    assert audit.status_code == 200
    assert b"Decision: APPROVED" in audit.content
    assert original.headers["content-disposition"].startswith("attachment;")


def test_submission_download_requires_authentication(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage)

    response = client.get(f"/submissions/{submission_id}/evidence/original")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


def test_arbitrary_artifact_path_is_rejected(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage)
    login(client, "viewer@greenchain.test")

    response = client.get(f"/submissions/{submission_id}/evidence/..%2Fsecret")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_EVIDENCE_TYPE"


def test_missing_evidence_returns_safe_404(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage)
    with session_factory() as db:
        submission = db.get(Submission, submission_id)
        submission.original_storage_key = "original/missing/report.csv"
        db.commit()
    login(client, "viewer@greenchain.test")

    response = client.get(f"/submissions/{submission_id}/evidence/original")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "EVIDENCE_NOT_FOUND"
