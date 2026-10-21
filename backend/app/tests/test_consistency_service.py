import pytest

from backend.app.insights.consistency import (
    CELL_APPROVED,
    CELL_MISSING,
    CELL_UNREVIEWED,
    get_consistency_report,
)
from backend.app.insights.errors import ProjectNotFound
from backend.app.models.metric import Metric
from backend.app.repositories.projects import get_or_create_project
from backend.app.repositories.submissions import create_submission
from backend.app.repositories.users import SQLAlchemyUserRepository
from backend.app.tests.db_fixtures import build_session_factory, seed_test_auth_users


@pytest.fixture
def session_factory(tmp_path):
    factory = build_session_factory(tmp_path / "consistency-tests.sqlite3")
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


def test_consistency_marks_missing_periods(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", metrics=[("Electricity", 10.0, "kWh")])
    seed_submission(db, reporting_period="2026-Q2", metrics=[("Water", 20.0, "m3")])

    report = get_consistency_report(project_id, db=db)

    assert report.periods == ["2026-Q1", "2026-Q2"]
    assert report.metrics == ["Electricity", "Water"]
    states = {(cell.metric_name, cell.reporting_period): cell.state for cell in report.cells}
    assert states[("Electricity", "2026-Q1")] == CELL_APPROVED
    assert states[("Electricity", "2026-Q2")] == CELL_MISSING
    assert states[("Water", "2026-Q1")] == CELL_MISSING
    assert states[("Water", "2026-Q2")] == CELL_APPROVED
    assert report.approved_cells == 2
    assert report.total_cells == 4
    assert report.approved_coverage_percent == pytest.approx(50.0)


def test_consistency_prefers_approved_over_unreviewed_for_same_cell(db) -> None:
    project_id = seed_submission(
        db, reporting_period="2026-Q1", status="UNREVIEWED", metrics=[("Electricity", 10.0, "kWh")]
    )
    seed_submission(db, reporting_period="2026-Q1", status="APPROVED", metrics=[("Electricity", 99.0, "kWh")])

    report = get_consistency_report(project_id, db=db)

    assert len(report.cells) == 1
    assert report.cells[0].state == CELL_APPROVED
    assert report.cells[0].value == 99.0


def test_consistency_reports_unreviewed_state(db) -> None:
    project_id = seed_submission(
        db, reporting_period="2026-Q1", status="UNREVIEWED", metrics=[("Electricity", 10.0, "kWh")]
    )

    report = get_consistency_report(project_id, db=db)

    assert report.cells[0].state == CELL_UNREVIEWED
    assert report.approved_cells == 0
    assert report.approved_coverage_percent == pytest.approx(0.0)


def test_consistency_excludes_rejected_submissions(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", metrics=[("Electricity", 10.0, "kWh")])
    seed_submission(db, reporting_period="2026-Q2", status="REJECTED", metrics=[("Electricity", 10.0, "kWh")])

    report = get_consistency_report(project_id, db=db)

    assert report.periods == ["2026-Q1"]


def test_consistency_skips_unparseable_period(db) -> None:
    project_id = seed_submission(db, reporting_period="whenever", metrics=[("Electricity", 10.0, "kWh")])

    report = get_consistency_report(project_id, db=db)

    assert report.periods == []
    assert report.total_cells == 0
    assert report.approved_coverage_percent is None


def test_consistency_missing_project_raises(db) -> None:
    with pytest.raises(ProjectNotFound):
        get_consistency_report(999999, db=db)


def test_consistency_merges_metric_aliases_into_one_row(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", metrics=[("Electricity", 10.0, "kWh")])
    seed_submission(db, reporting_period="2026-Q2", metrics=[("electricity_consumption", 12.0, "kWh")])

    report = get_consistency_report(project_id, db=db)

    assert report.metrics == ["Electricity"]
    assert report.periods == ["2026-Q1", "2026-Q2"]
    assert report.approved_cells == 2


def test_consistency_reports_values_in_the_canonical_unit(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", metrics=[("CO2e", 5000.0, "kgCO2e")])

    report = get_consistency_report(project_id, db=db)

    assert report.cells[0].unit == "tCO2e"
    assert report.cells[0].value == pytest.approx(5.0)
