from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.auth.models import UserRole
from backend.app.auth.security import hash_password
from backend.app.core.config import get_settings
from backend.app.core.database import SessionLocal
from backend.app.models.organisation import Organisation
from backend.app.models.organisation_member import OrganisationMember
from backend.app.models.user import User
from backend.app.repositories.users import normalize_email


DEMO_ORGANISATION_NAME = "GreenChain Demo Organisation"


def upsert_user(db: Session, *, name: str, email: str, role: UserRole, password_hash: str) -> User:
    normalized_email = normalize_email(email)
    user = db.scalars(select(User).where(User.email == normalized_email)).first()
    if user is None:
        user = User(name=name, email=normalized_email, role=role.value, password_hash=password_hash)
        db.add(user)
    else:
        user.name = name
        user.role = role.value
        user.password_hash = password_hash
        user.is_active = True
    return user


def seed_auth_data() -> None:
    settings = get_settings()
    if not settings.dev_seed_password:
        raise RuntimeError("DEV_SEED_PASSWORD is required to seed Sprint 1 development users.")

    with SessionLocal() as db:
        organisation = db.scalars(select(Organisation).where(Organisation.name == DEMO_ORGANISATION_NAME)).first()
        if organisation is None:
            organisation = Organisation(name=DEMO_ORGANISATION_NAME)
            db.add(organisation)
            db.flush()

        password_hash = hash_password(settings.dev_seed_password)
        viewer = upsert_user(
            db,
            name="GreenChain Viewer",
            email="viewer@greenchain.test",
            role=UserRole.VIEWER,
            password_hash=password_hash,
        )
        uploader = upsert_user(
            db,
            name="GreenChain Uploader",
            email="uploader@greenchain.test",
            role=UserRole.UPLOADER,
            password_hash=password_hash,
        )
        auditor = upsert_user(
            db,
            name="GreenChain Auditor",
            email="auditor@greenchain.test",
            role=UserRole.AUDITOR,
            password_hash=password_hash,
        )
        db.flush()

        membership = db.scalars(select(OrganisationMember).where(OrganisationMember.user_id == uploader.id)).first()
        if membership is None:
            db.add(OrganisationMember(user_id=uploader.id, organisation_id=organisation.id))
        else:
            membership.organisation_id = organisation.id

        for user in (viewer, auditor):
            existing_membership = db.scalars(select(OrganisationMember).where(OrganisationMember.user_id == user.id)).first()
            if existing_membership is not None:
                db.delete(existing_membership)

        db.commit()


def main() -> None:
    seed_auth_data()
    print("Seeded Sprint 1 development auth users.")


if __name__ == "__main__":
    main()
