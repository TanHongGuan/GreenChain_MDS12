from io import BytesIO

import pytest

from backend.app.core.config import get_settings
from backend.app.integrity.hashing import calculate_sha256
from backend.app.storage.dependencies import get_storage_service
from backend.app.storage.exceptions import FileNotFoundInStorage, InvalidStorageKey, StorageError
from backend.app.storage.local import LocalStorageService
from backend.app.storage.models import ACCEPTED_UPLOAD_CONTENT_TYPES, ACCEPTED_UPLOAD_EXTENSIONS


@pytest.fixture(autouse=True)
def clear_storage_caches() -> None:
    get_settings.cache_clear()
    get_storage_service.cache_clear()


def test_local_storage_root_can_initialise(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")
    storage.initialise()

    assert storage.root.exists()


def test_original_directory_can_initialise(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")
    storage.initialise()

    assert storage.original_dir.is_dir()


def test_processed_directory_can_initialise(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")
    storage.initialise()

    assert storage.processed_dir.is_dir()


def test_storing_small_file_succeeds(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")

    result = storage.store_original(BytesIO(b"hello"), "report.csv", "text/csv")

    assert result.storage_key.startswith("original/")
    assert result.original_filename == "report.csv"
    assert result.size_bytes == 5
    assert result.content_type == "text/csv"
    assert result.storage_backend == "local"


def test_stored_file_exists(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")
    result = storage.store_original(BytesIO(b"hello"), "report.csv")

    assert storage.exists(result.storage_key)


def test_stored_content_matches_source_content(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")
    result = storage.store_original(BytesIO(b"source bytes"), "report.xlsx")

    assert storage.retrieve(result.storage_key) == b"source bytes"


def test_retrieving_stored_content_succeeds(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")
    result = storage.store_original(BytesIO(b"csv,data"), "report.csv")

    assert storage.retrieve(result.storage_key) == b"csv,data"


def test_duplicate_original_filenames_do_not_collide(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")

    first = storage.store_original(BytesIO(b"first"), "report.xlsx")
    second = storage.store_original(BytesIO(b"second"), "report.xlsx")

    assert first.storage_key != second.storage_key
    assert storage.retrieve(first.storage_key) == b"first"
    assert storage.retrieve(second.storage_key) == b"second"


def test_path_traversal_filename_does_not_escape_storage_root(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")

    result = storage.store_original(BytesIO(b"safe"), "../../passwords.txt")

    assert result.original_filename == "passwords.txt"
    assert storage.retrieve(result.storage_key) == b"safe"
    assert not (tmp_path / "passwords.txt").exists()


@pytest.mark.parametrize("key", ["../../etc/passwd", "/tmp/file.csv", "original/abc/../../../secret"])
def test_malicious_storage_key_cannot_retrieve_outside_root(tmp_path, key: str) -> None:
    storage = LocalStorageService(tmp_path / "storage")
    storage.initialise()

    with pytest.raises(InvalidStorageKey):
        storage.retrieve(key)


def test_missing_storage_key_produces_controlled_error(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")
    storage.initialise()

    with pytest.raises(FileNotFoundInStorage):
        storage.retrieve("original/missing/report.csv")


def test_runtime_storage_is_not_absolute_developer_machine_path() -> None:
    assert get_settings().local_storage_root == "./var/storage"


def test_configured_storage_root_is_honoured(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("LOCAL_STORAGE_ROOT", str(tmp_path / "configured-storage"))
    storage = get_storage_service()
    storage.initialise()

    assert (tmp_path / "configured-storage" / "original").is_dir()
    assert (tmp_path / "configured-storage" / "processed").is_dir()


def test_unsupported_storage_backend_fails_clearly(monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    get_settings.cache_clear()
    get_storage_service.cache_clear()

    with pytest.raises(StorageError, match="Unsupported STORAGE_BACKEND"):
        get_storage_service()


def test_directory_initialisation_is_idempotent(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")

    storage.initialise()
    storage.initialise()

    assert storage.original_dir.is_dir()
    assert storage.processed_dir.is_dir()


def test_delete_if_allowed_removes_existing_storage_key(tmp_path) -> None:
    storage = LocalStorageService(tmp_path / "storage")
    result = storage.store_original(BytesIO(b"temporary"), "report.csv")

    storage.delete_if_allowed(result.storage_key)

    assert not storage.exists(result.storage_key)


def test_accepted_file_type_configuration_is_centralised() -> None:
    assert ".csv" in ACCEPTED_UPLOAD_EXTENSIONS
    assert ".xlsx" in ACCEPTED_UPLOAD_EXTENSIONS
    assert "text/csv" in ACCEPTED_UPLOAD_CONTENT_TYPES
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in ACCEPTED_UPLOAD_CONTENT_TYPES


def test_same_bytes_produce_same_sha256() -> None:
    first = calculate_sha256(BytesIO(b"same bytes"))
    second = calculate_sha256(BytesIO(b"same bytes"))

    assert first == second
    assert first == first.lower()
    assert len(first) == 64


def test_different_bytes_produce_different_sha256() -> None:
    first = calculate_sha256(BytesIO(b"first"))
    second = calculate_sha256(BytesIO(b"second"))

    assert first != second
