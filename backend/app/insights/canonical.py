"""Canonical metric identity and units for the project insights endpoints.

This is the server-side mirror of `src/utils/metrics.js` (`CORE_METRICS` and
`normalizedPoint`). The two must agree, or the page would show one figure while
the reporting-consistency grid reports another.

Why a table rather than free-text matching:

- `metric_name` is a free-text column, and real uploads use several spellings for
  the same quantity ("Electricity" in the sample file, "electricity_consumption"
  in the test datasets). Without an alias table the same metric produces two
  unrelated rows.
- Unit conversion is restricted to the exact pairs listed here. Anything else is
  withheld rather than converted on an assumed factor.

Adding a metric or a conversion factor changes what readers are told, so it is
a team decision - and it must be made in both this file and `metrics.js`.
"""

from dataclasses import dataclass, field

@dataclass(frozen=True)
class CanonicalMetric:
    key: str
    label: str
    names: tuple[str, ...]
    unit: str
    # Lowercased source unit -> multiplier that converts it to `unit`.
    unit_conversions: dict[str, float] = field(default_factory=dict)


# The three metrics GreenChain presents.
CANONICAL_METRICS: tuple[CanonicalMetric, ...] = (
    CanonicalMetric(
        key="electricity",
        label="Electricity",
        names=("Electricity", "electricity_consumption"),
        unit="kWh",
    ),
    CanonicalMetric(
        key="water",
        label="Water",
        names=("Water", "water_consumption"),
        unit="m3",
    ),
    CanonicalMetric(
        key="co2",
        label="CO2e",
        names=("CO2e", "CO2 Emissions", "carbon_emissions"),
        unit="tCO2e",
        # Mirrors normalizedPoint() in metrics.js: 1 kgCO2e = 0.001 tCO2e. This is
        # a definition, not an estimate, which is why it is safe to apply.
        unit_conversions={"kgco2e": 0.001},
    ),
)


def resolve_metric(metric_name: str) -> CanonicalMetric | None:
    """Return the canonical metric for a reported name, or None if unrecognised."""
    if not metric_name:
        return None
    needle = metric_name.strip().lower()
    for metric in CANONICAL_METRICS:
        if any(alias.lower() == needle for alias in metric.names):
            return metric
    return None


def canonical_label(metric_name: str) -> str:
    """Canonical display name, falling back to the reported name when unknown.

    Unknown metrics keep their reported name rather than being dropped, so a
    project that reports something outside the core three is still visible.
    """
    metric = resolve_metric(metric_name)
    return metric.label if metric else metric_name


def to_canonical_value(value: float, unit: str, metric: CanonicalMetric) -> float | None:
    """Convert a reported value into the metric's canonical unit.

    Returns None when the reported unit is neither the canonical unit nor a
    documented conversion; the caller withholds the value rather than guess.
    """
    if unit is None:
        return None
    reported = unit.strip().lower()
    if reported == metric.unit.lower():
        return value
    factor = metric.unit_conversions.get(reported)
    if factor is None:
        return None
    return value * factor
