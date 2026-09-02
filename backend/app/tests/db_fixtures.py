from collections.abc import Callable, Generator
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.auth.models import UserRole
from backend.app.auth.security import hash_password
from backend.app.core.database import Base
from backend.app.models.organisation import Organisation
from backend.app.models.organisation_member import OrganisationMember
from backend.app.models.user import User
from backend.app.repositories.users import SQLAlchemyUserRepository, normalize_email


def build_session_factory(db_path: Path) -> sessionmaker[Session]:
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False}, future=True)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def seed_test_auth_users(db: Session, password: str = "password") -> dict[str, User]:
    organisation = Organisation(name="GreenChain Demo Organisation")
    db.add(organisation)
    db.flush()

    password_hash = hash_password(password)
    viewer = User(
        name="GreenChain Viewer",
        email=normalize_email("viewer@greenchain.test"),
        role=UserRole.VIEWER.value,
        password_hash=password_hash,
    )
    uploader = User(
        name="GreenChain Uploader",
        email=normalize_email("uploader@greenchain.test"),
        role=UserRole.UPLOADER.value,
        password_hash=password_hash,
    )
    auditor = User(
        name="GreenChain Auditor",
        email=normalize_email("auditor@greenchain.test"),
        role=UserRole.AUDITOR.value,
        password_hash=password_hash,
    )
    db.add_all([viewer, uploader, auditor])
    db.flush()
    db.add(OrganisationMember(user_id=uploader.id, organisation_id=organisation.id))
    db.commit()
    return {"viewer": viewer, "uploader": uploader, "auditor": auditor}


def make_repository_override(session_factory: sessionmaker[Session]) -> Callable[[], Generator[SQLAlchemyUserRepository]]:
    def override() -> Generator[SQLAlchemyUserRepository]:
        db = session_factory()
        try:
            yield SQLAlchemyUserRepository(db)
        finally:
            db.close()

    return override


def install_repository_override(app: FastAPI, dependency: Callable, session_factory: sessionmaker[Session]) -> None:
    app.dependency_overrides[dependency] = make_repository_override(session_factory)
