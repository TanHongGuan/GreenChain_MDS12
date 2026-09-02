from pydantic import BaseModel


ACCEPTED_UPLOAD_EXTENSIONS = {".csv", ".xlsx"}
ACCEPTED_UPLOAD_CONTENT_TYPES = {
    "text/csv",
    "application/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


class StoredFile(BaseModel):
    storage_key: str
    original_filename: str
    size_bytes: int
    content_type: str | None = None
    storage_backend: str
