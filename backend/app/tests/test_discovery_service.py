from datetime import datetime, timedelta
from io import BytesIO

import pytest
from sqlalchemy import func, select

from backend.app.discovery.service import (
    DiscoveryError,
    add_highlight,
    featured_rule,
    get_featured_projects,
    get_home_discovery,
    get_new_projects,
    get_recently_updated,
    list_highlighted_projects,
    remove_highlight,
)
from backend.app.integrity.hashing import calculate_sha256
from backend.app.models.highlighted_project import HighlightedProject
from backend.app.models.metric import Metric
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
    factory = build_session_factory(tmp_path / "discovery-tests.sqlite3")
    with factory() as db:
        seed_test_auth_users(db)
    return factory


def user_id(db, email: str) -> str:
    user = SQLAlchemyUserRepository(db).get_user_by_email(email)
    assert user is not None
    return user.id


def seed_project(
    db,
    *,
    project_name: str,
    organisation: str = "Discovery Org",
    location: str = "Johor",
    created_at: datetime,
) -> int:
    project = get_or_create_project(db, project_name, organisation, location=location)
    project.created_at = created_at
    db.flush()
    return project.id


def seed_submission(
    db,
    *,
    project_id: int,
    uploader_id: str,
    reporting_period: str,
    status: str,
    created_at: datetime,
    metric_name: str = "Electricity",
    value: float = 100.0,
    unit: str = "kWh",
) -> int:
    raw = f"metric_name,value,unit\n{metric_name},{value},{unit}\n".encode()
    submission = create_submission(
        db,
        project_id=project_id,
        uploader_id=uploader_id,
        reporting_period=reporting_period,
        original_filename="report.csv",
        original_storage_key=f"original/{project_id}-{reporting_period}-{status}.csv",
        processed_storage_key=f"processed/{project_id}-{reporting_period}-{status}.csv",
        original_sha256=calculate_sha256(BytesIO(raw)),
    )
    submission.status = status
    submission.created_at = created_at
    db.add(Metric(submission_id=submission.id, metric_name=metric_name, value=value, unit=unit, category="Energy"))
    db.flush()
    return submission.id


def seed_discovery_projects(db) -> dict[str, int]:
    uploader_id = user_id(db, "uploader@greenchain.test")
    base = datetime(2026, 1, 1, 9, 0, 0)
    alpha = seed_project(db, project_name="Alpha Solar", created_at=base)
    beta = seed_project(db, project_name="Beta Hydro", created_at=base + timedelta(days=1), location="Penang")
    charlie = seed_project(db, project_name="Charlie Wind", created_at=base + timedelta(days=2), location="Sabah")

    seed_submission(
        db,
        project_id=alpha,
        uploader_id=uploader_id,
        reporting_period="2026-Q1",
        status=SUBMISSION_STATUS_APPROVED,
        created_at=base + timedelta(hours=1),
        value=10,
    )
    seed_submission(
        db,
        project_id=alpha,
        uploader_id=uploader_id,
        reporting_period="2026-Q2",
        status=SUBMISSION_STATUS_UNREVIEWED,
        created_at=base + timedelta(days=5),
        value=999,
    )
    seed_submission(
        db,
        project_id=alpha,
        uploader_id=uploader_id,
        reporting_period="2026-Q3",
        status=SUBMISSION_STATUS_REJECTED,
        created_at=base + timedelta(days=6),
        value=888,
    )
    seed_submission(
        db,
        project_id=beta,
        uploader_id=uploader_id,
        reporting_period="2026-Q2",
        status=SUBMISSION_STATUS_APPROVED,
        created_at=base + timedelta(days=2),
        metric_name="Water",
        value=20,
        unit="kL",
    )
    seed_submission(
        db,
        project_id=charlie,
        uploader_id=uploader_id,
        reporting_period="2026-Q1",
        status=SUBMISSION_STATUS_REJECTED,
        created_at=base + timedelta(days=3),
        value=30,
    )
    db.commit()
    return {"alpha": alpha, "beta": beta, "charlie": charlie}


def names(cards) -> list[str]:
    return [card.project_name for card in cards]


def test_recently_updated_uses_latest_submission_timestamp_without_trusting_rejected_data(session_factory) -> None:
    with session_factory() as db:
        ids = seed_discovery_projects(db)
        viewer_id = user_id(db, "viewer@greenchain.test")
        cards = get_recently_updated(db=db, user_id=viewer_id, limit=3)

    assert names(cards) == ["Alpha Solar", "Charlie Wind", "Beta Hydro"]
    alpha = next(card for card in cards if card.project_id == ids["alpha"])
    assert alpha.status == SUBMISSION_STATUS_REJECTED
    assert alpha.trusted_metric is not None
    assert alpha.trusted_metric.reporting_period == "2026-Q1"
    assert alpha.trusted_metric.value == 10


def test_new_projects_use_project_created_timestamp(session_factory) -> None:
    with session_factory() as db:
        seed_discovery_projects(db)
        viewer_id = user_id(db, "viewer@greenchain.test")
        cards = get_new_projects(db=db, user_id=viewer_id, limit=3)

    assert names(cards) == ["Charlie Wind", "Beta Hydro", "Alpha Solar"]


def test_featured_rule_is_deterministic_and_approved_only(session_factory) -> None:
    with session_factory() as db:
        seed_discovery_projects(db)
        viewer_id = user_id(db, "viewer@greenchain.test")
        cards = get_featured_projects(db=db, user_id=viewer_id, limit=3)

    assert "No explicit featured flag exists" in featured_rule()
    assert names(cards) == ["Beta Hydro"]
    assert all(card.status == SUBMISSION_STATUS_APPROVED for card in cards)


def test_home_discovery_has_bounded_sections_without_duplicates(session_factory) -> None:
    with session_factory() as db:
        seed_discovery_projects(db)
        viewer_id = user_id(db, "viewer@greenchain.test")
        discovery = get_home_discovery(db=db, user_id=viewer_id, limit=2)

    assert len(discovery.recently_updated) == 2
    assert len({card.project_id for card in discovery.recently_updated}) == 2
    assert len({card.project_id for card in discovery.new_projects}) == 2
    assert discovery.featured_rule == featured_rule()


def test_highlight_add_duplicate_remove_and_new_session_persistence(session_factory) -> None:
    with session_factory() as db:
        ids = seed_discovery_projects(db)
        viewer_id = user_id(db, "viewer@greenchain.test")
        first = add_highlight(db=db, user_id=viewer_id, project_id=ids["alpha"])
        second = add_highlight(db=db, user_id=viewer_id, project_id=ids["alpha"])
        db.commit()

    assert first.highlighted is True
    assert second.highlighted is True

    with session_factory() as db:
        viewer_id = user_id(db, "viewer@greenchain.test")
        highlights = list_highlighted_projects(db=db, user_id=viewer_id)
        duplicate_count = db.scalar(
            select(func.count()).select_from(HighlightedProject).where(HighlightedProject.user_id == viewer_id)
        )

    assert names(highlights) == ["Alpha Solar"]
    assert duplicate_count == 1

    with session_factory() as db:
        viewer_id = user_id(db, "viewer@greenchain.test")
        assert remove_highlight(db=db, user_id=viewer_id, project_id=ids["alpha"]) is True
        assert remove_highlight(db=db, user_id=viewer_id, project_id=ids["alpha"]) is False
        db.commit()

    with session_factory() as db:
        viewer_id = user_id(db, "viewer@greenchain.test")
        assert list_highlighted_projects(db=db, user_id=viewer_id) == []


def test_highlights_are_isolated_per_user(session_factory) -> None:
    with session_factory() as db:
        ids = seed_discovery_projects(db)
        viewer_id = user_id(db, "viewer@greenchain.test")
        auditor_id = user_id(db, "auditor@greenchain.test")
        add_highlight(db=db, user_id=viewer_id, project_id=ids["alpha"])
        add_highlight(db=db, user_id=auditor_id, project_id=ids["beta"])
        db.commit()

    with session_factory() as db:
        viewer_id = user_id(db, "viewer@greenchain.test")
        auditor_id = user_id(db, "auditor@greenchain.test")
        assert names(list_highlighted_projects(db=db, user_id=viewer_id)) == ["Alpha Solar"]
        assert names(list_highlighted_projects(db=db, user_id=auditor_id)) == ["Beta Hydro"]
        assert remove_highlight(db=db, user_id=viewer_id, project_id=ids["alpha"]) is True
        db.commit()

    with session_factory() as db:
        auditor_id = user_id(db, "auditor@greenchain.test")
        assert names(list_highlighted_projects(db=db, user_id=auditor_id)) == ["Beta Hydro"]


def test_highlight_missing_project_fails_safely(session_factory) -> None:
    with session_factory() as db:
        viewer_id = user_id(db, "viewer@greenchain.test")
        with pytest.raises(DiscoveryError) as exc_info:
            add_highlight(db=db, user_id=viewer_id, project_id=99999)

    assert exc_info.value.code == "PROJECT_NOT_FOUND"
