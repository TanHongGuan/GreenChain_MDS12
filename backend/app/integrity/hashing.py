import hashlib
from pathlib import Path
from typing import BinaryIO


def calculate_sha256(file_path_or_stream: str | Path | BinaryIO) -> str:
    digest = hashlib.sha256()

    if isinstance(file_path_or_stream, str | Path):
        with Path(file_path_or_stream).open("rb") as source:
            _update_digest(digest, source)
    else:
        _update_digest(digest, file_path_or_stream)

    return digest.hexdigest()


def _update_digest(digest, source: BinaryIO) -> None:
    while chunk := source.read(1024 * 1024):
        digest.update(chunk)
