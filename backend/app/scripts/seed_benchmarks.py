"""Load the demonstration benchmark set used by Sprint 8 insights.

IMPORTANT - these are PLACEHOLDER figures, not published industry benchmarks.

They exist so the comparison pipeline can be demonstrated end to end. They are
attributed to an internal demo provider precisely so that nothing in the UI ever
claims a real standards body endorsed them: the Project Detail page prints the
provider and version next to every bar, so a demo row is visibly a demo row.

Before GreenChain shows a benchmark comparison to anyone outside the project,
replace this set with licensed data (for example a NABERS or CBECS extract) and
bump SOURCE_VERSION. The loader validates units on the way in, so a replacement
set with mismatched units fails here rather than silently producing a comparison
that gets quietly suppressed at read time.
"""

from sqlalchemy.orm import Session

from backend.app.benchmarks.canonical import CANONICAL_METRICS
from backend.app.core.database import SessionLocal
from backend.app.repositories.benchmarks import create_benchmark, get_benchmark_by_scope

PROVIDER = "GreenChain Demo Benchmark Set"
SOURCE_NAME = "Illustrative placeholder targets for MVP demonstration"
SOURCE_VERSION = "demo-2026.1"
SOURCE_URL = None

# Benchmarks are seeded in each metric's canonical unit, taken from
# backend/app/benchmarks/canonical.py rather than restated here, so this set can
# never drift from the units the comparison and the UI actually use.
EXPECTED_UNITS = {metric.label: metric.unit for metric in CANONICAL_METRICS}

# (country, property_type, year, metric_name, unit, value)
DEMO_BENCHMARKS: list[tuple[str, str, int, str, str, float]] = [
    ("Australia", "Office", 2025, "Electricity", "kWh", 480000.0),
    ("Australia", "Office", 2025, "Water", "m3", 7200.0),
    ("Australia", "Office", 2025, "CO2e", "tCO2e", 310.0),
    ("Australia", "Office", 2026, "Electricity", "kWh", 450000.0),
    ("Australia", "Office", 2026, "Water", "m3", 6800.0),
    ("Australia", "Office", 2026, "CO2e", "tCO2e", 290.0),
    ("Australia", "Retail", 2026, "Electricity", "kWh", 620000.0),
    ("Australia", "Retail", 2026, "Water", "m3", 9100.0),
    ("Australia", "Retail", 2026, "CO2e", "tCO2e", 395.0),
    ("Malaysia", "Office", 2026, "Electricity", "kWh", 520000.0),
    ("Malaysia", "Office", 2026, "Water", "m3", 7600.0),
    ("Malaysia", "Office", 2026, "CO2e", "tCO2e", 330.0),
]


def validate_rows(rows: list[tuple[str, str, int, str, str, float]]) -> None:
    """Reject a benchmark set that could not produce a defensible comparison."""
    seen: set[tuple[str, str, int, str]] = set()
    for country, property_type, year, metric_name, unit, value in rows:
        expected_unit = EXPECTED_UNITS.get(metric_name)
        if expected_unit is None:
            raise ValueError(
                f"Benchmark for unknown metric '{metric_name}'. Add it to CANONICAL_METRICS in "
                f"backend/app/benchmarks/canonical.py (and to CORE_METRICS in src/utils/metrics.js) "
                f"before loading it."
            )
        if unit != expected_unit:
            raise ValueError(
                f"Benchmark for '{metric_name}' is in '{unit}' but the canonical unit is "
                f"'{expected_unit}'. Seed benchmarks in the canonical unit so the stored "
                f"figure matches the one the comparison and the UI use."
            )
        if value <= 0:
            raise ValueError(f"Benchmark for '{metric_name}' has non-positive value {value}.")
        key = (country, property_type, year, metric_name)
        if key in seen:
            raise ValueError(f"Duplicate benchmark row for {key}.")
        seen.add(key)


def seed_benchmarks(db: Session) -> int:
    validate_rows(DEMO_BENCHMARKS)

    created = 0
    for country, property_type, year, metric_name, unit, value in DEMO_BENCHMARKS:
        existing = get_benchmark_by_scope(
            db,
            provider=PROVIDER,
            source_version=SOURCE_VERSION,
            country=country,
            property_type=property_type,
            year=year,
            metric_name=metric_name,
        )
        if existing is not None:
            existing.unit = unit
            existing.value = value
            existing.source_name = SOURCE_NAME
            existing.source_url = SOURCE_URL
            continue
        create_benchmark(
            db,
            provider=PROVIDER,
            source_name=SOURCE_NAME,
            source_version=SOURCE_VERSION,
            source_url=SOURCE_URL,
            country=country,
            property_type=property_type,
            year=year,
            metric_name=metric_name,
            unit=unit,
            value=value,
        )
        created += 1
    return created


def main() -> None:
    with SessionLocal() as db:
        created = seed_benchmarks(db)
        db.commit()
    print(f"Seeded {created} new demonstration benchmark rows ({PROVIDER} {SOURCE_VERSION}).")
    print("These are placeholder values - replace with licensed data before external use.")


if __name__ == "__main__":
    main()
