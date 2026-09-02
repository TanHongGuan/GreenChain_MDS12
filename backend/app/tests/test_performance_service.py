import pytest

from backend.app.models.metric import Metric
from backend.app.repositories.projects import get_or_create_project
from backend.app.repositories.submissions import create_submission
from backend.app.repositories.users import SQLAlchemyUserRepository
from backend.app.performance.errors import MetricUnitConflict, ProjectNotFound
from backend.app.performance.periods import parse_reporting_period
from backend.app.performance.service import (
    get_latest_approved_metrics,
    get_metric_history,
    get_project_detail,
)
from backend.app.tests.db_fixtures import build_session_factory, seed_test_auth_users


@pytest.fixture
def session_factory(tmp_path):
    factory = build_session_factory(tmp_path / "performance-tests.sqlite3")
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


def uploader_id(db) -> str:
    user = SQLAlchemyUserRepository(db).get_user_by_email("uploader@greenchain.test")
    assert user is not None
    return user.id


def seed_submission(
    db,
    *,
    project_name: str = "Green Tower",
    organisation: str = "Acme Corp",
    reporting_period: str = "2026-Q1",
    status: str = "APPROVED",
    metrics: list[tuple[str, float, str]] = (("Electricity", 100.0, "kWh"),),
) -> int:
    project = get_or_create_project(db, project_name, organisation)
    submission = create_submission(
        db,
        project_id=project.id,
        uploader_id=uploader_id(db),
        reporting_period=reporting_period,
        original_filename="report.csv",
        original_storage_key=f"original/{project.id}-{reporting_period}-{status}",
        processed_storage_key=f"processed/{project.id}-{reporting_period}-{status}",
        original_sha256="0" * 64,
    )
    submission.status = status
    for metric_name, value, unit in metrics:
        db.add(Metric(submission_id=submission.id, metric_name=metric_name, value=value, unit=unit, category=None))
    db.commit()
    return project.id


# --- project detail -----------------------------------------------------------------


def test_get_project_detail_returns_real_metadata(db) -> None:
    project_id = seed_submission(db)

    detail = get_project_detail(project_id, db=db)

    assert detail.project_id == project_id
    assert detail.project_name == "Green Tower"
    assert detail.organisation_name == "Acme Corp"


def test_get_project_detail_missing_project_raises(db) -> None:
    with pytest.raises(ProjectNotFound):
        get_project_detail(999999, db=db)


# --- latest APPROVED selection --------------------------------------------------------


def test_latest_approved_selected_correctly(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", status="APPROVED", metrics=[("Electricity", 100.0, "kWh")])
    seed_submission(db, reporting_period="2026-Q2", status="APPROVED", metrics=[("Electricity", 150.0, "kWh")])

    [electricity] = [m for m in get_latest_approved_metrics(project_id, db=db) if m.metric_name == "Electricity"]

    assert electricity.latest.value == 150.0
    assert electricity.latest.reporting_period == "2026-Q2"
    assert electricity.previous.value == 100.0
    assert electricity.previous.reporting_period == "2026-Q1"


def test_newer_unreviewed_does_not_replace_trusted_default(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", status="APPROVED", metrics=[("Electricity", 100.0, "kWh")])
    seed_submission(db, reporting_period="2026-Q2", status="UNREVIEWED", metrics=[("Electricity", 999.0, "kWh")])

    [electricity] = [m for m in get_latest_approved_metrics(project_id, db=db) if m.metric_name == "Electricity"]

    assert electricity.latest.value == 100.0
    assert electricity.latest.status == "APPROVED"


def test_newer_rejected_does_not_replace_trusted_default(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", status="APPROVED", metrics=[("Electricity", 100.0, "kWh")])
    seed_submission(db, reporting_period="2026-Q2", status="REJECTED", metrics=[("Electricity", 999.0, "kWh")])

    [electricity] = [m for m in get_latest_approved_metrics(project_id, db=db) if m.metric_name == "Electricity"]

    assert electricity.latest.value == 100.0


def test_single_approved_period_returns_no_comparison(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", status="APPROVED")

    [electricity] = get_latest_approved_metrics(project_id, db=db)

    assert electricity.previous is None


def test_no_approved_data_returns_no_metrics(db) -> None:
    project_id = seed_submission(db, status="UNREVIEWED")

    assert get_latest_approved_metrics(project_id, db=db) == []


def test_mismatched_previous_unit_is_skipped_not_fabricated(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", status="APPROVED", metrics=[("Electricity", 1000.0, "MWh")])
    seed_submission(db, reporting_period="2026-Q2", status="APPROVED", metrics=[("Electricity", 150.0, "kWh")])

    [electricity] = get_latest_approved_metrics(project_id, db=db)

    assert electricity.latest.value == 150.0
    assert electricity.latest.unit == "kWh"
    assert electricity.previous is None


def test_latest_metrics_respect_project_boundaries(db) -> None:
    project_a = seed_submission(db, project_name="Tower A", metrics=[("Electricity", 100.0, "kWh")])
    project_b = seed_submission(db, project_name="Tower B", metrics=[("Electricity", 500.0, "kWh")])

    [a_electricity] = get_latest_approved_metrics(project_a, db=db)
    [b_electricity] = get_latest_approved_metrics(project_b, db=db)

    assert a_electricity.latest.value == 100.0
    assert b_electricity.latest.value == 500.0


def test_malformed_reporting_period_is_excluded_not_guessed(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", status="APPROVED", metrics=[("Electricity", 100.0, "kWh")])
    seed_submission(db, reporting_period="not-a-period", status="APPROVED", metrics=[("Electricity", 777.0, "kWh")])

    [electricity] = get_latest_approved_metrics(project_id, db=db)

    assert electricity.latest.value == 100.0


# --- metric history ------------------------------------------------------------------


def test_default_history_contains_approved_only(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", status="APPROVED")
    seed_submission(db, reporting_period="2026-Q2", status="UNREVIEWED")
    seed_submission(db, reporting_period="2026-Q3", status="REJECTED")

    points = get_metric_history(project_id, "Electricity", db=db)

    assert {p.status for p in points} == {"APPROVED"}


def test_include_unreviewed_adds_unreviewed_points(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", status="APPROVED")
    seed_submission(db, reporting_period="2026-Q2", status="UNREVIEWED")

    points = get_metric_history(project_id, "Electricity", db=db, include_unreviewed=True)

    assert {p.status for p in points} == {"APPROVED", "UNREVIEWED"}


def test_rejected_never_appears_even_when_unreviewed_included(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", status="APPROVED")
    seed_submission(db, reporting_period="2026-Q2", status="REJECTED")

    points = get_metric_history(project_id, "Electricity", db=db, include_unreviewed=True)

    assert all(p.status != "REJECTED" for p in points)


def test_history_ordered_chronologically(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q3", status="APPROVED", metrics=[("Electricity", 300.0, "kWh")])
    seed_submission(db, reporting_period="2026-Q1", status="APPROVED", metrics=[("Electricity", 100.0, "kWh")])
    seed_submission(db, reporting_period="2026-Q2", status="APPROVED", metrics=[("Electricity", 200.0, "kWh")])

    points = get_metric_history(project_id, "Electricity", db=db)

    assert [p.reporting_period for p in points] == ["2026-Q1", "2026-Q2", "2026-Q3"]
    assert [p.value for p in points] == [100.0, 200.0, 300.0]


def test_each_history_point_maps_to_correct_submission(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", status="APPROVED", metrics=[("Electricity", 100.0, "kWh")])

    [point] = get_metric_history(project_id, "Electricity", db=db)

    assert point.submission_id is not None
    assert point.project_id == project_id
    assert point.metric_name == "Electricity"


def test_history_respects_project_boundaries(db) -> None:
    project_a = seed_submission(db, project_name="Tower A", metrics=[("Electricity", 100.0, "kWh")])
    project_b = seed_submission(db, project_name="Tower B", metrics=[("Electricity", 500.0, "kWh")])

    a_points = get_metric_history(project_a, "Electricity", db=db)
    b_points = get_metric_history(project_b, "Electricity", db=db)

    assert [p.value for p in a_points] == [100.0]
    assert [p.value for p in b_points] == [500.0]


def test_incompatible_units_raise_instead_of_silently_mixing(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", status="APPROVED", metrics=[("Electricity", 100.0, "kWh")])
    seed_submission(db, reporting_period="2026-Q2", status="APPROVED", metrics=[("Electricity", 1.0, "MWh")])

    with pytest.raises(MetricUnitConflict):
        get_metric_history(project_id, "Electricity", db=db)


def test_malformed_reporting_period_excluded_from_history(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", status="APPROVED", metrics=[("Electricity", 100.0, "kWh")])
    seed_submission(db, reporting_period="garbage", status="APPROVED", metrics=[("Electricity", 999.0, "kWh")])

    points = get_metric_history(project_id, "Electricity", db=db)

    assert [p.value for p in points] == [100.0]


def test_history_missing_project_raises(db) -> None:
    with pytest.raises(ProjectNotFound):
        get_metric_history(999999, "Electricity", db=db)


# --- period parsing ------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("2026-Q1", (2026, 1)),
        ("2026-Q4", (2026, 4)),
        (" 2026-Q2 ", (2026, 2)),
    ],
)
def test_parse_reporting_period_valid(value, expected) -> None:
    assert parse_reporting_period(value) == expected


@pytest.mark.parametrize("value", ["", "2026", "Q1-2026", "2026-Q5", "not-a-period", "2026-13"])
def test_parse_reporting_period_invalid_returns_none(value) -> None:
    assert parse_reporting_period(value) is None
