from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.benchmark import Benchmark


def find_benchmarks_for_scope(
    db: Session,
    *,
    country: str,
    property_type: str,
    metric_names: Sequence[str],
    max_year: int,
) -> list[Benchmark]:
    """Benchmarks matching the project's scope and metric, newest eligible year first.

    `metric_names` is every spelling that resolves to one canonical metric (see
    benchmarks/canonical.py), so a benchmark seeded as "CO2e" still matches a
    project reporting "carbon_emissions".

    Unit is deliberately NOT filtered here: the caller needs to tell "no benchmark
    exists for this scope" apart from "one exists but in an incompatible unit", and
    only the former is a reason to stay silent rather than warn.

    Rows published for a year later than the measurement are excluded - comparing a
    2024 result against a 2026 target would flatter or punish it arbitrarily.
    """
    stmt = (
        select(Benchmark)
        .where(
            Benchmark.country == country,
            Benchmark.property_type == property_type,
            Benchmark.metric_name.in_(list(metric_names)),
            Benchmark.year <= max_year,
        )
        .order_by(Benchmark.year.desc(), Benchmark.id.desc())
    )
    return list(db.scalars(stmt).all())


def create_benchmark(
    db: Session,
    *,
    provider: str,
    source_name: str,
    source_version: str,
    source_url: str | None,
    country: str,
    property_type: str,
    year: int,
    metric_name: str,
    unit: str,
    value: float,
) -> Benchmark:
    benchmark = Benchmark(
        provider=provider,
        source_name=source_name,
        source_version=source_version,
        source_url=source_url,
        country=country,
        property_type=property_type,
        year=year,
        metric_name=metric_name,
        unit=unit,
        value=value,
    )
    db.add(benchmark)
    db.flush()
    return benchmark


def get_benchmark_by_scope(
    db: Session,
    *,
    provider: str,
    source_version: str,
    country: str,
    property_type: str,
    year: int,
    metric_name: str,
) -> Benchmark | None:
    stmt = select(Benchmark).where(
        Benchmark.provider == provider,
        Benchmark.source_version == source_version,
        Benchmark.country == country,
        Benchmark.property_type == property_type,
        Benchmark.year == year,
        Benchmark.metric_name == metric_name,
    )
    return db.scalars(stmt).first()
