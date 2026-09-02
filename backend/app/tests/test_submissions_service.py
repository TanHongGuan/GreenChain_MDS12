from io import BytesIO

import pytest
from fastapi import UploadFile
from openpyxl import Workbook

from backend.app.auth.models import UserRole
from backend.app.core.config import Settings
from backend.app.models.metric import Metric
from backend.app.models.project import Project
from backend.app.models.submission import Submission
from backend.app.storage.exceptions import StorageError
from backend.app.storage.local import LocalStorageService
from backend.app.submissions.service import (
    SubmissionProcessingError,
    SubmissionValidationError,
    process_submission,
)
from backend.app.tests.db_fixtures import build_session_factory, seed_test_auth_users

VALID_CSV = b"metric_name,value,unit,category\nElectricity,120.5,kWh,Energy\nWater,10,kL,Water\n"


def make_xlsx_bytes(rows: list[list[object]]) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    for row in rows:
        worksheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def upload(filename: str, content: bytes, content_type: str | None = None) -> UploadFile:
    headers = {"content-type": content_type} if content_type else None
    return UploadFile(file=BytesIO(content), filename=filename, headers=headers)


@pytest.fixture
def db(tmp_path):
    session_factory = build_session_factory(tmp_path / "submissions-tests.sqlite3")
    session = session_factory()
    seed_test_auth_users(session)
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def storage(tmp_path):
    return LocalStorageService(tmp_path / "storage")


@pytest.fixture
def settings():
    return Settings(MAX_UPLOAD_SIZE_MB=25, DATABASE_URL="sqlite:///:memory:")


def uploader_id(db) -> str:
    from backend.app.repositories.users import SQLAlchemyUserRepository

    user = SQLAlchemyUserRepository(db).get_user_by_email("uploader@greenchain.test")
    assert user is not None
    return user.id


@pytest.mark.anyio
async def test_valid_csv_processes_end_to_end(db, storage, settings) -> None:
    result = await process_submission(
        upload("report.csv", VALID_CSV, "text/csv"),
        "Green Tower",
        "Acme Corp",
        "2026-Q1",
        uploader_id(db),
        db=db,
        storage=storage,
        settings=settings,
    )

    assert result.submission_id
    assert result.status == "UNREVIEWED"


@pytest.mark.anyio
async def test_valid_xlsx_processes_end_to_end(db, storage, settings) -> None:
    raw = make_xlsx_bytes([["metric_name", "value", "unit"], ["Electricity", 120.5, "kWh"]])

    result = await process_submission(
        upload("report.xlsx", raw, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "Green Tower",
        "Acme Corp",
        "2026-Q1",
        uploader_id(db),
        db=db,
        storage=storage,
        settings=settings,
    )

    assert result.status == "UNREVIEWED"


@pytest.mark.anyio
async def test_original_bytes_are_preserved(db, storage, settings) -> None:
    await process_submission(
        upload("report.csv", VALID_CSV, "text/csv"),
        "Green Tower",
        "Acme Corp",
        "2026-Q1",
        uploader_id(db),
        db=db,
        storage=storage,
        settings=settings,
    )

    submission = db.query(Submission).one()
    assert storage.retrieve(submission.original_storage_key) == VALID_CSV


@pytest.mark.anyio
async def test_sha256_matches_original_file(db, storage, settings) -> None:
    from backend.app.integrity.hashing import calculate_sha256

    await process_submission(
        upload("report.csv", VALID_CSV, "text/csv"),
        "Green Tower",
        "Acme Corp",
        "2026-Q1",
        uploader_id(db),
        db=db,
        storage=storage,
        settings=settings,
    )

    submission = db.query(Submission).one()
    assert submission.original_sha256 == calculate_sha256(BytesIO(VALID_CSV))


@pytest.mark.anyio
async def test_cleaned_output_is_generated_and_stored(db, storage, settings) -> None:
    await process_submission(
        upload("report.csv", VALID_CSV, "text/csv"),
        "Green Tower",
        "Acme Corp",
        "2026-Q1",
        uploader_id(db),
        db=db,
        storage=storage,
        settings=settings,
    )

    submission = db.query(Submission).one()
    processed = storage.retrieve(submission.processed_storage_key)
    assert processed.startswith(b"metric_name,value,unit,category")


@pytest.mark.anyio
async def test_submission_record_persists_with_expected_fields(db, storage, settings) -> None:
    result = await process_submission(
        upload("report.csv", VALID_CSV, "text/csv"),
        "Green Tower",
        "Acme Corp",
        "2026-Q1",
        uploader_id(db),
        db=db,
        storage=storage,
        settings=settings,
    )

    submission = db.get(Submission, result.submission_id)
    assert submission is not None
    assert submission.reporting_period == "2026-Q1"
    assert submission.original_filename == "report.csv"

    project = db.get(Project, submission.project_id)
    assert project is not None
    assert project.name == "Green Tower"


@pytest.mark.anyio
async def test_metrics_persist(db, storage, settings) -> None:
    result = await process_submission(
        upload("report.csv", VALID_CSV, "text/csv"),
        "Green Tower",
        "Acme Corp",
        "2026-Q1",
        uploader_id(db),
        db=db,
        storage=storage,
        settings=settings,
    )

    metrics = db.query(Metric).filter(Metric.submission_id == result.submission_id).all()
    assert {metric.metric_name for metric in metrics} == {"Electricity", "Water"}


@pytest.mark.anyio
async def test_status_is_unreviewed(db, storage, settings) -> None:
    result = await process_submission(
        upload("report.csv", VALID_CSV, "text/csv"),
        "Green Tower",
        "Acme Corp",
        "2026-Q1",
        uploader_id(db),
        db=db,
        storage=storage,
        settings=settings,
    )

    assert result.status == "UNREVIEWED"


@pytest.mark.anyio
async def test_unsupported_file_is_rejected(db, storage, settings) -> None:
    with pytest.raises(SubmissionValidationError):
        await process_submission(
            upload("report.txt", b"hello", "text/plain"),
            "Green Tower",
            "Acme Corp",
            "2026-Q1",
            uploader_id(db),
            db=db,
            storage=storage,
            settings=settings,
        )


@pytest.mark.anyio
async def test_malformed_csv_is_rejected(db, storage, settings) -> None:
    malformed = b"metric_name,value,unit\nElectricity,1\n"

    with pytest.raises(SubmissionValidationError):
        await process_submission(
            upload("report.csv", malformed, "text/csv"),
            "Green Tower",
            "Acme Corp",
            "2026-Q1",
            uploader_id(db),
            db=db,
            storage=storage,
            settings=settings,
        )

    assert db.query(Submission).count() == 0


@pytest.mark.anyio
async def test_missing_required_columns_are_rejected(db, storage, settings) -> None:
    missing_unit = b"metric_name,value\nElectricity,1\n"

    with pytest.raises(SubmissionValidationError):
        await process_submission(
            upload("report.csv", missing_unit, "text/csv"),
            "Green Tower",
            "Acme Corp",
            "2026-Q1",
            uploader_id(db),
            db=db,
            storage=storage,
            settings=settings,
        )


@pytest.mark.anyio
async def test_invalid_values_are_rejected(db, storage, settings) -> None:
    invalid_value = b"metric_name,value,unit\nElectricity,not-a-number,kWh\n"

    with pytest.raises(SubmissionValidationError):
        await process_submission(
            upload("report.csv", invalid_value, "text/csv"),
            "Green Tower",
            "Acme Corp",
            "2026-Q1",
            uploader_id(db),
            db=db,
            storage=storage,
            settings=settings,
        )


@pytest.mark.anyio
async def test_storage_failure_does_not_report_success(db, storage, settings, monkeypatch) -> None:
    def boom(*args, **kwargs):
        raise StorageError("disk full")

    monkeypatch.setattr(storage, "store_original", boom)

    with pytest.raises(SubmissionProcessingError):
        await process_submission(
            upload("report.csv", VALID_CSV, "text/csv"),
            "Green Tower",
            "Acme Corp",
            "2026-Q1",
            uploader_id(db),
            db=db,
            storage=storage,
            settings=settings,
        )

    assert db.query(Submission).count() == 0


@pytest.mark.anyio
async def test_database_failure_does_not_report_success(db, storage, settings, monkeypatch) -> None:
    import backend.app.submissions.service as service_module

    def boom(*args, **kwargs):
        raise RuntimeError("connection lost")

    monkeypatch.setattr(service_module, "create_submission", boom)

    with pytest.raises(SubmissionProcessingError):
        await process_submission(
            upload("report.csv", VALID_CSV, "text/csv"),
            "Green Tower",
            "Acme Corp",
            "2026-Q1",
            uploader_id(db),
            db=db,
            storage=storage,
            settings=settings,
        )

    assert db.query(Submission).count() == 0
    assert db.query(Project).count() == 0


@pytest.mark.anyio
async def test_repeated_processing_does_not_overwrite_another_submission(db, storage, settings) -> None:
    first = await process_submission(
        upload("report.csv", VALID_CSV, "text/csv"),
        "Green Tower",
        "Acme Corp",
        "2026-Q1",
        uploader_id(db),
        db=db,
        storage=storage,
        settings=settings,
    )
    second = await process_submission(
        upload("report.csv", VALID_CSV, "text/csv"),
        "Green Tower",
        "Acme Corp",
        "2026-Q2",
        uploader_id(db),
        db=db,
        storage=storage,
        settings=settings,
    )

    assert first.submission_id != second.submission_id
    first_submission = db.get(Submission, first.submission_id)
    second_submission = db.get(Submission, second.submission_id)
    assert first_submission.original_storage_key != second_submission.original_storage_key
    assert storage.retrieve(first_submission.original_storage_key) == VALID_CSV
    assert storage.retrieve(second_submission.original_storage_key) == VALID_CSV


@pytest.mark.anyio
async def test_repeated_submissions_reuse_the_same_project(db, storage, settings) -> None:
    first = await process_submission(
        upload("report.csv", VALID_CSV, "text/csv"),
        "Green Tower",
        "Acme Corp",
        "2026-Q1",
        uploader_id(db),
        db=db,
        storage=storage,
        settings=settings,
    )
    second = await process_submission(
        upload("report.csv", VALID_CSV, "text/csv"),
        "Green Tower",
        "Acme Corp",
        "2026-Q2",
        uploader_id(db),
        db=db,
        storage=storage,
        settings=settings,
    )

    first_submission = db.get(Submission, first.submission_id)
    second_submission = db.get(Submission, second.submission_id)
    assert first_submission.project_id == second_submission.project_id
    assert db.query(Project).count() == 1


@pytest.fixture
def anyio_backend():
    return "asyncio"
