from typing import BinaryIO, Protocol

from backend.app.storage.models import StoredFile


class StorageService(Protocol):
    def initialise(self) -> None:
        ...

    def store_original(self, file_obj: BinaryIO, original_filename: str, content_type: str | None = None) -> StoredFile:
        ...

    def store_processed(self, file_obj: BinaryIO, original_filename: str, content_type: str | None = None) -> StoredFile:
        ...

    def retrieve(self, storage_key: str) -> bytes:
        ...

    def exists(self, storage_key: str) -> bool:
        ...

    def delete_if_allowed(self, storage_key: str) -> None:
        ...
