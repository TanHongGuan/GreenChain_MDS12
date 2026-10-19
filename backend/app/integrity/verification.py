"""Integrity verification of one exact stored evidence version.

A check recomputes SHA-256 over the retrieved bytes and compares it with:

* the digest recorded in PostgreSQL when the submission was created, and
* the checksum the storage provider recorded with the object version (S3 `ChecksumSHA256`), when
  the backend has one.

The provider checksum is held with a locked object version and cannot be edited through the
application database, so it is the trusted reference. If someone alters the PostgreSQL digest,
the two references disagree and the check reports MISMATCH rather than trusting the database alone.

MATCH means "these bytes are the bytes that were stored". It says nothing about whether the
measurements inside the file are accurate.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from io import BytesIO

from backend.app.integrity.hashing import calculate_sha256
from backend.app.storage.base import StorageService
from backend.app.storage.exceptions import StorageError

ALGORITHM = "SHA-256"


class IntegrityStatus(StrEnum):
    MATCH = "MATCH"
    MISMATCH = "MISMATCH"
    UNAVAILABLE = "UNAVAILABLE"


class TrustedReference(StrEnum):
    # Database digest corroborated by a provider-held checksum on the object version.
    STORAGE_CHECKSUM = "STORAGE_CHECKSUM"
    # Only the PostgreSQL digest was available (local storage); detects file changes but not a
    # coordinated edit of both file and database.
    DATABASE_ONLY = "DATABASE_ONLY"


@dataclass(frozen=True)
class IntegrityCheck:
    status: IntegrityStatus
    expected_sha256: str | None
    actual_sha256: str | None
    storage_sha256: str | None
    trusted_reference: TrustedReference | None
    storage_key: str
    version_id: str | None
    checked_at: datetime
    algorithm: str = ALGORITHM
    reason: str | None = None

    @property
    def matches(self) -> bool | None:
        if self.status == IntegrityStatus.UNAVAILABLE:
            return None
        return self.status == IntegrityStatus.MATCH


def _unavailable(storage_key: str, version_id: str | None, expected: str | None, reason: str) -> IntegrityCheck:
    return IntegrityCheck(
        status=IntegrityStatus.UNAVAILABLE,
        expected_sha256=expected,
        actual_sha256=None,
        storage_sha256=None,
        trusted_reference=None,
        storage_key=storage_key,
        version_id=version_id,
        checked_at=datetime.now(UTC),
        reason=reason,
    )


def verify_bytes(
    content: bytes,
    *,
    expected_sha256: str | None,
    storage_sha256: str | None,
    storage_key: str,
    version_id: str | None,
) -> IntegrityCheck:
    expected = expected_sha256.lower() if expected_sha256 else None
    anchor = storage_sha256.lower() if storage_sha256 else None
    actual = calculate_sha256(BytesIO(content))

    if expected is None:
        return _unavailable(storage_key, version_id, None, "No recorded digest for this evidence.")

    reason = None
    if anchor is not None and actual != anchor:
        reason = "Stored bytes do not match the storage provider checksum."
    elif actual != expected:
        reason = (
            "Recorded database digest does not match the storage provider checksum."
            if anchor is not None
            else "Stored bytes do not match the recorded digest."
        )

    return IntegrityCheck(
        status=IntegrityStatus.MISMATCH if reason else IntegrityStatus.MATCH,
        expected_sha256=expected,
        actual_sha256=actual,
        storage_sha256=anchor,
        trusted_reference=TrustedReference.STORAGE_CHECKSUM if anchor else TrustedReference.DATABASE_ONLY,
        storage_key=storage_key,
        version_id=version_id,
        checked_at=datetime.now(UTC),
        reason=reason,
    )


def verify_stored_evidence(
    storage: StorageService,
    storage_key: str,
    version_id: str | None,
    expected_sha256: str | None,
) -> IntegrityCheck:
    """Verify one stored version. Never raises for storage problems: those are UNAVAILABLE."""
    try:
        content = storage.retrieve(storage_key, version_id)
    except StorageError:
        return _unavailable(storage_key, version_id, expected_sha256, "Evidence version could not be retrieved.")

    try:
        storage_sha256 = storage.describe(storage_key, version_id).sha256
    except StorageError:
        storage_sha256 = None

    return verify_bytes(
        content,
        expected_sha256=expected_sha256,
        storage_sha256=storage_sha256,
        storage_key=storage_key,
        version_id=version_id,
    )
