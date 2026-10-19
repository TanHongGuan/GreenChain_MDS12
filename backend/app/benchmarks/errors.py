class BenchmarkError(Exception):
    """Base class for expected benchmark-domain failures."""


class ProjectNotFound(BenchmarkError):
    """Raised when a referenced project does not exist."""
