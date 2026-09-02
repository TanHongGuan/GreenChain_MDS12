from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.etl.transform import CanonicalMetricRow
from backend.app.models.metric import Metric


def bulk_create_metrics(db: Session, submission_id: int, rows: list[CanonicalMetricRow]) -> list[Metric]:
    metrics = [
        Metric(
            submission_id=submission_id,
            metric_name=row.metric_name,
            value=row.value,
            unit=row.unit,
            category=row.category,
        )
        for row in rows
    ]
    db.add_all(metrics)
    db.flush()
    return metrics


def get_metrics_for_submission(db: Session, submission_id: int) -> list[Metric]:
    stmt = select(Metric).where(Metric.submission_id == submission_id).order_by(Metric.id.asc())
    return list(db.scalars(stmt).all())
