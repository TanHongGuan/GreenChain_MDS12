class SubmissionTraceabilityError(Exception):
    """Base class for expected submission traceability failures."""


class SubmissionNotFound(SubmissionTraceabilityError):
    """Raised when a referenced submission does not exist."""


class ProjectNotFound(SubmissionTraceabilityError):
    """Raised when a referenced project does not exist."""


class EvidenceNotFound(SubmissionTraceabilityError):
    """Raised when a submission artifact cannot be located."""


class InvalidArtifactType(SubmissionTraceabilityError):
    """Raised when an unsupported artifact type is requested."""


class EvidenceIntegrityMismatch(SubmissionTraceabilityError):
    """Raised when a stored artifact fails integrity verification."""


class CorrectionValidationError(SubmissionTraceabilityError):
    """Raised when a correction/version relationship would be unsafe."""
