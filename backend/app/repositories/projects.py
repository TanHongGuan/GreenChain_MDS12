from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.project import Project
from backend.app.repositories.organisations import get_or_create_organisation


def get_or_create_project(db: Session, project_name: str, organisation_name: str) -> Project:
    organisation = get_or_create_organisation(db, organisation_name)

    clean_name = project_name.strip()
    stmt = select(Project).where(Project.name == clean_name, Project.organisation_id == organisation.id)
    project = db.scalars(stmt).first()
    if project is not None:
        return project

    project = Project(name=clean_name, organisation_id=organisation.id)
    db.add(project)
    db.flush()
    return project
