import csv
import io

from backend.app.etl.schema import CANONICAL_COLUMNS
from backend.app.etl.transform import CanonicalMetricRow


def build_processed_csv(rows: list[CanonicalMetricRow]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CANONICAL_COLUMNS)
    for row in rows:
        writer.writerow([row.metric_name, row.value, row.unit, row.category or ""])
    return buffer.getvalue().encode("utf-8")
