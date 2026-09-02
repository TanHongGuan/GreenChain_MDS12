from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.organisation import Organisation


def get_or_create_organisation(db: Session, name: str) -> Organisation:
    clean_name = name.strip()
    stmt = select(Organisation).where(Organisation.name == clean_name)
    organisation = db.scalars(stmt).first()
    if organisation is not None:
        return organisation

    organisation = Organisation(name=clean_name)
    db.add(organisation)
    db.flush()
    return organisation
