"""Funds vertical slice – admin only."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.db import get_db
from app.models import Fund

router = APIRouter(tags=["funds"])


class CreateFundRequest(BaseModel):
    name: str

    model_config = {"extra": "forbid"}


def _serialize(f: Fund) -> dict:
    return {
        "id": str(f.id),
        "society_id": str(f.society_id),
        "name": f.name,
        "is_active": f.is_active,
        "created_at": f.created_at.isoformat() if f.created_at else None,
        "updated_at": f.updated_at.isoformat() if f.updated_at else None,
    }


@router.post("/api/funds", status_code=status.HTTP_201_CREATED)
def create_fund(payload: CreateFundRequest, db: Session = Depends(get_db), current=Depends(require_admin)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name required")
    society_id = current["society_id"]
    if not society_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No society linked")
    fund = Fund(id=uuid.uuid4(), society_id=uuid.UUID(society_id), name=name, is_active=True)
    db.add(fund)
    try:
        db.commit()
        db.refresh(fund)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Fund name already exists") from e
    return _serialize(fund)


@router.get("/api/funds")
def list_funds(db: Session = Depends(get_db), current=Depends(require_admin)):
    society_id = uuid.UUID(current["society_id"])
    rows = db.execute(select(Fund).where(Fund.society_id == society_id).order_by(Fund.name)).scalars().all()
    funds = [_serialize(r) for r in rows]
    return {"funds": funds}
