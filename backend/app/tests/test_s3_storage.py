import base64
import hashlib
from datetime import UTC, datetime, timedelta
from io import BytesIO

import pytest

from backend.app.core.config import Settings
from backend.app.storage.dependencies import build_s3_storage
from backend.app.storage.exceptions import (
    FileNotFoundInStorage,
    InvalidStorageKey,
    ObjectLocked,
    StorageError,
    StorageMisconfigured,
)
from backend.app.storage.s3 import S3StorageService
from backend.app.tests.s3_fixtures import TEST_BUCKET, TEST_REGION, s3_client, s3_storage  # noqa: F401

ORIGINAL = b"metric_name,value,unit,category\nelectricity_consumption,366300,kWh,Energy\n"


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def test_store_original_returns_exact_version_digest_and_retention(s3_storage) -> None:
    before = datetime.now(UTC)

    stored = s3_storage.store_original(BytesIO(ORIGINAL), "../Report 2026.csv", "text/csv")

    assert stored.storage_backend == "s3"
    assert stored.storage_key.startswith("original/")
    assert stored.storage_key.endswith("/Report_2026.csv")
    assert stored.version_id
    assert stored.sha256 == sha256_hex(ORIGINAL)
    assert stored.size_bytes == len(ORIGINAL)
    assert stored.retention_mode == "GOVERNANCE"
    assert before + timedelta(hours=23) < stored.retain_until <= datetime.now(UTC) + timedelta(days=1)


def test_s3_records_its_own_sha256_checksum_for_the_version(s3_storage, s3_client) -> None:
    stored = s3_storage.store_original(BytesIO(ORIGINAL), "report.csv")

    info = s3_storage.describe(stored.storage_key, stored.version_id)
    head = s3_client.head_object(
        Bucket=TEST_BUCKET, Key=stored.storage_key, VersionId=stored.version_id, ChecksumMode="ENABLED"
    )

    assert info.sha256 == sha256_hex(ORIGINAL)
    assert head["ChecksumSHA256"] == base64.b64encode(hashlib.sha256(ORIGINAL).digest()).decode()
    assert info.retention_mode == "GOVERNANCE"
    assert info.retain_until is not None
    assert info.version_id == stored.version_id


def test_locked_version_cannot_be_deleted(s3_storage) -> None:
    stored = s3_storage.store_original(BytesIO(ORIGINAL), "report.csv")

    with pytest.raises(ObjectLocked):
        s3_storage.delete_if_allowed(stored.storage_key, stored.version_id)

    assert s3_storage.retrieve(stored.storage_key, stored.version_id) == ORIGINAL


def test_new_upload_to_same_key_does_not_alter_locked_version(s3_storage, s3_client) -> None:
    stored = s3_storage.store_original(BytesIO(ORIGINAL), "report.csv")

    s3_client.put_object(Bucket=TEST_BUCKET, Key=stored.storage_key, Body=b"tampered")

    assert s3_storage.retrieve(stored.storage_key) == b"tampered"
    assert s3_storage.retrieve(stored.storage_key, stored.version_id) == ORIGINAL
    assert sha256_hex(s3_storage.retrieve(stored.storage_key, stored.version_id)) == stored.sha256


def test_delete_without_version_is_refused(s3_storage) -> None:
    stored = s3_storage.store_original(BytesIO(ORIGINAL), "report.csv")

    with pytest.raises(StorageError, match="VersionId"):
        s3_storage.delete_if_allowed(stored.storage_key)

    assert s3_storage.exists(stored.storage_key, stored.version_id)


def test_processed_files_are_locked_by_default(s3_storage) -> None:
    stored = s3_storage.store_processed(BytesIO(b"metric_name,value\n"), "report.csv", "text/csv")

    assert stored.retention_mode == "GOVERNANCE"
    with pytest.raises(ObjectLocked):
        s3_storage.delete_if_allowed(stored.storage_key, stored.version_id)


def test_unlocked_processed_files_can_be_deleted_when_configured(s3_client) -> None:
    storage = S3StorageService(s3_client, TEST_BUCKET, lock_mode="GOVERNANCE", lock_processed=False)
    stored = storage.store_processed(BytesIO(b"metric_name,value\n"), "report.csv", "text/csv")

    assert stored.retention_mode is None
    storage.delete_if_allowed(stored.storage_key, stored.version_id)
    assert not storage.exists(stored.storage_key, stored.version_id)


def test_lock_mode_none_stores_versions_without_retention(s3_client) -> None:
    storage = S3StorageService(s3_client, TEST_BUCKET, lock_mode="NONE")
    stored = storage.store_original(BytesIO(ORIGINAL), "report.csv")

    assert stored.version_id
    assert stored.retention_mode is None
    assert stored.retain_until is None


def test_missing_version_raises_not_found(s3_storage) -> None:
    stored = s3_storage.store_original(BytesIO(ORIGINAL), "report.csv")

    with pytest.raises(FileNotFoundInStorage):
        s3_storage.retrieve("original/missing/report.csv")
    with pytest.raises(FileNotFoundInStorage):
        s3_storage.describe("original/missing/report.csv")
    assert s3_storage.exists("original/missing/report.csv") is False
    assert s3_storage.exists(stored.storage_key, stored.version_id) is True


def test_unknown_version_id_is_not_found(s3_storage) -> None:
    stored = s3_storage.store_original(BytesIO(ORIGINAL), "report.csv")

    with pytest.raises(StorageError):
        s3_storage.retrieve(stored.storage_key, "not-a-real-version")


@pytest.mark.parametrize("key", ["../../etc/passwd", "/abs/key.csv", "original/a/../../b", ""])
def test_malicious_keys_are_rejected(s3_storage, key: str) -> None:
    with pytest.raises(InvalidStorageKey):
        s3_storage.retrieve(key)


def test_key_prefix_is_applied(s3_client) -> None:
    storage = S3StorageService(s3_client, TEST_BUCKET, key_prefix="/demo/")
    stored = storage.store_original(BytesIO(ORIGINAL), "report.csv")

    assert stored.storage_key.startswith("demo/original/")


def test_initialise_accepts_versioned_object_lock_bucket(s3_storage) -> None:
    s3_storage.initialise()


def test_initialise_rejects_bucket_without_object_lock(s3_client) -> None:
    s3_client.create_bucket(Bucket="plain-bucket", CreateBucketConfiguration={"LocationConstraint": TEST_REGION})
    s3_client.put_bucket_versioning(Bucket="plain-bucket", VersioningConfiguration={"Status": "Enabled"})

    with pytest.raises(StorageMisconfigured, match="Object Lock"):
        S3StorageService(s3_client, "plain-bucket").initialise()


def test_initialise_rejects_unversioned_bucket(s3_client) -> None:
    s3_client.create_bucket(Bucket="plain-bucket", CreateBucketConfiguration={"LocationConstraint": TEST_REGION})

    with pytest.raises(StorageMisconfigured, match="versioning"):
        S3StorageService(s3_client, "plain-bucket", lock_mode="NONE").initialise()


def test_initialise_rejects_missing_bucket(s3_client) -> None:
    with pytest.raises(StorageMisconfigured, match="not reachable"):
        S3StorageService(s3_client, "does-not-exist").initialise()


def test_missing_bucket_name_fails_clearly(s3_client) -> None:
    with pytest.raises(StorageMisconfigured, match="S3_BUCKET"):
        S3StorageService(s3_client, "")


def test_settings_build_s3_storage(s3_client) -> None:
    settings = Settings(
        STORAGE_BACKEND="s3",
        S3_BUCKET=TEST_BUCKET,
        AWS_REGION=TEST_REGION,
        S3_OBJECT_LOCK_MODE="governance",
        S3_RETENTION_DAYS=3,
        S3_LOCK_PROCESSED=False,
    )

    storage = build_s3_storage(settings, client=s3_client)

    assert isinstance(storage, S3StorageService)
    assert storage.lock_mode == "GOVERNANCE"
    assert storage.retention_days == 3
    assert storage.lock_processed is False


def test_compliance_mode_requires_explicit_opt_in() -> None:
    with pytest.raises(ValueError, match="S3_ALLOW_COMPLIANCE_MODE"):
        Settings(S3_OBJECT_LOCK_MODE="COMPLIANCE")

    assert Settings(S3_OBJECT_LOCK_MODE="COMPLIANCE", S3_ALLOW_COMPLIANCE_MODE=True).s3_object_lock_mode == "COMPLIANCE"


@pytest.mark.parametrize("bad", [{"S3_OBJECT_LOCK_MODE": "LEGAL"}, {"S3_RETENTION_DAYS": 0}])
def test_invalid_s3_settings_are_rejected(bad) -> None:
    with pytest.raises(ValueError):
        Settings(**bad)
