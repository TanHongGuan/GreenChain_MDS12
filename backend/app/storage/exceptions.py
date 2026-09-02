class StorageError(Exception):
    pass


class FileNotFoundInStorage(StorageError):
    pass


class InvalidStorageKey(StorageError):
    pass
