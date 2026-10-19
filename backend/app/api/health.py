"""Liveness and readiness endpoints for deployment smoke tests.

Deliberately unauthenticated: a load balancer or container orchestrator cannot
log in, and these expose no data about projects, users or submissions.

The split matters during a deploy. /health answers "is this process alive",
which is what a restart policy needs. /health/ready answers "can it actually
serve requests", which requires the database, and is what a smoke test and a
rolling deploy should gate on. Collapsing them into one endpoint makes a
database outage look like a dead process and triggers pointless restarts.
"""

from fastapi import APIRouter, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import Depends

from backend.app.core.config import get_settings
from backend.app.core.database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def liveness() -> dict:
    """Process is running. No dependencies are checked."""
    settings = get_settings()
    return {"status": "ok", "service": "greenchain-api", "environment": settings.environment}


@router.get("/health/ready")
def readiness(response: Response, db: Session = Depends(get_db)) -> dict:
    """Process can reach its database.

    Returns 503 rather than raising, so the body still names the failing
    dependency - a smoke test that only sees a status code cannot tell a
    database outage apart from a crashed application.
    """
    checks: dict[str, str] = {}
    ready = True

    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        # The exception text can carry connection strings and credentials, so it
        # is deliberately not echoed to an unauthenticated caller.
        checks["database"] = "unavailable"
        ready = False

    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {"status": "ready" if ready else "not_ready", "checks": checks}
