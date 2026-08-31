"""Opening dues vertical slice – admin only, per flat."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.auth.deps import require_active, require_admin
from app.db import get_db
from app.models import Flat, OpeningDue

router = APIRouter(tags=["opening-dues"])


class OpeningDueRequest(BaseModel):
    amount: float


def _get_flat_or_404(db: Session, flat_id: str, society_id: str) -> Flat:
    try:
        fid = uuid.UUID(flat_id)
        sid = uuid.UUID(society_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found") from e
    flat = db.execute(select(Flat).where(Flat.id == fid, Flat.society_id == sid)).scalar_one_or_none()
    if not flat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found")
    return flat


@router.put("/api/flats/{flat_id}/opening-due")
def put_opening_due(flat_id: str, payload: OpeningDueRequest, db: Session = Depends(get_db), current=Depends(require_admin)):
    society_id = current["society_id"]
    if payload.amount is None or payload.amount < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Amount must be >= 0")
    flat = _get_flat_or_404(db, flat_id, society_id)
    # UPSERT via ORM: try fetch then update/insert
    existing = db.execute(select(OpeningDue).where(OpeningDue.flat_id == flat.id)).scalar_one_or_none()
    if existing:
        existing.amount = payload.amount  # type: ignore[assignment]
        from datetime import datetime, timezone

        existing.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        row = existing
    else:
        row = OpeningDue(flat_id=flat.id, amount=payload.amount)
        db.add(row)
        db.commit()
        db.refresh(row)
    return {"flat_id": str(row.flat_id), "amount": float(row.amount), "opening_due": {"flat_id": str(row.flat_id), "amount": float(row.amount)}}


@router.get("/api/flats/{flat_id}/opening-due")
def get_opening_due(flat_id: str, db: Session = Depends(get_db), current=Depends(require_active)):
    society_id = current["society_id"]
    flat = _get_flat_or_404(db, flat_id, society_id)
    row = db.execute(select(OpeningDue).where(OpeningDue.flat_id == flat.id)).scalar_one_or_none()
    if not row:
        return {"flat_id": flat_id, "amount": 0, "opening_due": {"flat_id": flat_id, "amount": 0}}
    return {"flat_id": str(row.flat_id), "amount": float(row.amount), "opening_due": {"flat_id": str(row.flat_id), "amount": float(row.amount)}}


# Keep legacy POST for backwards compat if any test uses it
@router.post("/api/opening-dues")
def create_opening_due_legacy(payload: dict, db: Session = Depends(get_db), current=Depends(require_admin)):  # pragma: no cover
    flat_id = payload.get("flat_id")
    amount = payload.get("amount")
    if not flat_id or amount is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="flat_id and amount required")
    if float(amount) < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Amount must be >= 0")
    society_id = current["society_id"]
    flat = _get_flat_or_404(db, str(flat_id), society_id)
    existing = db.execute(select(OpeningDue).where(OpeningDue.flat_id == flat.id)).scalar_one_or_none()
    if existing:
        existing.amount = float(amount)  # type: ignore[assignment]
        db.commit()
        db.refresh(existing)
    else:
        row = OpeningDue(flat_id=flat.id, amount=float(amount))
        db.add(row)
        db.commit()
    return {"status": "opening due created", "flat_id": str(flat_id), "amount": float(amount)}
