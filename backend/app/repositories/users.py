from functools import lru_cache

from backend.app.auth.models import AuthUser, UserRepository, UserRole
from backend.app.auth.security import hash_password
from backend.app.core.config import Settings, get_settings


class InMemoryUserRepository:
    """Development/test-only repository until Member 3 connects persistent users."""

    def __init__(self, users: list[AuthUser]) -> None:
        self._users_by_id = {user.id: user for user in users}
        self._users_by_email = {user.email.lower(): user for user in users}

    def get_user_by_email(self, email: str) -> AuthUser | None:
        return self._users_by_email.get(email.strip().lower())

    def get_user_by_id(self, user_id: str) -> AuthUser | None:
        return self._users_by_id.get(user_id)


def build_development_user_repository(settings: Settings) -> InMemoryUserRepository:
    password = settings.dev_user_password
    return InMemoryUserRepository(
        users=[
            AuthUser(
                id="dev-viewer",
                name="GreenChain Viewer",
                email="viewer@greenchain.test",
                role=UserRole.VIEWER,
                organisation_id="greenchain-demo",
                password_hash=hash_password(password),
            ),
            AuthUser(
                id="dev-uploader",
                name="GreenChain Uploader",
                email="uploader@greenchain.test",
                role=UserRole.UPLOADER,
                organisation_id="greenchain-demo",
                password_hash=hash_password(password),
            ),
            AuthUser(
                id="dev-auditor",
                name="GreenChain Auditor",
                email="auditor@greenchain.test",
                role=UserRole.AUDITOR,
                organisation_id="greenchain-demo",
                password_hash=hash_password(password),
            ),
        ]
    )


@lru_cache
def get_user_repository() -> UserRepository:
    settings = get_settings()
    if not settings.enable_dev_users:
        return InMemoryUserRepository(users=[])
    return build_development_user_repository(settings)
