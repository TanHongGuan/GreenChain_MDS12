from io import BytesIO

import pytest

from backend.app.etl.transform import CanonicalMetricRow
from backend.app.integrity.hashing import calculate_sha256
from backend.app.models.review import Review
from backend.app.models.submission import (
    SUBMISSION_STATUS_APPROVED,
    SUBMISSION_STATUS_REJECTED,
    SUBMISSION_STATUS_UNREVIEWED,
    Submission,
)
from backend.app.repositories.metrics import bulk_create_metrics
from backend.app.repositories.projects import get_or_create_project
from backend.app.repositories.submissions import create_submission
from backend.app.repositories.users import SQLAlchemyUserRepository
from backend.app.reviews.errors import (
    EvidenceIntegrityMismatch,
    EvidenceNotFound,
    InvalidReviewTransition,
    SubmissionNotFound,
)
from backend.app.reviews.service import (
    decide_submission,
    ensure_integrity,
    get_original_evidence,
    get_processed_evidence,
    get_review_detail,
    list_pending_reviews,
    verify_original_integrity,
)
from backend.app.storage.local import LocalStorageService
from backend.app.tests.db_fixtures import build_session_factory, seed_test_auth_users

ORIGINAL_BYTES = b"metric_name,value,unit,category\nElectricity,120.5,kWh,Energy\n"
PROCESSED_BYTES = b"metric_name,value,unit,category\nElectricity,120.5,kWh,Energy\n"


@pytest.fixture
def session_factory(tmp_path):
    factory = build_session_factory(tmp_path / "reviews-tests.sqlite3")
    with factory() as db:
        seed_test_auth_users(db)
    return factory


@pytest.fixture
def db(session_factory):
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def storage(tmp_path):
    return LocalStorageService(tmp_path / "storage")


def user_id(db, email: str) -> str:
    user = SQLAlchemyUserRepository(db).get_user_by_email(email)
    assert user is not None
    return user.id


def make_submission(
    db,
    storage,
    *,
    reporting_period: str = "2026-Q1",
    original_bytes: bytes = ORIGINAL_BYTES,
) -> Submission:
    project = get_or_create_project(db, "Green Tower", "Acme Corp")
    original_file = storage.store_original(BytesIO(original_bytes), "report.csv", "text/csv")
    processed_file = storage.store_processed(BytesIO(PROCESSED_BYTES), "report.csv", "text/csv")
    submission = create_submission(
        db,
        project_id=project.id,
        uploader_id=user_id(db, "uploader@greenchain.test"),
        reporting_period=reporting_period,
        original_filename="report.csv",
        original_storage_key=original_file.storage_key,
        processed_storage_key=processed_file.storage_key,
        original_sha256=calculate_sha256(BytesIO(original_bytes)),
    )
    bulk_create_metrics(
        db,
        submission.id,
        [CanonicalMetricRow(metric_name="Electricity", value=120.5, unit="kWh", category="Energy")],
    )
    db.commit()
    return submission


def auditor_id(db) -> str:
    return user_id(db, "auditor@greenchain.test")


# --- pending queue -----------------------------------------------------------------


def test_pending_query_returns_unreviewed_only(db, storage) -> None:
    pending = make_submission(db, storage, reporting_period="2026-Q1")
    reviewed = make_submission(db, storage, reporting_period="2026-Q2")
    decide_submission(reviewed.id, SUBMISSION_STATUS_APPROVED, None, auditor_id(db), db=db)

    summaries = list_pending_reviews(db=db)

    assert [s.submission_id for s in summaries] == [pending.id]


def test_pending_summary_reflects_real_submission_data(db, storage) -> None:
    submission = make_submission(db, storage)

    [summary] = list_pending_reviews(db=db)

    assert summary.project_name == "Green Tower"
    assert summary.organisation_name == "Acme Corp"
    assert summary.reporting_period == "2026-Q1"
    assert summary.submitted_by.name == "GreenChain Uploader"
    assert summary.submitted_by.email == "uploader@greenchain.test"
    assert summary.status == SUBMISSION_STATUS_UNREVIEWED
    assert summary.submission_id == submission.id


# --- review detail -------------------------------------------------------------------


def test_review_detail_returns_correct_submission_and_metrics(db, storage) -> None:
    submission = make_submission(db, storage)

    detail = get_review_detail(submission.id, db=db)

    assert detail.submission_id == submission.id
    assert detail.project_name == "Green Tower"
    assert detail.organisation_name == "Acme Corp"
    assert detail.original_filename == "report.csv"
    assert detail.original_sha256 == calculate_sha256(BytesIO(ORIGINAL_BYTES))
    assert [m.metric_name for m in detail.metrics] == ["Electricity"]
    assert detail.existing_review is None


def test_review_detail_includes_existing_review_once_decided(db, storage) -> None:
    submission = make_submission(db, storage)
    decide_submission(submission.id, SUBMISSION_STATUS_APPROVED, "looks good", auditor_id(db), db=db)

    detail = get_review_detail(submission.id, db=db)

    assert detail.status == SUBMISSION_STATUS_APPROVED
    assert detail.existing_review is not None
    assert detail.existing_review.decision == SUBMISSION_STATUS_APPROVED
    assert detail.existing_review.reason == "looks good"


def test_review_detail_missing_submission_raises(db, storage) -> None:
    with pytest.raises(SubmissionNotFound):
        get_review_detail(999999, db=db)


# --- decision transitions -------------------------------------------------------------


def test_unreviewed_to_approved_succeeds(db, storage) -> None:
    submission = make_submission(db, storage)

    result = decide_submission(submission.id, SUBMISSION_STATUS_APPROVED, None, auditor_id(db), db=db)

    assert result.status == SUBMISSION_STATUS_APPROVED
    assert db.get(Submission, submission.id).status == SUBMISSION_STATUS_APPROVED


def test_unreviewed_to_rejected_succeeds(db, storage) -> None:
    submission = make_submission(db, storage)

    result = decide_submission(submission.id, SUBMISSION_STATUS_REJECTED, "missing data", auditor_id(db), db=db)

    assert result.status == SUBMISSION_STATUS_REJECTED
    assert db.get(Submission, submission.id).status == SUBMISSION_STATUS_REJECTED


def test_reviewer_id_persists(db, storage) -> None:
    submission = make_submission(db, storage)
    reviewer = auditor_id(db)

    result = decide_submission(submission.id, SUBMISSION_STATUS_APPROVED, None, reviewer, db=db)

    review = db.get(Review, result.review_id)
    assert review.reviewer_id == reviewer


def test_reviewed_at_persists(db, storage) -> None:
    submission = make_submission(db, storage)

    result = decide_submission(submission.id, SUBMISSION_STATUS_APPROVED, None, auditor_id(db), db=db)

    review = db.get(Review, result.review_id)
    assert review.reviewed_at is not None


def test_reason_persists_when_provided(db, storage) -> None:
    submission = make_submission(db, storage)

    result = decide_submission(submission.id, SUBMISSION_STATUS_REJECTED, "bad metrics", auditor_id(db), db=db)

    review = db.get(Review, result.review_id)
    assert review.reason == "bad metrics"


def test_unknown_decision_is_rejected(db, storage) -> None:
    submission = make_submission(db, storage)

    with pytest.raises(InvalidReviewTransition):
        decide_submission(submission.id, "MAYBE", None, auditor_id(db), db=db)


def test_approved_cannot_be_reviewed_again(db, storage) -> None:
    submission = make_submission(db, storage)
    decide_submission(submission.id, SUBMISSION_STATUS_APPROVED, None, auditor_id(db), db=db)

    with pytest.raises(InvalidReviewTransition):
        decide_submission(submission.id, SUBMISSION_STATUS_REJECTED, None, auditor_id(db), db=db)

    assert db.query(Review).filter(Review.submission_id == submission.id).count() == 1


def test_rejected_cannot_be_reviewed_again(db, storage) -> None:
    submission = make_submission(db, storage)
    decide_submission(submission.id, SUBMISSION_STATUS_REJECTED, None, auditor_id(db), db=db)

    with pytest.raises(InvalidReviewTransition):
        decide_submission(submission.id, SUBMISSION_STATUS_APPROVED, None, auditor_id(db), db=db)

    assert db.query(Review).filter(Review.submission_id == submission.id).count() == 1


def test_missing_submission_decision_raises(db, storage) -> None:
    with pytest.raises(SubmissionNotFound):
        decide_submission(999999, SUBMISSION_STATUS_APPROVED, None, auditor_id(db), db=db)


def test_two_concurrent_decisions_cannot_both_succeed(db, storage, session_factory) -> None:
    submission = make_submission(db, storage)

    session_a = session_factory()
    session_b = session_factory()
    try:
        result_a = decide_submission(submission.id, SUBMISSION_STATUS_APPROVED, None, auditor_id(session_a), db=session_a)

        with pytest.raises(InvalidReviewTransition):
            decide_submission(submission.id, SUBMISSION_STATUS_REJECTED, None, auditor_id(session_b), db=session_b)

        assert result_a.status == SUBMISSION_STATUS_APPROVED
        reviews = session_b.query(Review).filter(Review.submission_id == submission.id).all()
        assert len(reviews) == 1
        assert reviews[0].decision == SUBMISSION_STATUS_APPROVED
    finally:
        session_a.close()
        session_b.close()


def test_failed_decision_leaves_no_partial_review(db, storage, monkeypatch) -> None:
    submission = make_submission(db, storage)

    import backend.app.reviews.service as service_module

    def boom(*_args, **_kwargs):
        raise RuntimeError("connection lost")

    monkeypatch.setattr(service_module, "create_review", boom)

    with pytest.raises(Exception):
        decide_submission(submission.id, SUBMISSION_STATUS_APPROVED, None, auditor_id(db), db=db)

    db.rollback()
    refreshed = db.get(Submission, submission.id)
    assert refreshed.status == SUBMISSION_STATUS_UNREVIEWED
    assert db.query(Review).filter(Review.submission_id == submission.id).count() == 0


# --- evidence retrieval ----------------------------------------------------------------


def test_original_evidence_resolves_from_submission_metadata(db, storage) -> None:
    submission = make_submission(db, storage)

    evidence = get_original_evidence(submission.id, db=db, storage=storage)

    assert evidence.filename == "report.csv"
    assert evidence.content == ORIGINAL_BYTES


def test_processed_evidence_resolves_from_submission_metadata(db, storage) -> None:
    submission = make_submission(db, storage)

    evidence = get_processed_evidence(submission.id, db=db, storage=storage)

    assert evidence.content == PROCESSED_BYTES


def test_evidence_missing_submission_raises(db, storage) -> None:
    with pytest.raises(SubmissionNotFound):
        get_original_evidence(999999, db=db, storage=storage)


def test_missing_evidence_fails_safely(db, storage) -> None:
    submission = make_submission(db, storage)
    storage.delete_if_allowed(submission.original_storage_key)

    with pytest.raises(EvidenceNotFound):
        get_original_evidence(submission.id, db=db, storage=storage)


def test_tampered_storage_key_cannot_escape_storage_root(db, storage) -> None:
    submission = make_submission(db, storage)
    submission.original_storage_key = "../../etc/passwd"
    db.commit()

    with pytest.raises(EvidenceNotFound):
        get_original_evidence(submission.id, db=db, storage=storage)


# --- integrity verification -------------------------------------------------------------


def test_sha256_match_reports_valid(db, storage) -> None:
    submission = make_submission(db, storage)

    result = verify_original_integrity(submission.id, db=db, storage=storage)

    assert result.matches is True
    assert result.expected_hash == result.actual_hash
    ensure_integrity(result)


def test_sha256_mismatch_is_detected(db, storage) -> None:
    submission = make_submission(db, storage)
    tampered_path = storage._path_for_key(submission.original_storage_key)
    tampered_path.write_bytes(b"tampered content")

    result = verify_original_integrity(submission.id, db=db, storage=storage)

    assert result.matches is False
    assert result.expected_hash != result.actual_hash
    with pytest.raises(EvidenceIntegrityMismatch):
        ensure_integrity(result)


def test_integrity_check_missing_evidence_fails_safely(db, storage) -> None:
    submission = make_submission(db, storage)
    storage.delete_if_allowed(submission.original_storage_key)

    with pytest.raises(EvidenceNotFound):
        verify_original_integrity(submission.id, db=db, storage=storage)
