class ETLError(Exception):
    """Base class for expected ETL failures."""


class ETLParseError(ETLError):
    """Raised when the uploaded file cannot be parsed as CSV/XLSX."""


class ETLValidationError(ETLError):
    """Raised when parsed rows fail structural or data validation."""
