from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from backend.app.models.project import Project
from backend.app.repositories.organisations import get_or_create_organisation


def get_or_create_project(
    db: Session,
    project_name: str,
    organisation_name: str,
    *,
    location: str | None = None,
) -> Project:
    organisation = get_or_create_organisation(db, organisation_name)

    clean_name = project_name.strip()
    stmt = select(Project).where(Project.name == clean_name, Project.organisation_id == organisation.id)
    project = db.scalars(stmt).first()
    if project is not None:
        return project

    clean_location = location.strip() if location else None
    project = Project(name=clean_name, organisation_id=organisation.id, location=clean_location or None)
    db.add(project)
    db.flush()
    return project


def get_project_by_id(db: Session, project_id: int) -> Project | None:
    stmt = select(Project).options(joinedload(Project.organisation)).where(Project.id == project_id)
    return db.scalars(stmt).first()
