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
    Submission,
)
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
    factory = build_session_factory(tmp_path / "reviews-tests.sqlite3")
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
    status: str = SUBMISSION_STATUS_UNREVIEWED,
    original_bytes: bytes = b"metric_name,value,unit,category\nElectricity,120.5,kWh,Energy\n",
    sha256: str | None = None,
) -> int:
    with session_factory() as db:
        user = SQLAlchemyUserRepository(db).get_user_by_email("uploader@greenchain.test")
        assert user is not None
        original = storage.store_original(BytesIO(original_bytes), "report.csv", "text/csv")
        processed = storage.store_processed(BytesIO(original_bytes), "report.csv", "text/csv")
        project = get_or_create_project(db, "Green Tower", "Acme Corp")
        submission = create_submission(
            db,
            project_id=project.id,
            uploader_id=user.id,
            reporting_period="2026-Q1",
            original_filename="report.csv",
            original_storage_key=original.storage_key,
            processed_storage_key=processed.storage_key,
            original_sha256=sha256 or calculate_sha256(BytesIO(original_bytes)),
        )
        submission.status = status
        bulk_create_metrics(db, submission.id, [])
        db.add(Metric(submission_id=submission.id, metric_name="Electricity", value=120.5, unit="kWh", category="Energy"))
        db.commit()
        return submission.id


def test_auditor_can_load_pending_queue(client: TestClient, session_factory, storage) -> None:
    pending_id = seed_submission(session_factory, storage)
    seed_submission(session_factory, storage, status=SUBMISSION_STATUS_APPROVED)
    login(client, "auditor@greenchain.test")

    response = client.get("/reviews/submissions/pending")

    assert response.status_code == 200
    submissions = response.json()["submissions"]
    assert [item["submission_id"] for item in submissions] == [pending_id]
    assert submissions[0]["status"] == "UNREVIEWED"
    assert submissions[0]["project_name"] == "Green Tower"


def test_auditor_can_open_review_detail(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage)
    login(client, "auditor@greenchain.test")

    response = client.get(f"/reviews/submissions/{submission_id}")

    assert response.status_code == 200
    submission = response.json()["submission"]
    assert submission["submission_id"] == submission_id
    assert submission["metrics"][0]["metric_name"] == "Electricity"
    assert submission["integrity"]["status"] == "MATCH"
    assert submission["evidence"]["original"]["url"] == f"/reviews/submissions/{submission_id}/evidence/original"
    assert "var/storage" not in str(submission)


@pytest.mark.parametrize("decision", [SUBMISSION_STATUS_APPROVED, SUBMISSION_STATUS_REJECTED])
def test_auditor_can_decide_unreviewed_submission(client: TestClient, session_factory, storage, decision: str) -> None:
    submission_id = seed_submission(session_factory, storage)
    login(client, "auditor@greenchain.test")

    response = client.post(
        f"/reviews/submissions/{submission_id}/decision",
        json={"decision": decision, "reason": "Checked source documents."},
    )

    assert response.status_code == 200
    assert response.json()["status"] == decision
    assert response.json()["reason"] == "Checked source documents."
    with session_factory() as db:
        assert db.get(Submission, submission_id).status == decision


@pytest.mark.parametrize("email", ["viewer@greenchain.test", "uploader@greenchain.test"])
def test_non_auditors_cannot_decide(client: TestClient, session_factory, storage, email: str) -> None:
    submission_id = seed_submission(session_factory, storage)
    login(client, email)

    response = client.post(f"/reviews/submissions/{submission_id}/decision", json={"decision": "APPROVED"})

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_unauthenticated_review_request_is_rejected(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage)

    response = client.post(f"/reviews/submissions/{submission_id}/decision", json={"decision": "APPROVED"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


def test_invalid_decision_is_rejected(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage)
    login(client, "auditor@greenchain.test")

    response = client.post(f"/reviews/submissions/{submission_id}/decision", json={"decision": "MAYBE"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_DECISION"


@pytest.mark.parametrize("status", [SUBMISSION_STATUS_APPROVED, SUBMISSION_STATUS_REJECTED])
def test_final_submission_cannot_be_reviewed_again(client: TestClient, session_factory, storage, status: str) -> None:
    submission_id = seed_submission(session_factory, storage, status=status)
    login(client, "auditor@greenchain.test")

    response = client.post(f"/reviews/submissions/{submission_id}/decision", json={"decision": "APPROVED"})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_REVIEW_STATE"


def test_missing_submission_returns_404(client: TestClient) -> None:
    login(client, "auditor@greenchain.test")

    response = client.get("/reviews/submissions/999")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SUBMISSION_NOT_FOUND"


def test_auditor_can_download_processed_evidence(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage)
    login(client, "auditor@greenchain.test")

    response = client.get(f"/reviews/submissions/{submission_id}/evidence/processed")

    assert response.status_code == 200
    assert response.content.startswith(b"metric_name,value,unit")
    assert response.headers["content-disposition"].startswith("attachment;")


def test_evidence_access_requires_auditor(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage)
    login(client, "viewer@greenchain.test")

    response = client.get(f"/reviews/submissions/{submission_id}/evidence/original")

    assert response.status_code == 403


def test_hash_mismatch_is_surfaced_safely(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage, sha256="0" * 64)
    login(client, "auditor@greenchain.test")

    response = client.get(f"/reviews/submissions/{submission_id}")

    assert response.status_code == 200
    assert response.json()["submission"]["integrity"]["status"] == "MISMATCH"
