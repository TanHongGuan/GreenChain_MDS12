"""The Monosh demonstration set: two buildings, five quarterly submissions.

SYNTHETIC DATA. Monosh is an invented organisation and every figure in these
workbooks was generated from a fixed seed by test_datasets/generate_company_datasets.py
and test_datasets/generate_rolling_year.py. Each workbook says so on its own
00_Read_Me sheet. The approvals the seeder records are simulated for the demo;
they are not independent assurance of anything.

The workbooks are the ones in test_datasets/monosh/, copied here because the API
image does not include test_datasets/ (and the workbooks there are no longer
tracked). Their SHA-256 digests are pinned below so a changed file is caught
rather than silently seeded.

Each mapping is what an uploader confirms on the "Check what we found" step,
written out by hand: which column is which, how daily rows become a month, the
cumulative water meter's opening reading (taken from the file's own
Meter_And_ETL_Rules sheet), and that the submeter is NOT added to its parent.
No model is asked for anything; the figures come from the deterministic ETL.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from backend.app.etl.ai_mapping import ColumnMapping, MappingSuggestion

FILES = Path(__file__).resolve().parent / "files"

ORGANISATION = "Monosh"
COMPANY_EMAIL = "monosh@greenchain.test"

# Fixed so the auditor appointments are the same on every fresh deployment.
AUDITOR_SEED = "greenchain-demo-monosh-2026"

APPROVAL_REASON = (
    "Simulated approval for the GreenChain demonstration. Synthetic data; "
    "not independent sustainability assurance."
)


@dataclass(frozen=True)
class DemoBuilding:
    name: str
    location: str
    country: str = "Malaysia"
    property_type: str = "Education"


@dataclass(frozen=True)
class DemoSubmission:
    building: str
    reporting_period: str
    filename: str
    sha256: str
    # Worksheet layout, as written by the generator for that building.
    electricity_header: str
    water_sheet: str
    water_header: str
    water_opening: str
    # The quarterly totals the file must produce, from expected/*.csv.
    expected_electricity_kwh: str
    expected_water_m3: str
    expected_co2_tco2e: str

    @property
    def path(self) -> Path:
        return FILES / self.filename

    def confirmed_mapping(self) -> MappingSuggestion:
        """The mapping an uploader would confirm for this file."""
        return MappingSuggestion(mappings=[
            ColumnMapping(field="reporting_period", worksheet="Power_Log", header="Date",
                          column_ref="A", source_unit="month"),
            # Column B only. Column C is a submeter already inside B; adding it
            # would double-count it.
            ColumnMapping(field="electricity_kwh", worksheet="Power_Log", header=self.electricity_header,
                          column_ref="B", period_column_ref="A", source_unit="kWh", aggregation="SUM_DAILY"),
            ColumnMapping(field="water_m3", worksheet=self.water_sheet, header=self.water_header,
                          column_ref="B", period_column_ref="A", source_unit="m3",
                          aggregation="DIFFERENCE_CUMULATIVE", opening_reading=Decimal(self.water_opening)),
            # Scope 2 plus the other reported emissions make the building total.
            ColumnMapping(field="co2_tco2e", worksheet="Carbon_Register",
                          header="Reported Scope 2 Emissions (tCO2e)", column_ref="B", period_column_ref="A",
                          source_unit="tCO2e", aggregation="MONTHLY", additional_column_refs=["C"]),
        ])


SCIENCE = "Monosh Science Building"
ENGINEERING = "Monosh Engineering Hall"

BUILDINGS = (
    DemoBuilding(SCIENCE, "Science Precinct, Jalan Lagoon Selatan, 47500 Bandar Sunway, Selangor"),
    DemoBuilding(ENGINEERING, "Engineering Precinct, Jalan Lagoon Selatan, 47500 Bandar Sunway, Selangor"),
)

_SCIENCE = dict(building=SCIENCE, electricity_header="Building Intake (kWh)",
                water_sheet="Water_Readings", water_header="Site Meter - cumulative (m3)")
_ENGINEERING = dict(building=ENGINEERING, electricity_header="Main Incoming Supply (kWh)",
                    water_sheet="Water_Meter", water_header="Site Meter - cumulative (m3)")

# Upload order: oldest first, so each building's history reads forwards.
SUBMISSIONS = (
    DemoSubmission(**_SCIENCE, reporting_period="2026-Q1", filename="MONOSH_SCIENCE_2026_Q1.xlsx",
                   sha256="80d5e1c3b1095048b5f7c422df87f39c8bd49661e52c0ccc724e32d96bbe406e",
                   water_opening="57410.80", expected_electricity_kwh="587595.96",
                   expected_water_m3="2205.43", expected_co2_tco2e="364.713"),
    DemoSubmission(**_ENGINEERING, reporting_period="2026-Q1", filename="MONOSH_ENGINEERING_2026_Q1.xlsx",
                   sha256="799b90534950a6d50a00de6269b4ca4819dfd2ecc2a8b6c92941806ae08fe46d",
                   water_opening="65526.88", expected_electricity_kwh="489984.50",
                   expected_water_m3="2007.08", expected_co2_tco2e="302.406"),
    DemoSubmission(**_SCIENCE, reporting_period="2026-Q2", filename="MONOSH_SCIENCE_2026_Q2.xlsx",
                   sha256="d24b9b9009750379da06c09fc1db4566296bfc2d4c79ba418647334e8a441483",
                   water_opening="59616.23", expected_electricity_kwh="641618.97",
                   expected_water_m3="2391.19", expected_co2_tco2e="398.244"),
    DemoSubmission(**_ENGINEERING, reporting_period="2026-Q2", filename="MONOSH_ENGINEERING_2026_Q2.xlsx",
                   sha256="2a67da1d11c86101dbb9036a79c86cb928ecb776330f423922e835eac4a7f7f0",
                   water_opening="67533.96", expected_electricity_kwh="526975.12",
                   expected_water_m3="2172.56", expected_co2_tco2e="325.236"),
    DemoSubmission(**_SCIENCE, reporting_period="2026-Q3", filename="MONOSH_SCIENCE_2026_Q3.xlsx",
                   sha256="6a5c90e1bb878a2633c7863503c3066eaf9cbc76a7f5babf89be47e6cbb2eed9",
                   water_opening="62007.42", expected_electricity_kwh="653112.34",
                   expected_water_m3="2465.79", expected_co2_tco2e="405.378"),
)
