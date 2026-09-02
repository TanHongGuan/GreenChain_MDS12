from pydantic import BaseModel, field_validator

from backend.app.auth.models import UserRole


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("Email must be a valid email address.")
        return normalized


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    organisation_id: str | None = None


class LoginResponse(BaseModel):
    user: UserResponse
