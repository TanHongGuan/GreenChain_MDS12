from decimal import Decimal
from io import BytesIO
from pathlib import Path

import pytest
from openpyxl import Workbook

from backend.app.etl.errors import ETLValidationError
from backend.app.etl.monthly import classify_and_clean, read_input, require_submission_quarter
from backend.app.models.monthly_record import MonthlyRecord
from backend.app.models.organisation import Organisation
from backend.app.models.project import Project
from backend.app.models.submission import Submission
from backend.app.submissions.service import SubmissionValidationError, process_submission
from backend.app.tests.test_submissions_service import db, settings, storage, upload, uploader_id


STANDARD = b"reporting_period,electricity_kwh,water_m3,co2_tco2e\n2026-01,1200,4.5,0.25\n2026-02,900,3.75,0.19\n"
ALTERNATIVE = b"Month,Electricity (MWh),Water (Litres),Carbon (kgCO2e)\nJan-2026,1.2,4500,250\nFeb-2026,0.9,3750,190\n"


@pytest.mark.parametrize("data", [STANDARD, ALTERNATIVE])
def test_monthly_formats_normalize_to_same_values(data):
    headers, raw = read_input(data, ".csv")
    name, rows = classify_and_clean(headers, raw)
    assert name in {"MONTHLY_STANDARD", "MONTHLY_ALTERNATIVE"}
    assert [(row.reporting_period, row.electricity_kwh, row.water_m3, row.co2_tco2e) for row in rows] == [
        ("2026-01", Decimal("1200"), Decimal("4.5"), Decimal("0.25")),
        ("2026-02", Decimal("900"), Decimal("3.75"), Decimal("0.19")),
    ]


@pytest.mark.parametrize("headings,values,expected", [
    (["reporting_period", "electricity_kwh", "water_m3", "co2_tco2e"], ["2026-01", 1200, 4.5, 0.25], "MONTHLY_STANDARD"),
    (["Month", "Electricity (MWh)", "Water (Litres)", "Carbon (kgCO2e)"], ["Jan-2026", 1.2, 4500, 250], "MONTHLY_ALTERNATIVE"),
])
def test_monthly_xlsx_reads_named_sheet_not_active(headings, values, expected):
    book = Workbook()
    book.active.title = "Instructions"
    sheet = book.create_sheet("Monthly_Data")
    sheet.append(headings)
    sheet.append(values)
    data = BytesIO()
    book.save(data)
    headers, raw = read_input(data.getvalue(), ".xlsx")
    actual, rows = classify_and_clean(headers, raw)
    assert actual == expected
    assert rows[0].reporting_period == "2026-01"
    assert rows[0].electricity_kwh == Decimal("1200")


@pytest.mark.parametrize("data", [
    b"reporting_period,electricity_kwh,water_m3\n2026-01,1,2\n",
    b"reporting_period,electricity_kwh,water_m3,co2_tco2e,extra\n2026-01,1,2,3,4\n",
    b"reporting_period,electricity_kwh,water_m3,water_m3\n2026-01,1,2,3\n",
    b"reporting_period,electricity_mwh,water_m3,co2_tco2e\n2026-01,1,2,3\n",
    b"reporting_period,electricity_kwh,water_m3,co2_tco2e\n2026-13,1,2,3\n",
])
def test_monthly_rejects_wrong_columns_units_or_months(data):
    with pytest.raises(ETLValidationError):
        classify_and_clean(*read_input(data, ".csv"))


@pytest.mark.parametrize("data", [
    b"reporting_period,electricity_kwh,water_m3,co2_tco2e\n2026-01,-1,4,2\n",
    b"reporting_period,electricity_kwh,water_m3,co2_tco2e\n2026-01,NaN,4,2\n",
    b"reporting_period,electricity_kwh,water_m3,co2_tco2e\n2026-01,1,4,2\n2026-01,2,4,2\n",
])
def test_monthly_rejects_invalid_values_or_duplicate_months(data):
    with pytest.raises(ETLValidationError):
        classify_and_clean(*read_input(data, ".csv"))


def test_monthly_rejects_month_outside_selected_quarter():
    _, rows = classify_and_clean(*read_input(STANDARD, ".csv"))
    with pytest.raises(ETLValidationError, match="outside"):
        require_submission_quarter(rows, "2026-Q2")


def test_all_three_synthetic_datasets_match_contract():
    root = Path(__file__).resolve().parents[3] / "test_datasets" / "monthly"
    files = sorted(root.glob("SYNTHETIC_*.csv"))
    assert len(files) == 3
    for path in files:
        _, rows = classify_and_clean(*read_input(path.read_bytes(), ".csv"))
        assert len(rows) == 3
        require_submission_quarter(rows, "2026-Q1")


@pytest.mark.anyio
async def test_monthly_submission_persists_rows_and_evidence(db, storage, settings):
    organisation = db.query(Organisation).first()
    assert organisation
    project = Project(name="Monthly Test Building", organisation_id=organisation.id)
    db.add(project)
    db.commit()
    result = await process_submission(
        upload("monthly.csv", ALTERNATIVE, "text/csv"), "", "", "2026-Q1", uploader_id(db),
        db=db, storage=storage, settings=settings, project_id=project.id, organisation_id=organisation.id,
    )
    assert result.monthly_record_count == 2
    assert result.input_format == "MONTHLY_ALTERNATIVE"
    submission = db.get(Submission, result.submission_id)
    assert storage.retrieve(submission.original_storage_key) == ALTERNATIVE
    assert storage.retrieve(submission.processed_storage_key).startswith(b"reporting_period,electricity_kwh,water_m3,co2_tco2e")
    rows = db.query(MonthlyRecord).order_by(MonthlyRecord.reporting_period).all()
    assert len(rows) == 2
    assert rows[0].electricity_kwh == Decimal("1200")
    assert {metric.metric_name for metric in submission.metrics} == {"Electricity", "Water", "CO2e"}


@pytest.mark.anyio
async def test_monthly_submission_rejects_foreign_building(db, storage, settings):
    foreign = Organisation(name="Foreign Organisation")
    db.add(foreign)
    db.flush()
    project = Project(name="Foreign Building", organisation_id=foreign.id)
    db.add(project)
    db.commit()
    with pytest.raises(SubmissionValidationError, match="owned"):
        await process_submission(
            upload("monthly.csv", STANDARD, "text/csv"), "", "", "2026-Q1", uploader_id(db),
            db=db, storage=storage, settings=settings, project_id=project.id, organisation_id="other",
        )
    assert db.query(Submission).count() == 0


@pytest.mark.anyio
async def test_monthly_submission_rejects_overlapping_month_without_correction(db, storage, settings):
    organisation = db.query(Organisation).first()
    project = Project(name="Overlap Test Building", organisation_id=organisation.id)
    db.add(project)
    db.commit()
    arguments = dict(db=db, storage=storage, settings=settings, project_id=project.id, organisation_id=organisation.id)
    await process_submission(upload("first.csv", STANDARD, "text/csv"), "", "", "2026-Q1", uploader_id(db), **arguments)
    with pytest.raises(SubmissionValidationError, match="already exist"):
        await process_submission(upload("second.csv", ALTERNATIVE, "text/csv"), "", "", "2026-Q1", uploader_id(db), **arguments)
    assert db.query(Submission).count() == 1
