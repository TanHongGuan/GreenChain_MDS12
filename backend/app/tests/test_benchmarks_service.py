import pytest

from backend.app.benchmarks.directions import (
    AT_TARGET,
    BETTER_THAN_TARGET,
    NOT_COMPARABLE,
    WORSE_THAN_TARGET,
)
from backend.app.benchmarks.errors import ProjectNotFound
from backend.app.benchmarks.service import (
    CELL_APPROVED,
    CELL_MISSING,
    CELL_UNREVIEWED,
    REASON_NO_BENCHMARK_FOR_SCOPE,
    REASON_PROJECT_SCOPE_UNKNOWN,
    REASON_UNIT_MISMATCH,
    REASON_UNKNOWN_METRIC_DIRECTION,
    get_benchmark_report,
    get_consistency_report,
)
from backend.app.models.metric import Metric
from backend.app.repositories.benchmarks import create_benchmark
from backend.app.repositories.projects import get_or_create_project
from backend.app.repositories.submissions import create_submission
from backend.app.repositories.users import SQLAlchemyUserRepository
from backend.app.scripts.seed_benchmarks import DEMO_BENCHMARKS, validate_rows
from backend.app.tests.db_fixtures import build_session_factory, seed_test_auth_users


@pytest.fixture
def session_factory(tmp_path):
    factory = build_session_factory(tmp_path / "benchmark-tests.sqlite3")
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
    country: str | None = "Australia",
    property_type: str | None = "Office",
) -> int:
    project = get_or_create_project(db, project_name, organisation)
    project.country = country
    project.property_type = property_type
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


def seed_benchmark(db, *, metric_name="Electricity", unit="kWh", value=1000.0, year=2026, **overrides) -> None:
    payload = {
        "provider": "Test Provider",
        "source_name": "Test Source",
        "source_version": "v1",
        "source_url": "https://example.test/benchmark",
        "country": "Australia",
        "property_type": "Office",
        "year": year,
        "metric_name": metric_name,
        "unit": unit,
        "value": value,
    }
    payload.update(overrides)
    create_benchmark(db, **payload)
    db.commit()


def only(report, metric_name: str):
    matches = [item for item in report.comparisons if item.metric_name == metric_name]
    assert len(matches) == 1, f"expected exactly one {metric_name} comparison, got {len(matches)}"
    return matches[0]


# --- benchmark comparison -------------------------------------------------------------


def test_missing_project_raises(db) -> None:
    with pytest.raises(ProjectNotFound):
        get_benchmark_report(999999, db=db)


def test_value_below_benchmark_is_better_than_target(db) -> None:
    project_id = seed_submission(db, metrics=[("Electricity", 800.0, "kWh")])
    seed_benchmark(db, value=1000.0)

    comparison = only(get_benchmark_report(project_id, db=db), "Electricity")

    assert comparison.classification == BETTER_THAN_TARGET
    assert comparison.difference_percent == pytest.approx(-20.0)
    assert comparison.benchmark_value == 1000.0
    assert comparison.source is not None
    assert comparison.source.provider == "Test Provider"
    assert comparison.source.source_version == "v1"


def test_value_above_benchmark_is_worse_than_target(db) -> None:
    project_id = seed_submission(db, metrics=[("Electricity", 1300.0, "kWh")])
    seed_benchmark(db, value=1000.0)

    comparison = only(get_benchmark_report(project_id, db=db), "Electricity")

    assert comparison.classification == WORSE_THAN_TARGET
    assert comparison.difference_percent == pytest.approx(30.0)


def test_value_inside_tolerance_band_is_at_target(db) -> None:
    project_id = seed_submission(db, metrics=[("Electricity", 1030.0, "kWh")])
    seed_benchmark(db, value=1000.0)

    comparison = only(get_benchmark_report(project_id, db=db), "Electricity")

    assert comparison.classification == AT_TARGET


def test_unit_mismatch_is_reported_not_converted(db) -> None:
    project_id = seed_submission(db, metrics=[("Electricity", 800.0, "MWh")])
    seed_benchmark(db, unit="kWh", value=1000.0)

    comparison = only(get_benchmark_report(project_id, db=db), "Electricity")

    assert comparison.classification == NOT_COMPARABLE
    assert comparison.reason == REASON_UNIT_MISMATCH
    assert comparison.benchmark_value is None


def test_unknown_project_scope_suppresses_comparison(db) -> None:
    project_id = seed_submission(db, metrics=[("Electricity", 800.0, "kWh")], country=None, property_type=None)
    seed_benchmark(db, value=1000.0)

    comparison = only(get_benchmark_report(project_id, db=db), "Electricity")

    assert comparison.classification == NOT_COMPARABLE
    assert comparison.reason == REASON_PROJECT_SCOPE_UNKNOWN


def test_no_benchmark_for_scope_is_distinguished_from_unit_mismatch(db) -> None:
    project_id = seed_submission(db, metrics=[("Electricity", 800.0, "kWh")])
    seed_benchmark(db, property_type="Retail", value=1000.0)

    comparison = only(get_benchmark_report(project_id, db=db), "Electricity")

    assert comparison.classification == NOT_COMPARABLE
    assert comparison.reason == REASON_NO_BENCHMARK_FOR_SCOPE


def test_metric_without_agreed_direction_is_not_classified(db) -> None:
    project_id = seed_submission(db, metrics=[("Occupancy", 80.0, "percent")])
    seed_benchmark(db, metric_name="Occupancy", unit="percent", value=70.0)

    comparison = only(get_benchmark_report(project_id, db=db), "Occupancy")

    assert comparison.classification == NOT_COMPARABLE
    assert comparison.reason == REASON_UNKNOWN_METRIC_DIRECTION


def test_benchmark_published_after_measurement_year_is_ignored(db) -> None:
    project_id = seed_submission(db, reporting_period="2025-Q1", metrics=[("Electricity", 800.0, "kWh")])
    seed_benchmark(db, year=2026, value=1000.0)

    comparison = only(get_benchmark_report(project_id, db=db), "Electricity")

    assert comparison.classification == NOT_COMPARABLE
    assert comparison.reason == REASON_NO_BENCHMARK_FOR_SCOPE


def test_newest_eligible_benchmark_year_wins(db) -> None:
    project_id = seed_submission(db, reporting_period="2026-Q1", metrics=[("Electricity", 800.0, "kWh")])
    seed_benchmark(db, year=2024, value=2000.0)
    seed_benchmark(db, year=2026, value=1000.0)

    comparison = only(get_benchmark_report(project_id, db=db), "Electricity")

    assert comparison.benchmark_value == 1000.0
    assert comparison.source.year == 2026


def test_unreviewed_data_is_never_benchmarked(db) -> None:
    project_id = seed_submission(db, status="UNREVIEWED", metrics=[("Electricity", 800.0, "kWh")])
    seed_benchmark(db, value=1000.0)

    report = get_benchmark_report(project_id, db=db)

    assert report.comparisons == []


def test_rejected_data_is_never_benchmarked(db) -> None:
    project_id = seed_submission(db, status="REJECTED", metrics=[("Electricity", 10.0, "kWh")])
    seed_benchmark(db, value=1000.0)

    report = get_benchmark_report(project_id, db=db)

    assert report.comparisons == []


# --- reporting consistency ------------------------------------------------------------


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


# --- canonical metric identity and units ------------------------------------------------


def test_metric_alias_matches_a_benchmark_seeded_under_the_canonical_name(db) -> None:
    # Real uploads use "electricity_consumption"; benchmarks are seeded as "Electricity".
    project_id = seed_submission(db, metrics=[("electricity_consumption", 800.0, "kWh")])
    seed_benchmark(db, metric_name="Electricity", unit="kWh", value=1000.0)

    comparison = only(get_benchmark_report(project_id, db=db), "Electricity")

    assert comparison.classification == BETTER_THAN_TARGET
    assert comparison.difference_percent == pytest.approx(-20.0)


def test_documented_unit_conversion_is_applied(db) -> None:
    # The sample upload file reports CO2e in kgCO2e; the canonical unit is tCO2e.
    project_id = seed_submission(db, metrics=[("CO2e", 240000.0, "kgCO2e")])
    seed_benchmark(db, metric_name="CO2e", unit="tCO2e", value=300.0)

    comparison = only(get_benchmark_report(project_id, db=db), "CO2e")

    assert comparison.unit == "tCO2e"
    assert comparison.value == pytest.approx(240.0)
    assert comparison.classification == BETTER_THAN_TARGET
    assert comparison.difference_percent == pytest.approx(-20.0)


def test_undocumented_unit_is_not_converted(db) -> None:
    # MWh is a real unit but has no agreed factor here, so it must not be guessed.
    project_id = seed_submission(db, metrics=[("Electricity", 800.0, "MWh")])
    seed_benchmark(db, metric_name="Electricity", unit="kWh", value=1000.0)

    comparison = only(get_benchmark_report(project_id, db=db), "Electricity")

    assert comparison.classification == NOT_COMPARABLE
    assert comparison.reason == REASON_UNIT_MISMATCH


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


# --- demo benchmark set provenance ------------------------------------------------------


def test_demo_benchmark_rows_pass_their_own_validation() -> None:
    validate_rows(DEMO_BENCHMARKS)


def test_validate_rows_rejects_unit_that_could_never_match() -> None:
    with pytest.raises(ValueError, match="canonical unit"):
        validate_rows([("Australia", "Office", 2026, "Electricity", "MWh", 100.0)])


def test_validate_rows_rejects_metric_with_no_agreed_direction() -> None:
    with pytest.raises(ValueError, match="unknown metric"):
        validate_rows([("Australia", "Office", 2026, "Occupancy", "percent", 80.0)])
