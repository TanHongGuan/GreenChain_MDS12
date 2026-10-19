"""End-to-end submission → S3 evidence version → verification, using moto in place of AWS."""

import hashlib
import logging
from io import BytesIO

import pytest
from fastapi import UploadFile

from backend.app.core.config import Settings
from backend.app.models.submission import Submission
from backend.app.repositories.users import SQLAlchemyUserRepository
from backend.app.reviews.service import verify_original_integrity as review_verify_original_integrity
from backend.app.storage.exceptions import ObjectLocked
from backend.app.storage.local import LocalStorageService
from backend.app.submissions.errors import EvidenceIntegrityMismatch
from backend.app.submissions.service import SubmissionProcessingError, process_submission
from backend.app.submissions.traceability import (
    ARTIFACT_ORIGINAL,
    ARTIFACT_PROCESSED,
    get_evidence,
    get_submission_detail,
    verify_original_integrity,
)
from backend.app.tests.db_fixtures import build_session_factory, seed_test_auth_users
from backend.app.tests.s3_fixtures import TEST_BUCKET, s3_client, s3_storage  # noqa: F401

VALID_CSV = b"metric_name,value,unit,category\nelectricity_consumption,366300,kWh,Energy\nwater_consumption,5415,m3,Water\n"


@pytest.fixture
def db(tmp_path):
    session = build_session_factory(tmp_path / "s3-flow.sqlite3")()
    seed_test_auth_users(session)
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def settings():
    return Settings(MAX_UPLOAD_SIZE_MB=25, DATABASE_URL="sqlite:///:memory:")


def user(db, email: str):
    found = SQLAlchemyUserRepository(db).get_user_by_email(email)
    assert found is not None
    return found


def upload(content: bytes = VALID_CSV) -> UploadFile:
    return UploadFile(file=BytesIO(content), filename="bayview.csv", headers={"content-type": "text/csv"})


async def submit(db, storage, settings) -> Submission:
    result = await process_submission(
        upload(),
        "Bayview Tower",
        "GreenChain Demo Organisation",
        "2026-Q1",
        user(db, "uploader@greenchain.test").id,
        db=db,
        storage=storage,
        settings=settings,
    )
    return db.get(Submission, result.submission_id)


@pytest.mark.anyio
async def test_submission_persists_exact_s3_versions_and_retention(db, s3_storage, settings, s3_client) -> None:
    submission = await submit(db, s3_storage, settings)

    assert submission.storage_backend == "s3"
    assert submission.original_version_id
    assert submission.processed_version_id
    assert submission.original_retention_mode == "GOVERNANCE"
    assert submission.original_retain_until is not None
    assert submission.processed_retention_mode == "GOVERNANCE"
    assert submission.original_sha256 == hashlib.sha256(VALID_CSV).hexdigest()
    assert submission.processed_sha256 is not None

    stored = s3_client.get_object(
        Bucket=TEST_BUCKET, Key=submission.original_storage_key, VersionId=submission.original_version_id
    )["Body"].read()
    assert stored == VALID_CSV


@pytest.mark.anyio
async def test_detail_reports_verified_s3_evidence(db, s3_storage, settings) -> None:
    submission = await submit(db, s3_storage, settings)
    viewer = user(db, "viewer@greenchain.test")

    detail = get_submission_detail(submission.id, viewer, db=db, storage=s3_storage)
    original = detail.evidence[ARTIFACT_ORIGINAL]
    processed = detail.evidence[ARTIFACT_PROCESSED]

    assert original.storage_backend == "s3"
    assert original.version_id == submission.original_version_id
    assert original.retention_mode == "GOVERNANCE"
    assert original.integrity.status == "MATCH"
    assert original.integrity.trusted_reference == "STORAGE_CHECKSUM"
    assert processed.integrity.status == "MATCH"


@pytest.mark.anyio
async def test_overwriting_the_key_does_not_change_what_the_submission_serves(db, s3_storage, settings, s3_client) -> None:
    submission = await submit(db, s3_storage, settings)
    viewer = user(db, "viewer@greenchain.test")
    s3_client.put_object(Bucket=TEST_BUCKET, Key=submission.original_storage_key, Body=b"tampered latest version")

    evidence = get_evidence(submission.id, ARTIFACT_ORIGINAL, viewer, db=db, storage=s3_storage)

    assert evidence.content == VALID_CSV
    assert evidence.integrity.status == "MATCH"
    assert evidence.integrity.version_id == submission.original_version_id


@pytest.mark.anyio
async def test_edited_database_digest_is_detected_and_download_refused(db, s3_storage, settings) -> None:
    submission = await submit(db, s3_storage, settings)
    viewer = user(db, "viewer@greenchain.test")
    submission.original_sha256 = hashlib.sha256(b"forged").hexdigest()
    db.commit()

    result = verify_original_integrity(submission.id, viewer, db=db, storage=s3_storage)
    review_result = review_verify_original_integrity(submission.id, db=db, storage=s3_storage)

    assert result.matches is False
    assert result.status == "MISMATCH"
    assert result.storage_hash == hashlib.sha256(VALID_CSV).hexdigest()
    assert review_result.matches is False
    with pytest.raises(EvidenceIntegrityMismatch):
        get_evidence(submission.id, ARTIFACT_ORIGINAL, viewer, db=db, storage=s3_storage)


@pytest.mark.anyio
async def test_submission_evidence_cannot_be_deleted(db, s3_storage, settings) -> None:
    submission = await submit(db, s3_storage, settings)

    with pytest.raises(ObjectLocked):
        s3_storage.delete_if_allowed(submission.original_storage_key, submission.original_version_id)
    with pytest.raises(ObjectLocked):
        s3_storage.delete_if_allowed(submission.processed_storage_key, submission.processed_version_id)


@pytest.mark.anyio
async def test_database_failure_leaves_locked_orphans_logged_not_referenced(
    db, s3_storage, settings, s3_client, monkeypatch, caplog
) -> None:
    import backend.app.submissions.service as service_module

    def boom(*args, **kwargs):
        raise RuntimeError("connection lost")

    monkeypatch.setattr(service_module, "create_submission", boom)

    with caplog.at_level(logging.WARNING), pytest.raises(SubmissionProcessingError):
        await submit(db, s3_storage, settings)

    assert db.query(Submission).count() == 0
    versions = s3_client.list_object_versions(Bucket=TEST_BUCKET).get("Versions", [])
    assert len(versions) == 2  # original + processed retained by Object Lock
    assert "Unreferenced evidence retained" in caplog.text


@pytest.mark.anyio
async def test_local_database_failure_removes_both_stored_files(db, tmp_path, settings, monkeypatch) -> None:
    import backend.app.submissions.service as service_module

    storage = LocalStorageService(tmp_path / "storage")
    monkeypatch.setattr(service_module, "create_submission", lambda *a, **k: (_ for _ in ()).throw(RuntimeError()))

    with pytest.raises(SubmissionProcessingError):
        await submit(db, storage, settings)

    assert [path for path in storage.root.rglob("*") if path.is_file()] == []


@pytest.mark.anyio
async def test_local_submission_records_backend_and_processed_digest(db, tmp_path, settings) -> None:
    storage = LocalStorageService(tmp_path / "storage")

    submission = await submit(db, storage, settings)

    assert submission.storage_backend == "local"
    assert submission.original_version_id is None
    assert submission.processed_sha256 == hashlib.sha256(
        storage.retrieve(submission.processed_storage_key)
    ).hexdigest()
