from collections.abc import Generator

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from backend.app.auth.models import AuthUser, UserRepository, UserRole
from backend.app.core.database import get_db
from backend.app.models.user import User


def normalize_email(email: str) -> str:
    return email.strip().lower()


class SQLAlchemyUserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_user_by_email(self, email: str) -> AuthUser | None:
        stmt = (
            select(User)
            .options(joinedload(User.organisation_membership))
            .where(User.email == normalize_email(email))
        )
        return self._to_auth_user(self.db.scalars(stmt).first())

    def get_user_by_id(self, user_id: str) -> AuthUser | None:
        stmt = select(User).options(joinedload(User.organisation_membership)).where(User.id == user_id)
        return self._to_auth_user(self.db.scalars(stmt).first())

    def _to_auth_user(self, user: User | None) -> AuthUser | None:
        if user is None or not user.is_active:
            return None
        membership = user.organisation_membership
        return AuthUser(
            id=user.id,
            name=user.name,
            email=user.email,
            role=UserRole(user.role),
            organisation_id=membership.organisation_id if membership else None,
            password_hash=user.password_hash,
            is_active=user.is_active,
        )


def get_user_repository(db: Session = Depends(get_db)) -> Generator[UserRepository]:
    yield SQLAlchemyUserRepository(db)
