class StorageError(Exception):
    pass


class FileNotFoundInStorage(StorageError):
    pass


class InvalidStorageKey(StorageError):
    pass


class ObjectLocked(StorageError):
    """Raised when a delete is refused because the object version is under retention."""


class StorageMisconfigured(StorageError):
    """Raised when the configured backend cannot provide the required guarantees."""
