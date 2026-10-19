"""AWS S3 evidence storage with versioning and Object Lock (WORM) retention.

Every write returns the S3 VersionId of the exact object version created, and callers must persist
it: an S3 key alone is mutable (a new upload to the same key creates a new version), whereas a
locked version cannot be overwritten or deleted until its retain-until date passes.

Each PUT sends a SHA-256 checksum that S3 validates on receipt and records with the version. That
provider-held checksum is the trusted reference used by integrity verification, independent of the
copy of the digest held in PostgreSQL.
"""

import base64
import binascii
import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any, BinaryIO
from uuid import uuid4

from botocore.exceptions import BotoCoreError, ClientError

from backend.app.storage.exceptions import (
    FileNotFoundInStorage,
    ObjectLocked,
    StorageError,
    StorageMisconfigured,
)
from backend.app.storage.keys import safe_filename, validate_storage_key
from backend.app.storage.models import StoredFile, StoredObjectInfo

_NOT_FOUND_CODES = {"404", "NoSuchKey", "NoSuchVersion", "NotFound"}
_LOCKED_CODES = {"AccessDenied", "InvalidRequest"}


def _error_code(exc: ClientError) -> str:
    return str(exc.response.get("Error", {}).get("Code", ""))


def _hex_from_s3_checksum(value: str | None) -> str | None:
    """Convert S3's base64 ChecksumSHA256 to lowercase hex.

    Multipart uploads report a checksum-of-checksums ("<b64>-<parts>") that is not the digest of
    the object bytes; return None for those rather than a misleading value.
    """
    if not value or "-" in value:
        return None
    try:
        return base64.b64decode(value, validate=True).hex()
    except (binascii.Error, ValueError):
        return None


class S3StorageService:
    backend_name = "s3"

    def __init__(
        self,
        client: Any,
        bucket: str,
        *,
        key_prefix: str = "",
        lock_mode: str | None = "GOVERNANCE",
        retention_days: int = 1,
        lock_processed: bool = True,
    ) -> None:
        if not bucket:
            raise StorageMisconfigured("S3_BUCKET is required when STORAGE_BACKEND=s3.")
        self.client = client
        self.bucket = bucket
        self.key_prefix = key_prefix.strip("/") + "/" if key_prefix.strip("/") else ""
        mode = (lock_mode or "NONE").upper()
        self.lock_mode = None if mode == "NONE" else mode
        self.retention_days = retention_days
        self.lock_processed = lock_processed

    # -- configuration checks -------------------------------------------------------------

    def initialise(self) -> None:
        """Fail closed unless the bucket can actually provide versioned, lockable evidence."""
        try:
            versioning = self.client.get_bucket_versioning(Bucket=self.bucket)
        except (ClientError, BotoCoreError) as exc:
            raise StorageMisconfigured(f"S3 bucket '{self.bucket}' is not reachable: {exc}") from exc
        if versioning.get("Status") != "Enabled":
            raise StorageMisconfigured(f"S3 bucket '{self.bucket}' does not have versioning enabled.")

        if self.lock_mode is None:
            return
        try:
            lock = self.client.get_object_lock_configuration(Bucket=self.bucket)
        except (ClientError, BotoCoreError) as exc:
            raise StorageMisconfigured(f"S3 bucket '{self.bucket}' does not have Object Lock enabled.") from exc
        if lock.get("ObjectLockConfiguration", {}).get("ObjectLockEnabled") != "Enabled":
            raise StorageMisconfigured(f"S3 bucket '{self.bucket}' does not have Object Lock enabled.")

    # -- writes ---------------------------------------------------------------------------

    def store_original(self, file_obj: BinaryIO, original_filename: str, content_type: str | None = None) -> StoredFile:
        return self._store("original", file_obj, original_filename, content_type, lock=self.lock_mode is not None)

    def store_processed(self, file_obj: BinaryIO, original_filename: str, content_type: str | None = None) -> StoredFile:
        return self._store(
            "processed",
            file_obj,
            original_filename,
            content_type,
            lock=self.lock_mode is not None and self.lock_processed,
        )

    def _store(
        self, kind: str, file_obj: BinaryIO, original_filename: str, content_type: str | None, *, lock: bool
    ) -> StoredFile:
        name = safe_filename(original_filename)
        storage_key = f"{self.key_prefix}{kind}/{uuid4()}/{name}"
        body = file_obj.read()
        digest = hashlib.sha256(body).digest()

        request: dict[str, Any] = {
            "Bucket": self.bucket,
            "Key": storage_key,
            "Body": body,
            # S3 rejects the PUT if the received bytes do not hash to this value, and stores it
            # with the version as the provider-held trusted checksum. S3 also requires a declared
            # checksum algorithm on any PUT that sets Object Lock retention.
            "ChecksumAlgorithm": "SHA256",
            "ChecksumSHA256": base64.b64encode(digest).decode("ascii"),
            "Metadata": {"original-filename": name, "sha256": digest.hex()},
        }
        if content_type:
            request["ContentType"] = content_type

        retain_until = None
        if lock:
            retain_until = datetime.now(UTC) + timedelta(days=self.retention_days)
            request["ObjectLockMode"] = self.lock_mode
            request["ObjectLockRetainUntilDate"] = retain_until

        try:
            response = self.client.put_object(**request)
        except (ClientError, BotoCoreError) as exc:
            raise StorageError(f"Evidence could not be written to S3: {exc}") from exc

        version_id = response.get("VersionId")
        if not version_id or version_id == "null":
            raise StorageMisconfigured("S3 did not return a VersionId; bucket versioning must be enabled.")

        return StoredFile(
            storage_key=storage_key,
            original_filename=name,
            size_bytes=len(body),
            content_type=content_type,
            storage_backend=self.backend_name,
            sha256=digest.hex(),
            version_id=version_id,
            retention_mode=self.lock_mode if lock else None,
            retain_until=retain_until,
        )

    # -- reads ----------------------------------------------------------------------------

    def _object_args(self, storage_key: str, version_id: str | None) -> dict[str, Any]:
        validate_storage_key(storage_key)
        args: dict[str, Any] = {"Bucket": self.bucket, "Key": storage_key}
        if version_id:
            args["VersionId"] = version_id
        return args

    def retrieve(self, storage_key: str, version_id: str | None = None) -> bytes:
        try:
            response = self.client.get_object(**self._object_args(storage_key, version_id))
            return response["Body"].read()
        except ClientError as exc:
            if _error_code(exc) in _NOT_FOUND_CODES:
                raise FileNotFoundInStorage("Stored object version was not found.") from exc
            raise StorageError(f"Evidence could not be read from S3: {exc}") from exc
        except BotoCoreError as exc:
            raise StorageError(f"Evidence could not be read from S3: {exc}") from exc

    def exists(self, storage_key: str, version_id: str | None = None) -> bool:
        try:
            self.describe(storage_key, version_id)
        except StorageError:
            return False
        return True

    def describe(self, storage_key: str, version_id: str | None = None) -> StoredObjectInfo:
        try:
            head = self.client.head_object(**self._object_args(storage_key, version_id), ChecksumMode="ENABLED")
        except ClientError as exc:
            if _error_code(exc) in _NOT_FOUND_CODES:
                raise FileNotFoundInStorage("Stored object version was not found.") from exc
            raise StorageError(f"Evidence metadata could not be read from S3: {exc}") from exc
        except BotoCoreError as exc:
            raise StorageError(f"Evidence metadata could not be read from S3: {exc}") from exc

        return StoredObjectInfo(
            storage_key=storage_key,
            version_id=head.get("VersionId") or version_id,
            size_bytes=head.get("ContentLength"),
            sha256=_hex_from_s3_checksum(head.get("ChecksumSHA256")),
            retention_mode=head.get("ObjectLockMode"),
            retain_until=head.get("ObjectLockRetainUntilDate"),
            storage_backend=self.backend_name,
        )

    # -- deletes --------------------------------------------------------------------------

    def delete_if_allowed(self, storage_key: str, version_id: str | None = None) -> None:
        """Permanently delete one specific version, if retention allows it.

        A delete without a VersionId only adds a delete marker and would hide evidence while
        leaving it in the bucket, so it is refused. Never sends BypassGovernanceRetention.
        """
        if not version_id:
            raise StorageError("S3 deletes must name an exact VersionId.")
        try:
            self.client.delete_object(**self._object_args(storage_key, version_id))
        except ClientError as exc:
            code = _error_code(exc)
            if code in _NOT_FOUND_CODES:
                raise FileNotFoundInStorage("Stored object version was not found.") from exc
            if code in _LOCKED_CODES:
                raise ObjectLocked("Object version is protected by S3 Object Lock retention.") from exc
            raise StorageError(f"Evidence could not be deleted from S3: {exc}") from exc
        except BotoCoreError as exc:
            raise StorageError(f"Evidence could not be deleted from S3: {exc}") from exc
