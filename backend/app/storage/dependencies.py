from functools import lru_cache

from backend.app.core.config import Settings, get_settings
from backend.app.storage.base import StorageService
from backend.app.storage.exceptions import StorageError
from backend.app.storage.local import LocalStorageService


def build_s3_client(settings: Settings):
    import boto3

    # pydantic reads AWS_PROFILE from .env, but boto3 only sees the process environment, so the
    # profile is passed explicitly rather than relying on it being exported.
    session = boto3.Session(profile_name=settings.aws_profile or None)
    return session.client("s3", region_name=settings.aws_region, endpoint_url=settings.s3_endpoint_url or None)


def build_s3_storage(settings: Settings, client=None) -> StorageService:
    from backend.app.storage.s3 import S3StorageService

    return S3StorageService(
        client or build_s3_client(settings),
        settings.s3_bucket or "",
        key_prefix=settings.s3_key_prefix,
        lock_mode=settings.s3_object_lock_mode,
        retention_days=settings.s3_retention_days,
        lock_processed=settings.s3_lock_processed,
    )


@lru_cache
def get_storage_service() -> StorageService:
    settings = get_settings()
    backend = settings.storage_backend.lower().strip()
    if backend == "local":
        return LocalStorageService(settings.local_storage_root)
    if backend == "s3":
        return build_s3_storage(settings)
    raise StorageError(f"Unsupported STORAGE_BACKEND: {settings.storage_backend}")
