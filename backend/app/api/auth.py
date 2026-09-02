from fastapi import APIRouter, Depends, Response, status

from backend.app.auth.dependencies import AUTH_COOKIE_NAME, get_current_user
from backend.app.auth.models import AuthUser, UserRepository
from backend.app.auth.schemas import LoginRequest, LoginResponse, UserResponse
from backend.app.auth.security import create_access_token
from backend.app.auth.service import authenticate_user
from backend.app.core.config import Settings, get_settings
from backend.app.core.errors import api_error
from backend.app.repositories.users import get_user_repository

router = APIRouter(prefix="/auth", tags=["auth"])


def serialize_user(user: AuthUser) -> UserResponse:
    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        organisation_id=user.organisation_id,
    )


@router.post("/login", response_model=LoginResponse)
def login(
    credentials: LoginRequest,
    response: Response,
    settings: Settings = Depends(get_settings),
    user_repository: UserRepository = Depends(get_user_repository),
) -> LoginResponse:
    user = authenticate_user(user_repository, credentials.email, credentials.password)
    if user is None:
        raise api_error(status.HTTP_401_UNAUTHORIZED, "INVALID_CREDENTIALS", "Email or password is incorrect.")

    token = create_access_token(user.id, settings)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
    )
    return LoginResponse(user=serialize_user(user))


@router.get("/me", response_model=LoginResponse)
def me(current_user: AuthUser = Depends(get_current_user)) -> LoginResponse:
    return LoginResponse(user=serialize_user(current_user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, settings: Settings = Depends(get_settings)) -> None:
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
