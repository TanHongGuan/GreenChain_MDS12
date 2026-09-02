from io import BytesIO

import pytest
from openpyxl import Workbook

from backend.app.etl.errors import ETLParseError, ETLValidationError
from backend.app.etl.readers import read_csv_rows, read_xlsx_rows
from backend.app.etl.transform import CanonicalMetricRow, clean_rows
from backend.app.etl.writer import build_processed_csv


def make_xlsx_bytes(rows: list[list[object]]) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    for row in rows:
        worksheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_read_csv_rows_normalises_headers_and_returns_rows() -> None:
    raw = b"Metric Name,Value,Unit\nElectricity,120.5,kWh\n"

    headers, rows = read_csv_rows(raw)

    assert headers == ["metric_name", "value", "unit"]
    assert rows == [{"metric_name": "Electricity", "value": "120.5", "unit": "kWh"}]


def test_read_csv_rows_maps_known_header_aliases() -> None:
    raw = b"metric,amount,uom\nWater,10,kL\n"

    headers, _ = read_csv_rows(raw)

    assert headers == ["metric_name", "value", "unit"]


def test_read_csv_rows_skips_blank_lines() -> None:
    raw = b"metric_name,value,unit\nElectricity,1,kWh\n\nWater,2,kL\n"

    _, rows = read_csv_rows(raw)

    assert len(rows) == 2


def test_read_csv_rows_rejects_empty_file() -> None:
    with pytest.raises(ETLParseError):
        read_csv_rows(b"")


def test_read_csv_rows_rejects_ragged_rows() -> None:
    raw = b"metric_name,value,unit\nElectricity,1\n"

    with pytest.raises(ETLParseError):
        read_csv_rows(raw)


def test_read_csv_rows_rejects_invalid_utf8() -> None:
    with pytest.raises(ETLParseError):
        read_csv_rows(b"\xff\xfe\x00\x01")


def test_read_xlsx_rows_parses_valid_workbook() -> None:
    raw = make_xlsx_bytes([["metric_name", "value", "unit"], ["Electricity", 120.5, "kWh"]])

    headers, rows = read_xlsx_rows(raw)

    assert headers == ["metric_name", "value", "unit"]
    assert rows == [{"metric_name": "Electricity", "value": 120.5, "unit": "kWh"}]


def test_read_xlsx_rows_rejects_corrupt_workbook() -> None:
    with pytest.raises(ETLParseError):
        read_xlsx_rows(b"not a real xlsx file")


def test_read_xlsx_rows_rejects_empty_workbook() -> None:
    raw = make_xlsx_bytes([])

    with pytest.raises(ETLParseError):
        read_xlsx_rows(raw)


def test_clean_rows_produces_canonical_metric_rows() -> None:
    headers = ["metric_name", "value", "unit", "category"]
    raw_rows = [{"metric_name": "Electricity", "value": "120.5", "unit": "kWh", "category": "Energy"}]

    cleaned = clean_rows(headers, raw_rows)

    assert cleaned == [CanonicalMetricRow(metric_name="Electricity", value=120.5, unit="kWh", category="Energy")]


def test_clean_rows_defaults_missing_category_to_none() -> None:
    headers = ["metric_name", "value", "unit"]
    raw_rows = [{"metric_name": "Electricity", "value": "1", "unit": "kWh"}]

    cleaned = clean_rows(headers, raw_rows)

    assert cleaned[0].category is None


def test_clean_rows_rejects_missing_required_column() -> None:
    headers = ["metric_name", "value"]

    with pytest.raises(ETLValidationError, match="unit"):
        clean_rows(headers, [{"metric_name": "Electricity", "value": "1"}])


def test_clean_rows_rejects_no_data_rows() -> None:
    headers = ["metric_name", "value", "unit"]

    with pytest.raises(ETLValidationError):
        clean_rows(headers, [])


def test_clean_rows_rejects_non_numeric_value() -> None:
    headers = ["metric_name", "value", "unit"]
    raw_rows = [{"metric_name": "Electricity", "value": "not-a-number", "unit": "kWh"}]

    with pytest.raises(ETLValidationError):
        clean_rows(headers, raw_rows)


@pytest.mark.parametrize("null_token", ["", "N/A", "na", "NULL", "None", "-"])
def test_clean_rows_treats_known_null_tokens_as_missing(null_token: str) -> None:
    headers = ["metric_name", "value", "unit"]
    raw_rows = [{"metric_name": null_token, "value": "1", "unit": "kWh"}]

    with pytest.raises(ETLValidationError):
        clean_rows(headers, raw_rows)


def test_clean_rows_does_not_invent_ambiguous_units() -> None:
    headers = ["metric_name", "value", "unit"]
    raw_rows = [{"metric_name": "Electricity", "value": "1", "unit": " kwh "}]

    cleaned = clean_rows(headers, raw_rows)

    assert cleaned[0].unit == "kwh"


def test_build_processed_csv_round_trips_through_reader() -> None:
    rows = [CanonicalMetricRow(metric_name="Electricity", value=120.5, unit="kWh", category="Energy")]

    processed_bytes = build_processed_csv(rows)
    headers, parsed_rows = read_csv_rows(processed_bytes)

    assert headers == ["metric_name", "value", "unit", "category"]
    assert parsed_rows == [{"metric_name": "Electricity", "value": "120.5", "unit": "kWh", "category": "Energy"}]
