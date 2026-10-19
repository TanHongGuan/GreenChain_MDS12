from backend.app.core.config import get_settings
from backend.app.storage.dependencies import get_storage_service


def setup_storage() -> None:
    storage = get_storage_service()
    storage.initialise()


def main() -> None:
    setup_storage()
    settings = get_settings()
    if settings.storage_backend.lower().strip() == "s3":
        print(
            f"S3 bucket '{settings.s3_bucket}' is reachable with versioning"
            f"{'' if settings.s3_object_lock_mode == 'NONE' else ' and Object Lock'} enabled. "
            f"New evidence will use mode={settings.s3_object_lock_mode}, "
            f"retention={settings.s3_retention_days} day(s), lock_processed={settings.s3_lock_processed}."
        )
    else:
        print("Local storage is initialised and writable.")


if __name__ == "__main__":
    main()
