from datetime import datetime

from pydantic import BaseModel


ACCEPTED_UPLOAD_EXTENSIONS = {".csv", ".xlsx"}
ACCEPTED_UPLOAD_CONTENT_TYPES = {
    "text/csv",
    "application/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


class StoredFile(BaseModel):
    storage_key: str
    original_filename: str
    size_bytes: int
    content_type: str | None = None
    storage_backend: str
    # SHA-256 (lowercase hex) of the exact bytes written.
    sha256: str | None = None
    # Versioned backends (S3) identify the exact immutable object version; None for local storage.
    version_id: str | None = None
    # Object Lock retention applied to this version, if any.
    retention_mode: str | None = None
    retain_until: datetime | None = None


class StoredObjectInfo(BaseModel):
    """Metadata the storage provider itself records for one object version.

    `sha256` is the provider-recorded checksum (S3 `ChecksumSHA256`), which is held with the
    object version and cannot be edited on a locked version. It is the trusted reference that is
    independent of PostgreSQL. Backends without such a checksum (local storage) return None.
    """

    storage_key: str
    version_id: str | None = None
    size_bytes: int | None = None
    sha256: str | None = None
    retention_mode: str | None = None
    retain_until: datetime | None = None
    storage_backend: str
