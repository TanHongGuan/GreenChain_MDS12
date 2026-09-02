from enum import Enum
from typing import Protocol

from pydantic import BaseModel


class UserRole(str, Enum):
    VIEWER = "VIEWER"
    UPLOADER = "UPLOADER"
    AUDITOR = "AUDITOR"


class AuthUser(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    organisation_id: str | None = None
    password_hash: str


class UserRepository(Protocol):
    def get_user_by_email(self, email: str) -> AuthUser | None:
        ...

    def get_user_by_id(self, user_id: str) -> AuthUser | None:
        ...
