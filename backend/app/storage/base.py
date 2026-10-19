from typing import BinaryIO, Protocol

from backend.app.storage.models import StoredFile, StoredObjectInfo


class StorageService(Protocol):
    backend_name: str

    def initialise(self) -> None:
        ...

    def store_original(self, file_obj: BinaryIO, original_filename: str, content_type: str | None = None) -> StoredFile:
        ...

    def store_processed(self, file_obj: BinaryIO, original_filename: str, content_type: str | None = None) -> StoredFile:
        ...

    def retrieve(self, storage_key: str, version_id: str | None = None) -> bytes:
        ...

    def exists(self, storage_key: str, version_id: str | None = None) -> bool:
        ...

    def describe(self, storage_key: str, version_id: str | None = None) -> StoredObjectInfo:
        ...

    def delete_if_allowed(self, storage_key: str, version_id: str | None = None) -> None:
        ...
