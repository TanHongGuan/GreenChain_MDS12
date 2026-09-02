import re
from pathlib import Path, PurePosixPath
from typing import BinaryIO
from uuid import uuid4

from backend.app.storage.exceptions import FileNotFoundInStorage, InvalidStorageKey, StorageError
from backend.app.storage.models import StoredFile


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
        self.initialise()
        safe_name = self._safe_filename(original_filename)
        storage_key = f"original/{uuid4()}/{safe_name}"
        destination = self._path_for_key(storage_key)
        destination.parent.mkdir(parents=True, exist_ok=False)

        if destination.exists():
            raise StorageError("Storage key collision.")

        size_bytes = 0
        with destination.open("xb") as target:
            while chunk := file_obj.read(1024 * 1024):
                size_bytes += len(chunk)
                target.write(chunk)

        return StoredFile(
            storage_key=storage_key,
            original_filename=safe_name,
            size_bytes=size_bytes,
            content_type=content_type,
            storage_backend=self.backend_name,
        )

    def retrieve(self, storage_key: str) -> bytes:
        path = self._path_for_key(storage_key)
        if not path.is_file():
            raise FileNotFoundInStorage("Stored file was not found.")
        return path.read_bytes()

    def exists(self, storage_key: str) -> bool:
        try:
            return self._path_for_key(storage_key).is_file()
        except InvalidStorageKey:
            return False

    def delete_if_allowed(self, storage_key: str) -> None:
        path = self._path_for_key(storage_key)
        if not path.is_file():
            raise FileNotFoundInStorage("Stored file was not found.")
        path.unlink()

    def _path_for_key(self, storage_key: str) -> Path:
        key = PurePosixPath(storage_key)
        if key.is_absolute() or ".." in key.parts or not key.parts:
            raise InvalidStorageKey("Storage key is invalid.")

        path = (self.root / Path(*key.parts)).resolve()
        if not path.is_relative_to(self.root):
            raise InvalidStorageKey("Storage key escapes the configured storage root.")
        return path

    def _safe_filename(self, filename: str) -> str:
        basename = PurePosixPath(filename.replace("\\", "/")).name.strip()
        cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", basename)
        cleaned = cleaned.strip("._")
        return cleaned or "source"

    def _ensure_writable(self, directory: Path) -> None:
        probe = directory / ".write-test"
        try:
            probe.write_text("ok", encoding="utf-8")
            probe.unlink()
        except OSError as exc:
            raise StorageError(f"Storage directory is not writable: {directory}") from exc
