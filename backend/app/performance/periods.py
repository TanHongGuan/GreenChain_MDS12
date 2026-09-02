import re

# The only reporting-period format currently produced by the upload pipeline
# (see backend/app/api/submissions.py) is a calendar year plus quarter, e.g. "2026-Q1".
# reporting_period is stored as a free-text column with no format constraint, so a
# malformed value is always possible - callers must not guess its chronological
# position (see parse_reporting_period's None return).
_PERIOD_PATTERN = re.compile(r"^(\d{4})-Q([1-4])$")


def parse_reporting_period(value: str) -> tuple[int, int] | None:
    """Parse "YYYY-Qn" into a (year, quarter) sort key, or None if unparseable."""
    match = _PERIOD_PATTERN.match(value.strip())
    if not match:
        return None
    year, quarter = match.groups()
    return int(year), int(quarter)
