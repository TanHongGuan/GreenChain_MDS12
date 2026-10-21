class InsightsError(Exception):
    """Base class for expected insights-domain failures."""


class ProjectNotFound(InsightsError):
    """Raised when a referenced project does not exist."""
