from collections.abc import Callable

from fastapi import Cookie, Depends, status

from backend.app.auth.models import AuthUser, UserRepository, UserRole
from backend.app.auth.security import TokenExpired, TokenInvalid, decode_access_token
from backend.app.core.config import Settings, get_settings
from backend.app.core.errors import api_error
from backend.app.repositories.users import get_user_repository

AUTH_COOKIE_NAME = "greenchain_access_token"


def get_current_user(
    access_token: str | None = Cookie(default=None, alias=AUTH_COOKIE_NAME),
    settings: Settings = Depends(get_settings),
    user_repository: UserRepository = Depends(get_user_repository),
) -> AuthUser:
    if not access_token:
        raise api_error(
            status.HTTP_401_UNAUTHORIZED,
            "AUTHENTICATION_REQUIRED",
            "Authentication is required.",
        )

    try:
        user_id = decode_access_token(access_token, settings)
    except TokenExpired:
        raise api_error(status.HTTP_401_UNAUTHORIZED, "TOKEN_EXPIRED", "Authentication token has expired.")
    except TokenInvalid:
        raise api_error(status.HTTP_401_UNAUTHORIZED, "INVALID_TOKEN", "Authentication token is invalid.")

    user = user_repository.get_user_by_id(user_id)
    if user is None:
        raise api_error(status.HTTP_401_UNAUTHORIZED, "INVALID_TOKEN", "Authentication token is invalid.")
    return user


def require_roles(*roles: UserRole | str) -> Callable[[AuthUser], AuthUser]:
    allowed_roles = {role if isinstance(role, UserRole) else UserRole(role) for role in roles}

    def dependency(current_user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if current_user.role not in allowed_roles:
            raise api_error(
                status.HTTP_403_FORBIDDEN,
                "FORBIDDEN",
                "You do not have permission to perform this action.",
            )
        return current_user

    return dependency
