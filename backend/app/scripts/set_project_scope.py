"""Record a project's benchmark scope (country + property type).

Sprint 8 matches a project to a benchmark on country and property type, but no
existing sprint captures those attributes: the upload form does not collect them
and the Sprint 2 submission contract does not carry them. Rather than infer a
scope from the free-text location field - a guess that would silently decide
which external target a project is judged against - the scope is set explicitly
here, and a project without one reports PROJECT_SCOPE_UNKNOWN instead of being
compared.

Capturing this at upload time is a team decision for a later sprint, because it
changes the Sprint 2 request contract that Members 1 and 2 agreed.

Usage:
    python -m backend.app.scripts.set_project_scope "Green Tower" Australia Office
"""

import sys

from sqlalchemy import select

from backend.app.core.database import SessionLocal
from backend.app.models.project import Project


def set_project_scope(project_name: str, country: str, property_type: str) -> None:
    with SessionLocal() as db:
        projects = list(db.scalars(select(Project).where(Project.name == project_name)).all())
        if not projects:
            raise SystemExit(f"No project named {project_name!r} was found.")
        if len(projects) > 1:
            # Project names are unique per organisation, not globally.
            raise SystemExit(
                f"{len(projects)} projects are named {project_name!r} in different organisations. "
                f"Set the scope by project id instead of by name."
            )
        project = projects[0]
        project.country = country
        project.property_type = property_type
        db.commit()
        print(f"Set scope for {project.name!r} (id {project.id}) to {country} / {property_type}.")


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit('Usage: python -m backend.app.scripts.set_project_scope "<project>" <country> <property_type>')
    set_project_scope(sys.argv[1], sys.argv[2], sys.argv[3])


if __name__ == "__main__":
    main()
