from io import BytesIO

import pytest

from backend.app.auth.models import AuthUser
from backend.app.etl.transform import CanonicalMetricRow
from backend.app.integrity.hashing import calculate_sha256
from backend.app.models.submission import SUBMISSION_STATUS_APPROVED, Submission
from backend.app.repositories.metrics import bulk_create_metrics
from backend.app.repositories.projects import get_or_create_project
from backend.app.repositories.submissions import create_submission
from backend.app.repositories.users import SQLAlchemyUserRepository
from backend.app.reviews.service import decide_submission
from backend.app.storage.local import LocalStorageService
from backend.app.submissions.errors import EvidenceIntegrityMismatch, EvidenceNotFound, InvalidArtifactType
from backend.app.submissions.traceability import (
    ARTIFACT_AUDIT_REPORT,
    ARTIFACT_ORIGINAL,
    ARTIFACT_PROCESSED,
    ensure_integrity,
    get_evidence,
    get_submission_detail,
    get_submission_history,
    verify_original_integrity,
)
from backend.app.tests.db_fixtures import build_session_factory, seed_test_auth_users

ORIGINAL_BYTES = b"metric_name,value,unit,category\nElectricity,120.5,kWh,Energy\n"
CORRECTED_BYTES = b"metric_name,value,unit,category\nElectricity,98.2,kWh,Energy\n"
PROCESSED_BYTES = b"metric_name,value,unit,category\nElectricity,120.5,kWh,Energy\n"


@pytest.fixture
def db(tmp_path):
    factory = build_session_factory(tmp_path / "traceability-tests.sqlite3")
    session = factory()
    seed_test_auth_users(session)
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def storage(tmp_path):
    return LocalStorageService(tmp_path / "storage")


def auth_user(db, email: str) -> AuthUser:
    user = SQLAlchemyUserRepository(db).get_user_by_email(email)
    assert user is not None
    return user


def make_submission(
    db,
    storage,
    *,
    reporting_period: str,
    original_bytes: bytes = ORIGINAL_BYTES,
    previous_submission_id: int | None = None,
) -> Submission:
    project = get_or_create_project(db, "Green Tower", "Acme Corp")
    original_file = storage.store_original(BytesIO(original_bytes), f"{reporting_period}.csv", "text/csv")
    processed_file = storage.store_processed(BytesIO(PROCESSED_BYTES), f"{reporting_period}.csv", "text/csv")
    submission = create_submission(
        db,
        project_id=project.id,
        uploader_id=auth_user(db, "uploader@greenchain.test").id,
        reporting_period=reporting_period,
        original_filename=f"{reporting_period}.csv",
        original_storage_key=original_file.storage_key,
        processed_storage_key=processed_file.storage_key,
        original_sha256=calculate_sha256(BytesIO(original_bytes)),
        previous_submission_id=previous_submission_id,
    )
    bulk_create_metrics(
        db,
        submission.id,
        [CanonicalMetricRow(metric_name="Electricity", value=120.5, unit="kWh", category="Energy")],
    )
    db.commit()
    return submission


def test_submission_history_returns_all_versions_with_evidence_metadata(db, storage) -> None:
    viewer = auth_user(db, "viewer@greenchain.test")
    original = make_submission(db, storage, reporting_period="2026-Q1")
    correction = make_submission(
        db,
        storage,
        reporting_period="2026-Q1 corrected",
        original_bytes=CORRECTED_BYTES,
        previous_submission_id=original.id,
    )

    history = get_submission_history(original.project_id, viewer, db=db, storage=storage)

    assert [record.submission_id for record in history] == [correction.id, original.id]
    assert history[0].previous_submission.submission_id == original.id
    assert history[1].corrected_by[0].submission_id == correction.id
    assert history[0].evidence[ARTIFACT_ORIGINAL].available is True
    assert history[0].evidence[ARTIFACT_PROCESSED].available is True
    assert history[0].evidence[ARTIFACT_AUDIT_REPORT].available is False


def test_submission_detail_traces_metric_to_source_submission(db, storage) -> None:
    viewer = auth_user(db, "viewer@greenchain.test")
    submission = make_submission(db, storage, reporting_period="2026-Q1")

    detail = get_submission_detail(submission.id, viewer, db=db, storage=storage)

    assert detail.submission_id == submission.id
    assert detail.metrics[0].submission_id == submission.id
    assert detail.metrics[0].reporting_period == "2026-Q1"
    assert detail.evidence[ARTIFACT_ORIGINAL].sha256 == calculate_sha256(BytesIO(ORIGINAL_BYTES))


def test_original_and_processed_evidence_resolve_to_correct_submission(db, storage) -> None:
    viewer = auth_user(db, "viewer@greenchain.test")
    first = make_submission(db, storage, reporting_period="2026-Q1", original_bytes=ORIGINAL_BYTES)
    second = make_submission(db, storage, reporting_period="2026-Q2", original_bytes=CORRECTED_BYTES)

    first_original = get_evidence(first.id, ARTIFACT_ORIGINAL, viewer, db=db, storage=storage)
    second_original = get_evidence(second.id, ARTIFACT_ORIGINAL, viewer, db=db, storage=storage)
    processed = get_evidence(first.id, ARTIFACT_PROCESSED, viewer, db=db, storage=storage)

    assert first_original.content == ORIGINAL_BYTES
    assert second_original.content == CORRECTED_BYTES
    assert processed.content == PROCESSED_BYTES


def test_audit_report_resolves_from_persisted_review(db, storage) -> None:
    auditor = auth_user(db, "auditor@greenchain.test")
    submission = make_submission(db, storage, reporting_period="2026-Q1")
    decide_submission(submission.id, SUBMISSION_STATUS_APPROVED, "verified", auditor.id, db=db)

    report = get_evidence(submission.id, ARTIFACT_AUDIT_REPORT, auditor, db=db, storage=storage)

    assert report.content_type.startswith("text/plain")
    assert b"Decision: APPROVED" in report.content
    assert b"Reason: verified" in report.content


def test_missing_audit_report_fails_safely(db, storage) -> None:
    viewer = auth_user(db, "viewer@greenchain.test")
    submission = make_submission(db, storage, reporting_period="2026-Q1")

    with pytest.raises(EvidenceNotFound):
        get_evidence(submission.id, ARTIFACT_AUDIT_REPORT, viewer, db=db, storage=storage)


def test_invalid_artifact_type_is_rejected(db, storage) -> None:
    viewer = auth_user(db, "viewer@greenchain.test")
    submission = make_submission(db, storage, reporting_period="2026-Q1")

    with pytest.raises(InvalidArtifactType):
        get_evidence(submission.id, "../original", viewer, db=db, storage=storage)


def test_hash_mismatch_is_detected_without_rewriting_hash(db, storage) -> None:
    viewer = auth_user(db, "viewer@greenchain.test")
    submission = make_submission(db, storage, reporting_period="2026-Q1")
    stored_hash = submission.original_sha256
    path = storage._path_for_key(submission.original_storage_key)
    path.write_bytes(b"tampered")

    result = verify_original_integrity(submission.id, viewer, db=db, storage=storage)

    assert result.matches is False
    assert result.expected_hash == stored_hash
    assert db.get(Submission, submission.id).original_sha256 == stored_hash
    with pytest.raises(EvidenceIntegrityMismatch):
        ensure_integrity(result)


def test_path_traversal_storage_key_cannot_escape_root(db, storage) -> None:
    viewer = auth_user(db, "viewer@greenchain.test")
    submission = make_submission(db, storage, reporting_period="2026-Q1")
    submission.original_storage_key = "../secret.txt"
    db.commit()

    with pytest.raises(EvidenceNotFound):
        get_evidence(submission.id, ARTIFACT_ORIGINAL, viewer, db=db, storage=storage)


def test_correction_preserves_old_metrics_evidence_and_review(db, storage) -> None:
    auditor = auth_user(db, "auditor@greenchain.test")
    viewer = auth_user(db, "viewer@greenchain.test")
    original = make_submission(db, storage, reporting_period="2026-Q1", original_bytes=ORIGINAL_BYTES)
    original_key = original.original_storage_key
    original_hash = original.original_sha256
    decide_submission(original.id, SUBMISSION_STATUS_APPROVED, "accepted", auditor.id, db=db)

    correction = make_submission(
        db,
        storage,
        reporting_period="2026-Q1 correction",
        original_bytes=CORRECTED_BYTES,
        previous_submission_id=original.id,
    )

    old_detail = get_submission_detail(original.id, viewer, db=db, storage=storage)
    new_detail = get_submission_detail(correction.id, viewer, db=db, storage=storage)

    assert old_detail.review.decision == SUBMISSION_STATUS_APPROVED
    assert db.get(Submission, original.id).original_storage_key == original_key
    assert db.get(Submission, original.id).original_sha256 == original_hash
    assert get_evidence(original.id, ARTIFACT_ORIGINAL, viewer, db=db, storage=storage).content == ORIGINAL_BYTES
    assert new_detail.previous_submission.submission_id == original.id
    assert new_detail.status == "UNREVIEWED"
