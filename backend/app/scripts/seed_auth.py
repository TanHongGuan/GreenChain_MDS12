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


# One company account per organisation. Each uploads only for its own
# organisation's buildings, which is what makes tenant isolation visible.
COMPANIES = (
    ("Sonwoy", "Sonwoy", "sonwoy@greenchain.test"),
    ("Monosh", "Monosh", "monosh@greenchain.test"),
)

# Auditors belong to no organisation: they review across all of them, and a
# company picks one per building. More than one exists so that choice is a real
# choice rather than a dropdown with a single entry.
AUDITORS = (
    ("Aisyah Rahman", "aisyah@greenchain.test"),
    ("Daniel Chong", "daniel@greenchain.test"),
    ("Priya Nair", "priya@greenchain.test"),
)

# Accounts this seeder removes if it finds them. The single shared uploader is
# gone: it belonged to no particular company, so nothing it did could show
# whether one organisation can reach another's data.
RETIRED_EMAILS = ("uploader@greenchain.test", "auditor@greenchain.test")


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


def retire_user(db: Session, email: str) -> str:
    """Remove an account that is no longer part of the seed set.

    An account that has filed submissions is left alone and reported. Deleting it
    would mean deleting that evidence and its audit trail, which this script has
    no business doing on its own - that is a decision for whoever runs it.
    """
    user = db.scalars(select(User).where(User.email == normalize_email(email))).first()
    if user is None:
        return f"{email}: already absent"

    from backend.app.models.submission import Submission

    submissions = db.scalars(select(Submission).where(Submission.uploader_id == user.id)).all()
    if submissions:
        return (f"{email}: KEPT - it filed {len(submissions)} submission(s) "
                f"({', '.join(str(item.id) for item in submissions)}). Remove those first.")

    for membership in db.scalars(select(OrganisationMember).where(OrganisationMember.user_id == user.id)).all():
        db.delete(membership)
    db.delete(user)
    return f"{email}: removed"


def seed_auth_data() -> list[str]:
    settings = get_settings()
    if not settings.dev_seed_password:
        raise RuntimeError("DEV_SEED_PASSWORD is required to seed development users.")

    notes: list[str] = []
    with SessionLocal() as db:
        password_hash = hash_password(settings.dev_seed_password)

        viewer = upsert_user(
            db,
            name="GreenChain Viewer",
            email="viewer@greenchain.test",
            role=UserRole.VIEWER,
            password_hash=password_hash,
        )
        auditors = [
            upsert_user(db, name=name, email=email, role=UserRole.AUDITOR, password_hash=password_hash)
            for name, email in AUDITORS
        ]
        for name, email in AUDITORS:
            notes.append(f"{email}: auditor ({name})")

        for organisation_name, account_name, email in COMPANIES:
            organisation = db.scalars(select(Organisation).where(Organisation.name == organisation_name)).first()
            if organisation is None:
                organisation = Organisation(name=organisation_name)
                db.add(organisation)
                db.flush()

            company = upsert_user(
                db, name=account_name, email=email,
                role=UserRole.UPLOADER, password_hash=password_hash,
            )
            db.flush()

            membership = db.scalars(
                select(OrganisationMember).where(OrganisationMember.user_id == company.id)
            ).first()
            if membership is None:
                db.add(OrganisationMember(user_id=company.id, organisation_id=organisation.id))
            else:
                membership.organisation_id = organisation.id
            notes.append(f"{email}: company account for {organisation_name}")

        # Viewers and auditors act across organisations, so they belong to none.
        for user in (viewer, *auditors):
            for membership in db.scalars(select(OrganisationMember).where(OrganisationMember.user_id == user.id)).all():
                db.delete(membership)

        db.flush()
        for email in RETIRED_EMAILS:
            notes.append(retire_user(db, email))

        db.commit()
    return notes


def main() -> None:
    for note in seed_auth_data():
        print(f"  {note}")
    print("Seeded development auth accounts.")


if __name__ == "__main__":
    main()
