from dataclasses import dataclass

from backend.app.etl.errors import ETLValidationError
from backend.app.etl.readers import RawRow
from backend.app.etl.schema import REQUIRED_COLUMNS, normalize_cell


@dataclass(frozen=True)
class CanonicalMetricRow:
    metric_name: str
    value: float
    unit: str
    category: str | None = None


def clean_rows(headers: list[str], raw_rows: list[RawRow]) -> list[CanonicalMetricRow]:
    missing_columns = [column for column in REQUIRED_COLUMNS if column not in headers]
    if missing_columns:
        raise ETLValidationError(f"Missing required column(s): {', '.join(missing_columns)}.")

    if not raw_rows:
        raise ETLValidationError("File does not contain any data rows.")

    cleaned: list[CanonicalMetricRow] = []
    for line_number, raw_row in enumerate(raw_rows, start=2):
        cleaned.append(_clean_row(raw_row, line_number))

    return cleaned


def _clean_row(raw_row: RawRow, line_number: int) -> CanonicalMetricRow:
    metric_name = normalize_cell(raw_row.get("metric_name"))
    if metric_name is None:
        raise ETLValidationError(f"Row {line_number}: metric_name is required.")

    raw_value = normalize_cell(raw_row.get("value"))
    if raw_value is None:
        raise ETLValidationError(f"Row {line_number}: value is required.")
    try:
        value = float(raw_value)
    except (TypeError, ValueError) as exc:
        raise ETLValidationError(f"Row {line_number}: value '{raw_value}' is not a valid number.") from exc

    unit = normalize_cell(raw_row.get("unit"))
    if unit is None:
        raise ETLValidationError(f"Row {line_number}: unit is required.")

    category = normalize_cell(raw_row.get("category"))

    return CanonicalMetricRow(metric_name=metric_name, value=value, unit=unit, category=category)
