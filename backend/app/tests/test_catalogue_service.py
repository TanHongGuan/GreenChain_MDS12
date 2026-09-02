from datetime import datetime, timedelta
from io import BytesIO

import pytest

from backend.app.catalogue.service import CatalogueError, list_projects
from backend.app.integrity.hashing import calculate_sha256
from backend.app.models.submission import (
    SUBMISSION_STATUS_APPROVED,
    SUBMISSION_STATUS_REJECTED,
    SUBMISSION_STATUS_UNREVIEWED,
)
from backend.app.repositories.projects import get_or_create_project
from backend.app.repositories.submissions import create_submission
from backend.app.repositories.users import SQLAlchemyUserRepository
from backend.app.tests.db_fixtures import build_session_factory, seed_test_auth_users


@pytest.fixture
def session_factory(tmp_path):
    factory = build_session_factory(tmp_path / "catalogue-tests.sqlite3")
    with factory() as db:
        seed_test_auth_users(db)
    return factory


def seed_catalogue_submission(
    session_factory,
    *,
    project_name: str,
    organisation: str,
    location: str,
    reporting_period: str,
    status: str,
    submitted_at: datetime,
) -> int:
    with session_factory() as db:
        user = SQLAlchemyUserRepository(db).get_user_by_email("uploader@greenchain.test")
        raw_bytes = f"{project_name},{reporting_period},{status}".encode()
        project = get_or_create_project(db, project_name, organisation, location=location)
        submission = create_submission(
            db,
            project_id=project.id,
            uploader_id=user.id,
            reporting_period=reporting_period,
            original_filename="report.csv",
            original_storage_key=f"original/{project_name}-{reporting_period}.csv",
            processed_storage_key=f"processed/{project_name}-{reporting_period}.csv",
            original_sha256=calculate_sha256(BytesIO(raw_bytes)),
        )
        submission.status = status
        submission.created_at = submitted_at
        db.commit()
        return project.id


def seed_catalogue(session_factory) -> dict[str, int]:
    base = datetime(2026, 1, 1, 9, 0, 0)
    return {
        "alpha": seed_catalogue_submission(
            session_factory,
            project_name="Alpha Solar",
            organisation="Acme Renewables",
            location="Johor",
            reporting_period="2026-Q1",
            status=SUBMISSION_STATUS_APPROVED,
            submitted_at=base,
        ),
        "bravo": seed_catalogue_submission(
            session_factory,
            project_name="Bravo Hydro",
            organisation="Blue Utilities",
            location="Penang",
            reporting_period="2026-Q2",
            status=SUBMISSION_STATUS_UNREVIEWED,
            submitted_at=base + timedelta(days=1),
        ),
        "charlie": seed_catalogue_submission(
            session_factory,
            project_name="Charlie Wind",
            organisation="Acme Renewables",
            location="Johor",
            reporting_period="2026-Q3",
            status=SUBMISSION_STATUS_REJECTED,
            submitted_at=base + timedelta(days=2),
        ),
        "delta": seed_catalogue_submission(
            session_factory,
            project_name="Delta Biomass",
            organisation="Carbon Loop",
            location="Sabah",
            reporting_period="2026-Q4",
            status=SUBMISSION_STATUS_APPROVED,
            submitted_at=base + timedelta(days=3),
        ),
    }


def project_names(result) -> list[str]:
    return [item.project_name for item in result.items]


def test_default_catalogue_returns_only_latest_approved_projects(session_factory) -> None:
    seed_catalogue(session_factory)

    with session_factory() as db:
        result = list_projects(db=db)

    assert project_names(result) == ["Delta Biomass", "Alpha Solar"]
    assert result.total_items == 2
    assert {item.status for item in result.items} == {SUBMISSION_STATUS_APPROVED}


def test_latest_submission_status_controls_catalogue_status(session_factory) -> None:
    ids = seed_catalogue(session_factory)
    seed_catalogue_submission(
        session_factory,
        project_name="Alpha Solar",
        organisation="Acme Renewables",
        location="Johor",
        reporting_period="2026-Q2",
        status=SUBMISSION_STATUS_REJECTED,
        submitted_at=datetime(2026, 1, 8, 9, 0, 0),
    )

    with session_factory() as db:
        approved = list_projects(db=db)
        rejected = list_projects(db=db, statuses=[SUBMISSION_STATUS_REJECTED])

    assert ids["alpha"] not in {item.project_id for item in approved.items}
    assert "Alpha Solar" in project_names(rejected)


def test_status_search_location_organisation_and_period_filters_combine(session_factory) -> None:
    seed_catalogue(session_factory)

    with session_factory() as db:
        result = list_projects(
            db=db,
            search="wind",
            location="johor",
            organisation="acme renewables",
            statuses=[SUBMISSION_STATUS_REJECTED],
            reporting_period="2026-Q3",
        )

    assert project_names(result) == ["Charlie Wind"]
    assert result.items[0].status == SUBMISSION_STATUS_REJECTED


def test_explicit_multiple_statuses_include_non_approved_projects(session_factory) -> None:
    seed_catalogue(session_factory)

    with session_factory() as db:
        result = list_projects(
            db=db,
            statuses=[SUBMISSION_STATUS_APPROVED, SUBMISSION_STATUS_UNREVIEWED],
            sort="project_name_asc",
        )

    assert project_names(result) == ["Alpha Solar", "Bravo Hydro", "Delta Biomass"]


def test_pagination_uses_database_counts(session_factory) -> None:
    seed_catalogue(session_factory)

    with session_factory() as db:
        result = list_projects(db=db, statuses=[SUBMISSION_STATUS_APPROVED], sort="project_name_asc", page=2, page_size=1)

    assert project_names(result) == ["Delta Biomass"]
    assert result.page == 2
    assert result.page_size == 1
    assert result.total_items == 2
    assert result.total_pages == 2


def test_out_of_range_page_returns_empty_items_with_counts(session_factory) -> None:
    seed_catalogue(session_factory)

    with session_factory() as db:
        result = list_projects(db=db, page=5, page_size=2)

    assert result.items == []
    assert result.total_items == 2
    assert result.total_pages == 1


def test_filter_metadata_reflects_latest_project_state(session_factory) -> None:
    seed_catalogue(session_factory)

    with session_factory() as db:
        result = list_projects(db=db)

    filters = result.filters
    assert {option.value for option in filters["statuses"]} == {
        SUBMISSION_STATUS_APPROVED,
        SUBMISSION_STATUS_UNREVIEWED,
        SUBMISSION_STATUS_REJECTED,
    }
    assert {option.value for option in filters["locations"]} == {"Johor", "Penang", "Sabah"}
    assert {option.value for option in filters["organisations"]} == {
        "Acme Renewables",
        "Blue Utilities",
        "Carbon Loop",
    }
    assert {option.value for option in filters["reporting_periods"]} == {"2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"}


@pytest.mark.parametrize(
    ("kwargs", "code"),
    [
        ({"statuses": ["ARCHIVED"]}, "INVALID_STATUS"),
        ({"reporting_period": "2026-H1"}, "INVALID_REPORTING_PERIOD"),
        ({"sort": "surprise_desc"}, "INVALID_SORT"),
        ({"page": 0}, "INVALID_PAGE"),
        ({"page_size": 0}, "INVALID_PAGE_SIZE"),
        ({"page_size": 51}, "INVALID_PAGE_SIZE"),
    ],
)
def test_invalid_inputs_fail_safely(session_factory, kwargs, code) -> None:
    seed_catalogue(session_factory)

    with session_factory() as db:
        with pytest.raises(CatalogueError) as exc_info:
            list_projects(db=db, **kwargs)

    assert exc_info.value.code == code
