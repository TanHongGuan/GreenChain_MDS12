class ReviewError(Exception):
    """Base class for expected review-domain failures."""


class SubmissionNotFound(ReviewError):
    """Raised when a referenced submission does not exist."""


class InvalidReviewTransition(ReviewError):
    """Raised when a decision is unrecognised or attempted on a submission not awaiting review."""


class EvidenceNotFound(ReviewError):
    """Raised when original or processed evidence cannot be located in storage."""


class EvidenceIntegrityMismatch(ReviewError):
    """Raised when a caller requires a strict SHA-256 match and verification fails."""


class ReviewNotAssigned(ReviewError):
    """Raised when an auditor acts on a building they were not appointed to.

    Distinct from "not found" on purpose: the auditor role legitimately sees that
    the submission exists, so pretending otherwise would be confusing rather than
    protective. What they may not do is review it.
    """


class ReviewPersistenceFailure(ReviewError):
    """Raised when a review decision could not be committed."""
