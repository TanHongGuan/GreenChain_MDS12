class PerformanceError(Exception):
    """Base class for expected performance-domain failures."""


class ProjectNotFound(PerformanceError):
    """Raised when a referenced project does not exist."""


class MetricUnitConflict(PerformanceError):
    """Raised when a metric's series mixes incompatible units with no defined conversion."""
