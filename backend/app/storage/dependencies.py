from functools import lru_cache

from backend.app.core.config import get_settings
from backend.app.storage.base import StorageService
from backend.app.storage.exceptions import StorageError
from backend.app.storage.local import LocalStorageService


@lru_cache
def get_storage_service() -> StorageService:
    settings = get_settings()
    backend = settings.storage_backend.lower().strip()
    if backend == "local":
        return LocalStorageService(settings.local_storage_root)
    raise StorageError(f"Unsupported STORAGE_BACKEND: {settings.storage_backend}")
