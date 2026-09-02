import re

# Canonical metric row columns, in the order they are written to the processed file.
CANONICAL_COLUMNS = ("metric_name", "value", "unit", "category")
REQUIRED_COLUMNS = ("metric_name", "value", "unit")

# Deterministic, documented header aliases. Only exact, known synonyms are mapped -
# unrecognised columns are left as-is and simply ignored by validation.
_HEADER_ALIASES: dict[str, str] = {
    "metric": "metric_name",
    "metric_name": "metric_name",
    "name": "metric_name",
    "value": "value",
    "amount": "value",
    "quantity": "value",
    "unit": "unit",
    "units": "unit",
    "unit_of_measure": "unit",
    "uom": "unit",
    "category": "category",
    "type": "category",
}

# Case-insensitive, trimmed tokens that represent an absent value.
NULL_TOKENS = {"", "n/a", "na", "null", "none", "-"}


def normalize_header(raw_header: str) -> str:
    cleaned = re.sub(r"\s+", "_", raw_header.strip().lower())
    cleaned = re.sub(r"[^a-z0-9_]+", "", cleaned)
    return _HEADER_ALIASES.get(cleaned, cleaned)


def normalize_cell(raw_value: object) -> str | None:
    if raw_value is None:
        return None
    text = str(raw_value).strip()
    return None if text.lower() in NULL_TOKENS else text
