from backend.app.auth.models import AuthUser, UserRepository
from backend.app.auth.security import verify_password


def authenticate_user(user_repository: UserRepository, email: str, password: str) -> AuthUser | None:
    user = user_repository.get_user_by_email(email.strip().lower())
    if user is None:
        return None
    if not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user
