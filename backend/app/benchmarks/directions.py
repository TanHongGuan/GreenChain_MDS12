"""How a benchmark comparison is classified.

Metric identity, units and better/worse direction live in `canonical.py`; this
module only turns a percentage difference into a verdict. Both live in the
backend so the classification an investor reads is reproducible and reviewable
in one place - the frontend must never decide what counts as good performance.
"""

from backend.app.benchmarks.canonical import (  # re-exported for callers
    HIGHER_IS_BETTER,
    LOWER_IS_BETTER,
)

__all__ = [
    "AT_TARGET",
    "AT_TARGET_TOLERANCE_PERCENT",
    "BETTER_THAN_TARGET",
    "HIGHER_IS_BETTER",
    "LOWER_IS_BETTER",
    "NOT_COMPARABLE",
    "WORSE_THAN_TARGET",
    "classify",
]

# Classification outcomes.
BETTER_THAN_TARGET = "BETTER_THAN_TARGET"
AT_TARGET = "AT_TARGET"
WORSE_THAN_TARGET = "WORSE_THAN_TARGET"
NOT_COMPARABLE = "NOT_COMPARABLE"

# A measured value within this band of the benchmark is reported as meeting it.
# The band exists because benchmark values are rounded published figures; without
# it a 0.1% difference would be presented as a miss. 5% is a team-agreed default
# and is returned by the API so the classification stays explainable.
AT_TARGET_TOLERANCE_PERCENT = 5.0


def classify(difference_percent: float, direction: str) -> str:
    """Classify a signed percentage difference from the benchmark.

    difference_percent is (value - benchmark) / benchmark * 100, so it is positive
    when the project reports more than the benchmark.
    """
    if abs(difference_percent) <= AT_TARGET_TOLERANCE_PERCENT:
        return AT_TARGET
    if direction == LOWER_IS_BETTER:
        return BETTER_THAN_TARGET if difference_percent < 0 else WORSE_THAN_TARGET
    return BETTER_THAN_TARGET if difference_percent > 0 else WORSE_THAN_TARGET
