from backend.app.storage.dependencies import get_storage_service


def setup_storage() -> None:
    storage = get_storage_service()
    storage.initialise()


def main() -> None:
    setup_storage()
    print("Local storage is initialised and writable.")


if __name__ == "__main__":
    main()
