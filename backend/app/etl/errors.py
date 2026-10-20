from dataclasses import dataclass


class ETLError(Exception):
    """Base class for expected ETL failures."""


class ETLParseError(ETLError):
    """Raised when the uploaded file cannot be parsed as CSV/XLSX."""


@dataclass(frozen=True)
class RowIssue:
    """One row-level data fault, located precisely enough to correct in the source file.

    ``code`` is a stable machine-readable label (INVALID_NUMERIC,
    DECREASING_CUMULATIVE, ...) so an uploader's faults can be counted and
    compared across files; ``detail`` is the sentence a person reads.
    """

    worksheet: str
    row: int
    row_date: str
    column: str
    code: str
    detail: str

    def __str__(self) -> str:
        where = f"{self.worksheet} row {self.row}"
        if self.row_date:
            where = f"{where} ({self.row_date})"
        return f"{where}, {self.column}: {self.detail}"

    def as_dict(self) -> dict:
        return {
            "worksheet": self.worksheet,
            "row": self.row,
            "row_date": self.row_date,
            "column": self.column,
            "code": self.code,
            "detail": self.detail,
            "message": str(self),
        }


class ETLValidationError(ETLError):
    """Raised when parsed rows fail structural or data validation.

    A structural failure (a missing worksheet, an unmappable unit) stops the run
    on its own and carries no issues. Row-level faults are gathered across every
    mapped column first and reported together, so an uploader sees the whole
    list of corrections instead of discovering them one upload at a time.
    """

    def __init__(self, message: str, issues: tuple[RowIssue, ...] | list[RowIssue] = ()) -> None:
        super().__init__(message)
        self.issues: tuple[RowIssue, ...] = tuple(issues)
