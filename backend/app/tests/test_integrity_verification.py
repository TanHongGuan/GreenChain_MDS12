import hashlib
from io import BytesIO

from backend.app.integrity.verification import (
    IntegrityStatus,
    TrustedReference,
    verify_bytes,
    verify_stored_evidence,
)
from backend.app.storage.local import LocalStorageService
from backend.app.tests.s3_fixtures import TEST_BUCKET, s3_client, s3_storage  # noqa: F401

ORIGINAL = b"metric_name,value,unit\nwater_consumption,5415,m3\n"


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def test_unchanged_s3_original_matches_against_storage_checksum(s3_storage) -> None:
    stored = s3_storage.store_original(BytesIO(ORIGINAL), "report.csv")

    check = verify_stored_evidence(s3_storage, stored.storage_key, stored.version_id, sha256_hex(ORIGINAL))

    assert check.status == IntegrityStatus.MATCH
    assert check.matches is True
    assert check.trusted_reference == TrustedReference.STORAGE_CHECKSUM
    assert check.storage_sha256 == check.actual_sha256 == check.expected_sha256
    assert check.version_id == stored.version_id
    assert check.algorithm == "SHA-256"


def test_edited_database_digest_is_not_trusted(s3_storage) -> None:
    """Someone rewrites the PostgreSQL digest to match tampered bytes; S3's checksum exposes it."""
    stored = s3_storage.store_original(BytesIO(ORIGINAL), "report.csv")
    forged_digest = sha256_hex(b"forged")

    check = verify_stored_evidence(s3_storage, stored.storage_key, stored.version_id, forged_digest)

    assert check.status == IntegrityStatus.MISMATCH
    assert check.storage_sha256 == sha256_hex(ORIGINAL)
    assert "storage provider checksum" in check.reason


def test_modified_local_copy_mismatches(s3_storage) -> None:
    stored = s3_storage.store_original(BytesIO(ORIGINAL), "report.csv")
    downloaded = s3_storage.retrieve(stored.storage_key, stored.version_id)
    edited_copy = downloaded.replace(b"5415", b"5416")

    check = verify_bytes(
        edited_copy,
        expected_sha256=stored.sha256,
        storage_sha256=s3_storage.describe(stored.storage_key, stored.version_id).sha256,
        storage_key=stored.storage_key,
        version_id=stored.version_id,
    )

    assert check.status == IntegrityStatus.MISMATCH
    assert check.actual_sha256 != stored.sha256


def test_wrong_version_is_unavailable_not_success(s3_storage) -> None:
    stored = s3_storage.store_original(BytesIO(ORIGINAL), "report.csv")

    check = verify_stored_evidence(s3_storage, stored.storage_key, "missing-version", stored.sha256)

    assert check.status == IntegrityStatus.UNAVAILABLE
    assert check.matches is None


def test_missing_key_is_unavailable(s3_storage) -> None:
    check = verify_stored_evidence(s3_storage, "original/none/report.csv", None, sha256_hex(ORIGINAL))

    assert check.status == IntegrityStatus.UNAVAILABLE


def test_missing_recorded_digest_is_unavailable(s3_storage) -> None:
    stored = s3_storage.store_original(BytesIO(ORIGINAL), "report.csv")

    check = verify_stored_evidence(s3_storage, stored.storage_key, stored.version_id, None)

    assert check.status == IntegrityStatus.UNAVAILABLE


def test_local_storage_falls_back_to_database_digest(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")
    stored = storage.store_original(BytesIO(ORIGINAL), "report.csv")

    check = verify_stored_evidence(storage, stored.storage_key, None, sha256_hex(ORIGINAL))

    assert check.status == IntegrityStatus.MATCH
    assert check.trusted_reference == TrustedReference.DATABASE_ONLY
    assert check.storage_sha256 is None


def test_local_tampered_file_mismatches(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")
    stored = storage.store_original(BytesIO(ORIGINAL), "report.csv")
    storage._path_for_key(stored.storage_key).write_bytes(b"tampered")

    check = verify_stored_evidence(storage, stored.storage_key, None, sha256_hex(ORIGINAL))

    assert check.status == IntegrityStatus.MISMATCH
    assert check.reason == "Stored bytes do not match the recorded digest."


def test_digest_comparison_is_case_insensitive(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")
    stored = storage.store_original(BytesIO(ORIGINAL), "report.csv")

    check = verify_stored_evidence(storage, stored.storage_key, None, sha256_hex(ORIGINAL).upper())

    assert check.status == IntegrityStatus.MATCH
