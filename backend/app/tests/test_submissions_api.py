from io import BytesIO
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.integrity.hashing import calculate_sha256
from backend.app.main import create_app
from backend.app.models.metric import Metric
from backend.app.models.submission import SUBMISSION_STATUS_APPROVED, Submission
from backend.app.models.submission_auditor import SubmissionAuditor
from backend.app.repositories.projects import get_or_create_project
from backend.app.repositories.submissions import create_submission
from backend.app.repositories.users import get_user_repository
from backend.app.repositories.users import SQLAlchemyUserRepository
from backend.app.reviews.service import decide_submission
from backend.app.storage.dependencies import get_storage_service
from backend.app.storage.local import LocalStorageService
from backend.app.etl.errors import RowIssue
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
        # A building has to have an appointed auditor before anyone can review it.
        auditor = SQLAlchemyUserRepository(db).get_user_by_email("auditor@greenchain.test")
        assert auditor is not None
        project.auditor_id = auditor.id
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
        db.flush()
        # A submission has to have an auditor assigned before anyone can review it.
        db.add(SubmissionAuditor(submission_id=submission.id, auditor_id=auditor.id))
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


def test_owned_building_monthly_upload_and_visibility(client: TestClient, session_factory) -> None:
    login(client, "uploader@greenchain.test")
    created = client.post("/projects/owned", json={"name": "Monthly Bayview", "location": "Selangor"})
    assert created.status_code == 201
    project_id = created.json()["building"]["project_id"]
    assert any(item["project_id"] == project_id for item in client.get("/projects/owned").json()["buildings"])
    response = client.post(
        "/submissions",
        data={"project_id": str(project_id), "reporting_period": "2026-Q1"},
        files={"file": ("monthly.csv", b"reporting_period,electricity_kwh,water_m3,co2_tco2e\n2026-01,10,2,0.5\n2026-02,11,2.5,0.6\n2026-03,12,3,0.7\n", "text/csv")},
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["project_id"] == project_id
    assert payload["monthly_record_count"] == 3
    submission_id = payload["submission_id"]
    assert client.get(f"/submissions/{submission_id}/monthly").json()["monthly_records"][0]["reporting_period"] == "2026-01"
    downloaded = client.get(f"/submissions/{submission_id}/evidence/processed")
    assert downloaded.status_code == 200
    assert b"reporting_period,electricity_kwh,water_m3,co2_tco2e" in downloaded.content
    login(client, "viewer@greenchain.test")
    assert client.get(f"/submissions/{submission_id}/monthly").status_code == 404
    assert client.get(f"/submissions/{submission_id}").status_code == 404
    assert client.get(f"/submissions/{submission_id}/evidence/processed").status_code == 404
    assert client.get(f"/projects/{project_id}/monthly").json()["monthly_records"] == []
    with session_factory() as db:
        submission = db.get(Submission, submission_id)
        submission.status = SUBMISSION_STATUS_APPROVED
        db.commit()
    assert client.get(f"/submissions/{submission_id}/monthly").status_code == 200
    assert len(client.get(f"/projects/{project_id}/monthly").json()["monthly_records"]) == 3


def test_owned_building_creation_is_role_bound(client: TestClient) -> None:
    login(client, "viewer@greenchain.test")
    assert client.post("/projects/owned", json={"name": "Not mine"}).status_code == 403
    login(client, "uploader@greenchain.test")
    assert client.post("/projects/owned", json={"name": "  Bayview  "}).status_code == 201
    assert client.post("/projects/owned", json={"name": "bayview"}).status_code == 409


def test_unfamiliar_file_preview_uses_ai_and_confirmed_mapping_is_processed(client: TestClient) -> None:
    from backend.app.tests.test_ai_mapping import UNKNOWN, suggestion

    login(client, "uploader@greenchain.test")
    project_id = client.post("/projects/owned", json={"name": "AI Preview Building"}).json()["building"]["project_id"]
    with patch("backend.app.api.submissions.suggest_mapping", new_callable=AsyncMock, return_value=suggestion()) as ai:
        preview = client.post("/submissions/mapping-preview", files={"file": ("unknown.csv", UNKNOWN, "text/csv")})
    assert preview.status_code == 200, preview.text
    assert preview.json()["kind"] == "ai_mapping"
    ai.assert_awaited_once()
    uploaded = client.post(
        "/submissions",
        data={"project_id": str(project_id), "reporting_period": "2026-Q1", "confirmed_mapping": suggestion().model_dump_json()},
        files={"file": ("unknown.csv", UNKNOWN, "text/csv")},
    )
    assert uploaded.status_code == 201, uploaded.text
    assert uploaded.json()["input_format"] == "MONTHLY_AI_MAPPED"
    detail = client.get(f"/submissions/{uploaded.json()['submission_id']}").json()["submission"]
    assert detail["confirmed_mapping"]["mappings"][1]["header"] == "TNB Usage (MWh)"


def test_known_monthly_preview_does_not_call_ai(client: TestClient) -> None:
    login(client, "uploader@greenchain.test")
    with patch("backend.app.api.submissions.suggest_mapping", new_callable=AsyncMock) as ai:
        response = client.post("/submissions/mapping-preview", files={"file": (
            "known.csv", b"reporting_period,electricity_kwh,water_m3,co2_tco2e\n2026-01,1,2,3\n2026-02,1,2,3\n2026-03,1,2,3\n", "text/csv")})
    assert response.status_code == 200
    assert response.json() == {"kind": "known", "input_format": "MONTHLY_STANDARD"}
    ai.assert_not_awaited()


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


def test_row_level_faults_are_returned_as_a_list(client: TestClient, app) -> None:
    """Every fault reaches the uploader in one response, not one fault per attempt."""
    issues = (
        RowIssue("Electricity_Log", 20, "2026-01-19", "Main Incoming Grid (kWh)",
                 "INVALID_NUMERIC", "'MISSING' is not numeric."),
        RowIssue("Water_Readings", 41, "2026-02-09", "Water Meter - cumulative (m3)",
                 "DECREASING_CUMULATIVE", "meter reading falls from 24410.55 to 24340.2."),
    )

    async def invalid_processor(*_args, **_kwargs) -> SubmissionResult:
        raise SubmissionValidationError("This file has 2 data problems to correct.", issues)

    install_processor(app, invalid_processor)
    login(client, "uploader@greenchain.test")

    response = client.post(
        "/submissions",
        data=valid_form(),
        files={"file": ("energy.csv", b"meter,kwh\n", "text/csv")},
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"] == "INVALID_FILE"
    assert [(item["worksheet"], item["row"], item["row_date"], item["column"], item["code"])
            for item in payload["issues"]] == [
        ("Electricity_Log", 20, "2026-01-19", "Main Incoming Grid (kWh)", "INVALID_NUMERIC"),
        ("Water_Readings", 41, "2026-02-09", "Water Meter - cumulative (m3)", "DECREASING_CUMULATIVE"),
    ]
    assert payload["issues"][0]["message"].startswith("Electricity_Log row 20 (2026-01-19)")


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


def test_original_download_reports_verified_digest(client: TestClient, session_factory, storage) -> None:
    original_bytes = b"metric_name,value,unit,category\nElectricity,120.5,kWh,Energy\n"
    submission_id = seed_submission(session_factory, storage, original_bytes=original_bytes)
    login(client, "viewer@greenchain.test")

    response = client.get(f"/submissions/{submission_id}/evidence/original")

    assert response.status_code == 200
    assert response.headers["x-evidence-integrity"] == "MATCH"
    assert response.headers["x-evidence-sha256"] == calculate_sha256(BytesIO(original_bytes))


def test_tampered_original_is_not_served(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage)
    with session_factory() as db:
        storage._path_for_key(db.get(Submission, submission_id).original_storage_key).write_bytes(b"tampered")
    login(client, "viewer@greenchain.test")

    response = client.get(f"/submissions/{submission_id}/evidence/original")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EVIDENCE_INTEGRITY_MISMATCH"


def test_detail_exposes_storage_version_fields(client: TestClient, session_factory, storage) -> None:
    submission_id = seed_submission(session_factory, storage)
    login(client, "viewer@greenchain.test")

    original = client.get(f"/submissions/{submission_id}").json()["submission"]["evidence"]["original"]

    assert original["storage_backend"] == "local"
    assert original["version_id"] is None
    assert original["retention_mode"] is None
    assert original["integrity"]["status"] == "MATCH"
    assert original["integrity"]["trusted_reference"] == "DATABASE_ONLY"
    assert original["integrity"]["algorithm"] == "SHA-256"


def _auditor_ids(client: TestClient) -> list[str]:
    response = client.get("/projects/auditors")
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["auditors"]]


def test_a_company_assigns_several_auditors_to_one_submission(
    session_factory, storage, client: TestClient
) -> None:
    """A quarter is what gets reviewed, so it is what gets reviewers - and it may
    have more than one."""
    submission_id = seed_submission(session_factory, storage)
    login(client, "uploader@greenchain.test")
    auditors = _auditor_ids(client)
    assert auditors

    response = client.put(f"/submissions/{submission_id}/auditors",
                          json={"auditor_ids": auditors})

    assert response.status_code == 200, response.text
    assert sorted(item["id"] for item in response.json()["auditors"]) == sorted(auditors)
    history = client.get(f"/submissions/projects/{_project_of(session_factory, submission_id)}").json()
    listed = {item["submission_id"]: item for item in history["submissions"]}
    assert sorted(a["id"] for a in listed[submission_id]["auditors"]) == sorted(auditors)

    # Assigning again replaces the set rather than adding to it.
    cleared = client.put(f"/submissions/{submission_id}/auditors", json={"auditor_ids": []})
    assert cleared.status_code == 200
    assert cleared.json()["auditors"] == []


def _project_of(session_factory, submission_id: int) -> int:
    with session_factory() as db:
        return db.get(Submission, submission_id).project_id


def test_only_auditors_can_be_assigned_to_a_submission(
    session_factory, storage, client: TestClient
) -> None:
    """A company must not be able to name itself as the reviewer of its own evidence."""
    submission_id = seed_submission(session_factory, storage)
    login(client, "uploader@greenchain.test")
    accounts = {item["email"]: item["id"] for item in client.get("/auth/accounts").json()["accounts"]}

    for email in ("uploader@greenchain.test", "viewer@greenchain.test"):
        response = client.put(f"/submissions/{submission_id}/auditors",
                              json={"auditor_ids": [accounts[email]]})
        assert response.status_code == 400, f"{email} should not be assignable"
        assert response.json()["error"] == "INVALID_AUDITOR"

    # One bad id in an otherwise valid list rejects the whole assignment.
    mixed = client.put(f"/submissions/{submission_id}/auditors",
                       json={"auditor_ids": [*_auditor_ids(client), "no-such-user"]})
    assert mixed.status_code == 400


def test_a_company_cannot_assign_auditors_to_another_organisations_submission(
    session_factory, storage, client: TestClient
) -> None:
    # A submission belonging to a different organisation entirely.
    with session_factory() as db:
        rival = get_or_create_project(db, "Rival Tower", "Rival Holdings")
        uploader = SQLAlchemyUserRepository(db).get_user_by_email("uploader@greenchain.test")
        raw = BytesIO(b"metric_name,value,unit\nElectricity,1,kWh\n")
        stored = storage.store_original(raw, "rival.csv", "text/csv")
        submission = create_submission(
            db, project_id=rival.id, uploader_id=uploader.id, reporting_period="2026-Q1",
            original_filename="rival.csv", original_storage_key=stored.storage_key,
            processed_storage_key=stored.storage_key,
            original_sha256=calculate_sha256(BytesIO(b"x")))
        db.commit()
        other = submission.id
    login(client, "uploader@greenchain.test")

    response = client.put(f"/submissions/{other}/auditors",
                          json={"auditor_ids": _auditor_ids(client)})

    # Not found rather than forbidden: a refusal that confirms existence is a leak.
    assert response.status_code == 404
    assert response.json()["error"] == "SUBMISSION_NOT_FOUND"


@pytest.mark.parametrize("email", ["viewer@greenchain.test", "auditor@greenchain.test"])
def test_only_companies_may_assign_auditors(session_factory, storage, client: TestClient, email: str) -> None:
    """An auditor assigning itself would defeat the point of the assignment."""
    submission_id = seed_submission(session_factory, storage)
    login(client, email)
    assert client.put(f"/submissions/{submission_id}/auditors",
                      json={"auditor_ids": []}).status_code == 403
