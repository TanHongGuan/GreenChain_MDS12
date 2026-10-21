"""The Monosh demonstration seed, run end to end through the real API.

SQLite and local evidence storage stand in for PostgreSQL and S3; every other
part (routes, auth, ETL, storage service, hashing, review rules) is the real one.
"""

from collections import Counter
from decimal import Decimal
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.auth.models import UserRole
from backend.app.auth.security import hash_password
from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.demo.monosh import BUILDINGS, ORGANISATION, SUBMISSIONS
from backend.app.integrity.hashing import calculate_sha256
from backend.app.integrity.verification import IntegrityStatus, verify_stored_evidence
from backend.app.main import create_app
from backend.app.models.metric import Metric
from backend.app.models.monthly_record import MonthlyRecord
from backend.app.models.organisation import Organisation
from backend.app.models.organisation_member import OrganisationMember
from backend.app.models.project import Project
from backend.app.models.review import Review
from backend.app.models.submission import Submission
from backend.app.models.submission_auditor import SubmissionAuditor
from backend.app.models.user import User
from backend.app.repositories.submissions import create_submission
from backend.app.repositories.users import get_user_repository, normalize_email
from backend.app.scripts import seed_demo_monosh
from backend.app.scripts.seed_auth import AUDITORS, COMPANIES
from backend.app.storage.dependencies import get_storage_service
from backend.app.storage.local import LocalStorageService
from backend.app.tests.db_fixtures import build_session_factory, install_repository_override

PASSWORD = "demo-password"
AUDITOR_EMAILS = sorted(email for _, email in AUDITORS)


@pytest.fixture(autouse=True)
def demo_settings(monkeypatch):
    monkeypatch.setenv("DEV_SEED_PASSWORD", PASSWORD)
    monkeypatch.setenv("ENVIRONMENT", "development")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def session_factory(tmp_path):
    factory = build_session_factory(tmp_path / "demo-seed.sqlite3")
    with factory() as db:
        password_hash = hash_password(PASSWORD)
        # The accounts seed_auth creates: two companies, three auditors, a viewer.
        for organisation_name, account_name, email in COMPANIES:
            organisation = Organisation(name=organisation_name)
            company = User(name=account_name, email=normalize_email(email), role=UserRole.UPLOADER.value,
                           password_hash=password_hash)
            db.add_all([organisation, company])
            db.flush()
            db.add(OrganisationMember(user_id=company.id, organisation_id=organisation.id))
        for name, email in AUDITORS:
            db.add(User(name=name, email=email, role=UserRole.AUDITOR.value, password_hash=password_hash))
        db.add(User(name="GreenChain Viewer", email="viewer@greenchain.test", role=UserRole.VIEWER.value,
                    password_hash=password_hash))
        db.commit()
    return factory


@pytest.fixture
def storage(tmp_path):
    return LocalStorageService(tmp_path / "storage")


@pytest.fixture
def app(session_factory, storage):
    test_app = create_app()
    install_repository_override(test_app, get_user_repository, session_factory)

    def db_override():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    test_app.dependency_overrides[get_db] = db_override
    test_app.dependency_overrides[get_storage_service] = lambda: storage
    return test_app


@pytest.fixture
def seeded(app):
    return seed_demo_monosh.seed_demo(app)


def signed_in(app, email: str) -> TestClient:
    client = TestClient(app, base_url="https://testserver")
    assert client.post("/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200
    return client


# --- 3, 4, 5: exactly two buildings and five approved submissions -------------------


def test_seed_creates_exactly_two_buildings_and_five_approved_submissions(seeded, session_factory) -> None:
    with session_factory() as db:
        projects = db.scalars(select(Project)).all()
        assert sorted(project.name for project in projects) == sorted(building.name for building in BUILDINGS)
        assert {project.organisation.name for project in projects} == {ORGANISATION}

        submissions = db.scalars(select(Submission)).all()
        assert len(submissions) == 5
        assert {item.status for item in submissions} == {"APPROVED"}
        by_building = Counter((item.project.name, item.reporting_period) for item in submissions)
        assert by_building == Counter({
            ("Monosh Science Building", "2026-Q1"): 1, ("Monosh Science Building", "2026-Q2"): 1,
            ("Monosh Science Building", "2026-Q3"): 1,
            ("Monosh Engineering Hall", "2026-Q1"): 1, ("Monosh Engineering Hall", "2026-Q2"): 1,
        })
        assert all(item.input_format == "MONTHLY_AI_MAPPED" and item.mapping_json for item in submissions)


# --- 6, 7: every auditor used, and the assigned auditor is the one who approved -------


def test_each_submission_has_one_auditor_who_is_also_its_reviewer(seeded, session_factory) -> None:
    with session_factory() as db:
        reviewers = []
        for submission in db.scalars(select(Submission)).all():
            assigned = db.scalars(select(SubmissionAuditor).where(SubmissionAuditor.submission_id == submission.id)).all()
            reviews = db.scalars(select(Review).where(Review.submission_id == submission.id)).all()
            assert len(assigned) == 1 and len(reviews) == 1
            assert reviews[0].reviewer_id == assigned[0].auditor_id
            assert reviews[0].decision == "APPROVED" and reviews[0].reviewed_at is not None
            assert "Simulated" in reviews[0].reason and "not independent" in reviews[0].reason
            reviewers.append(db.get(User, reviews[0].reviewer_id).email)
        assert sorted(set(reviewers)) == AUDITOR_EMAILS


def test_auditor_plan_is_fixed_and_uses_every_auditor() -> None:
    first = seed_demo_monosh.auditor_plan(AUDITOR_EMAILS)
    assert first == seed_demo_monosh.auditor_plan(list(reversed(AUDITOR_EMAILS)))
    assert len(first) == 5 and set(first.values()) == set(AUDITOR_EMAILS)


# --- 8: monthly and quarterly figures agree, and match the expected totals ------------


def test_monthly_records_sum_to_quarterly_metrics_and_expected_totals(seeded, session_factory) -> None:
    expected = {(item.building, item.reporting_period): item for item in SUBMISSIONS}
    with session_factory() as db:
        for submission in db.scalars(select(Submission)).all():
            months = db.scalars(select(MonthlyRecord).where(MonthlyRecord.submission_id == submission.id)).all()
            assert sorted(row.reporting_period for row in months) == [
                f"2026-{month:02d}" for month in range((int(submission.reporting_period[-1]) - 1) * 3 + 1,
                                                       (int(submission.reporting_period[-1]) - 1) * 3 + 4)]
            metrics = {metric.metric_name: metric for metric in
                       db.scalars(select(Metric).where(Metric.submission_id == submission.id)).all()}
            item = expected[(submission.project.name, submission.reporting_period)]
            for name, field, target, unit in (
                ("Electricity", "electricity_kwh", item.expected_electricity_kwh, "kWh"),
                ("Water", "water_m3", item.expected_water_m3, "m3"),
                ("CO2e", "co2_tco2e", item.expected_co2_tco2e, "tCO2e"),
            ):
                monthly_total = sum(Decimal(str(getattr(row, field))) for row in months)
                assert monthly_total == Decimal(target)
                assert metrics[name].unit == unit
                assert Decimal(str(metrics[name].value)) == pytest.approx(Decimal(target))


# --- 9: SHA-256 recorded for, and matching, the evidence actually stored -------------


def test_stored_evidence_matches_recorded_hashes(seeded, session_factory, storage) -> None:
    pinned = {item.filename: item.sha256 for item in SUBMISSIONS}
    with session_factory() as db:
        for submission in db.scalars(select(Submission)).all():
            assert submission.original_sha256 == pinned[submission.original_filename]
            original = storage.retrieve(submission.original_storage_key, submission.original_version_id)
            processed = storage.retrieve(submission.processed_storage_key, submission.processed_version_id)
            assert calculate_sha256(BytesIO(original)) == submission.original_sha256
            assert calculate_sha256(BytesIO(processed)) == submission.processed_sha256
            check = verify_stored_evidence(storage, submission.original_storage_key,
                                           submission.original_version_id, submission.original_sha256)
            assert check.status == IntegrityStatus.MATCH


# --- 11: a second run (a restart) changes nothing -------------------------------------


def test_running_again_creates_nothing_and_changes_no_assignment(app, seeded, session_factory) -> None:
    with session_factory() as db:
        before = sorted((row.submission_id, row.auditor_id) for row in db.scalars(select(SubmissionAuditor)).all())
        review_ids = sorted(db.scalars(select(Review.id)).all())
    notes = seed_demo_monosh.seed_demo(app)
    assert any("already exists" in note for note in notes)
    assert sum("already approved" in note for note in notes) == 5
    with session_factory() as db:
        assert len(db.scalars(select(Project)).all()) == 2
        assert len(db.scalars(select(Submission)).all()) == 5
        assert sorted(db.scalars(select(Review.id)).all()) == review_ids
        assert sorted((row.submission_id, row.auditor_id)
                      for row in db.scalars(select(SubmissionAuditor)).all()) == before


# --- auditor history -----------------------------------------------------------------


def test_each_auditor_sees_their_own_past_decisions(app, seeded, session_factory) -> None:
    seen = 0
    for email in AUDITOR_EMAILS:
        client = signed_in(app, email)
        decisions = client.get("/reviews/submissions/decided").json()["decisions"]
        assert decisions, f"{email} has no decisions"
        assert {item["decision"] for item in decisions} == {"APPROVED"}
        seen += len(decisions)
        # The detail of their own past decision stays readable to them.
        assert client.get(f"/reviews/submissions/{decisions[0]['submission_id']}").status_code == 200
        assert client.get("/reviews/submissions/pending").json()["submissions"] == []
    assert seen == 5


# --- 10, 12: viewers get approved data only; comparisons see both buildings ------------


def test_viewer_gets_approved_points_only_even_when_asking_for_unreviewed(app, seeded, session_factory) -> None:
    with session_factory() as db:
        science = db.scalars(select(Project).where(Project.name == "Monosh Science Building")).one()
        company = db.scalars(select(User).where(User.email == "monosh@greenchain.test")).one()
        # An extra unreviewed quarter, outside the seed, to prove the filter.
        pending = create_submission(
            db, project_id=science.id, uploader_id=company.id, reporting_period="2026-Q4",
            original_filename="q4.csv", original_storage_key="original/q4", processed_storage_key="processed/q4",
            original_sha256="0" * 64,
        )
        db.add(Metric(submission_id=pending.id, metric_name="Electricity", value=1.0, unit="kWh", category=None))
        db.commit()
        science_id = science.id

    path = f"/projects/{science_id}/metrics/Electricity/history?include_unreviewed=true"
    viewer_points = signed_in(app, "viewer@greenchain.test").get(path).json()["points"]
    company_points = signed_in(app, "monosh@greenchain.test").get(path).json()["points"]
    assert [point["reporting_period"] for point in viewer_points] == ["2026-Q1", "2026-Q2", "2026-Q3"]
    assert {point["status"] for point in viewer_points} == {"APPROVED"}
    assert "2026-Q4" in [point["reporting_period"] for point in company_points]


def test_engineering_has_no_third_quarter_and_both_buildings_report_q1_q2(app, seeded, session_factory) -> None:
    viewer = signed_in(app, "viewer@greenchain.test")
    with session_factory() as db:
        ids = {project.name: project.id for project in db.scalars(select(Project)).all()}
    periods = {
        name: [point["reporting_period"] for point in
               viewer.get(f"/projects/{project_id}/metrics/Electricity/history").json()["points"]]
        for name, project_id in ids.items()
    }
    assert periods["Monosh Science Building"] == ["2026-Q1", "2026-Q2", "2026-Q3"]
    assert periods["Monosh Engineering Hall"] == ["2026-Q1", "2026-Q2"]


def test_refuses_to_run_in_production(monkeypatch) -> None:
    class Production:
        is_production = True
        dev_seed_password = PASSWORD

    monkeypatch.setattr(seed_demo_monosh, "get_settings", lambda: Production())
    with pytest.raises(seed_demo_monosh.DemoSeedError, match="production"):
        seed_demo_monosh.seed_demo(object())
