from enum import StrEnum

from backend.app.auth.models import UserRole


class Permission(StrEnum):
    VIEW_SHARED = "VIEW_SHARED"
    UPLOAD_SUBMISSION = "UPLOAD_SUBMISSION"
    REVIEW_SUBMISSION = "REVIEW_SUBMISSION"


ROLE_PERMISSIONS: dict[UserRole, frozenset[Permission]] = {
    UserRole.VIEWER: frozenset({Permission.VIEW_SHARED}),
    UserRole.UPLOADER: frozenset({Permission.VIEW_SHARED, Permission.UPLOAD_SUBMISSION}),
    UserRole.AUDITOR: frozenset({Permission.VIEW_SHARED, Permission.REVIEW_SUBMISSION}),
}


def role_has_permission(role: UserRole, permission: Permission) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, frozenset())
