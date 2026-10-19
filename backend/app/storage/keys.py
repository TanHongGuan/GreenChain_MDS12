import re
from pathlib import PurePosixPath

from backend.app.storage.exceptions import InvalidStorageKey


def safe_filename(filename: str) -> str:
    basename = PurePosixPath(filename.replace("\\", "/")).name.strip()
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", basename)
    cleaned = cleaned.strip("._")
    return cleaned or "source"


def validate_storage_key(storage_key: str) -> PurePosixPath:
    key = PurePosixPath(storage_key)
    if not storage_key or key.is_absolute() or ".." in key.parts or not key.parts:
        raise InvalidStorageKey("Storage key is invalid.")
    return key
