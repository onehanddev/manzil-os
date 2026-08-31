"""Health vertical slice – `GET /health`."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check(db: Session = Depends(get_db)):  # noqa: B008
    """Return basic liveness; also verifies DB session can execute a query."""
    try:
        db.execute(select(1))
        db_status = "ok"
    except Exception:  # pragma: no cover – DB failure path
        db_status = "error"
    return {"status": "ok", "db": db_status}
