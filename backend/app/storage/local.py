import hashlib
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from backend.app.storage.exceptions import FileNotFoundInStorage, InvalidStorageKey, StorageError
from backend.app.storage.keys import safe_filename, validate_storage_key
from backend.app.storage.models import StoredFile, StoredObjectInfo


class LocalStorageService:
    backend_name = "local"

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).expanduser().resolve()
        self.original_dir = self.root / "original"
        self.processed_dir = self.root / "processed"

    def initialise(self) -> None:
        self.original_dir.mkdir(parents=True, exist_ok=True)
        self.processed_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_writable(self.original_dir)
        self._ensure_writable(self.processed_dir)

    def store_original(self, file_obj: BinaryIO, original_filename: str, content_type: str | None = None) -> StoredFile:
        return self._store("original", file_obj, original_filename, content_type)

    def store_processed(self, file_obj: BinaryIO, original_filename: str, content_type: str | None = None) -> StoredFile:
        return self._store("processed", file_obj, original_filename, content_type)

    def _store(
        self, kind: str, file_obj: BinaryIO, original_filename: str, content_type: str | None = None
    ) -> StoredFile:
        self.initialise()
        safe_name = self._safe_filename(original_filename)
        storage_key = f"{kind}/{uuid4()}/{safe_name}"
        destination = self._path_for_key(storage_key)
        destination.parent.mkdir(parents=True, exist_ok=False)

        if destination.exists():
            raise StorageError("Storage key collision.")

        size_bytes = 0
        digest = hashlib.sha256()
        with destination.open("xb") as target:
            while chunk := file_obj.read(1024 * 1024):
                size_bytes += len(chunk)
                digest.update(chunk)
                target.write(chunk)

        return StoredFile(
            storage_key=storage_key,
            original_filename=safe_name,
            size_bytes=size_bytes,
            content_type=content_type,
            storage_backend=self.backend_name,
            sha256=digest.hexdigest(),
        )

    # Local storage is unversioned and has no retention, so version_id is accepted for interface
    # compatibility and ignored. It offers no tamper resistance; use the s3 backend for that.

    def retrieve(self, storage_key: str, version_id: str | None = None) -> bytes:
        path = self._path_for_key(storage_key)
        if not path.is_file():
            raise FileNotFoundInStorage("Stored file was not found.")
        return path.read_bytes()

    def exists(self, storage_key: str, version_id: str | None = None) -> bool:
        try:
            return self._path_for_key(storage_key).is_file()
        except InvalidStorageKey:
            return False

    def describe(self, storage_key: str, version_id: str | None = None) -> StoredObjectInfo:
        path = self._path_for_key(storage_key)
        if not path.is_file():
            raise FileNotFoundInStorage("Stored file was not found.")
        return StoredObjectInfo(
            storage_key=storage_key,
            size_bytes=path.stat().st_size,
            storage_backend=self.backend_name,
        )

    def delete_if_allowed(self, storage_key: str, version_id: str | None = None) -> None:
        path = self._path_for_key(storage_key)
        if not path.is_file():
            raise FileNotFoundInStorage("Stored file was not found.")
        path.unlink()

    def _path_for_key(self, storage_key: str) -> Path:
        key = validate_storage_key(storage_key)

        path = (self.root / Path(*key.parts)).resolve()
        if not path.is_relative_to(self.root):
            raise InvalidStorageKey("Storage key escapes the configured storage root.")
        return path

    def _safe_filename(self, filename: str) -> str:
        return safe_filename(filename)

    def _ensure_writable(self, directory: Path) -> None:
        probe = directory / ".write-test"
        try:
            probe.write_text("ok", encoding="utf-8")
            probe.unlink()
        except OSError as exc:
            raise StorageError(f"Storage directory is not writable: {directory}") from exc
