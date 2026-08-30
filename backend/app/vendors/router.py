"""Vendors / payees vertical slice – admin only."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.db import get_db
from app.models import Vendor

router = APIRouter(tags=["vendors"])


class CreateVendorRequest(BaseModel):
    name: str
    contact_info: str | None = None

    model_config = {"extra": "forbid"}


def _serialize(v: Vendor) -> dict:
    return {
        "id": str(v.id),
        "society_id": str(v.society_id),
        "name": v.name,
        "contact_info": v.contact_info,
        "is_active": v.is_active,
        "created_at": v.created_at.isoformat() if v.created_at else None,
        "updated_at": v.updated_at.isoformat() if v.updated_at else None,
    }


@router.post("/api/vendors", status_code=status.HTTP_201_CREATED)
def create_vendor(payload: CreateVendorRequest, db: Session = Depends(get_db), current=Depends(require_admin)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name required")
    society_id = current["society_id"]
    if not society_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No society linked")
    vendor = Vendor(
        id=uuid.uuid4(),
        society_id=uuid.UUID(society_id),
        name=name,
        contact_info=payload.contact_info.strip() if payload.contact_info and payload.contact_info.strip() else None,
        is_active=True,
    )
    db.add(vendor)
    try:
        db.commit()
        db.refresh(vendor)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vendor name already exists") from e
    return _serialize(vendor)


@router.get("/api/vendors")
def list_vendors(db: Session = Depends(get_db), current=Depends(require_admin)):
    society_id = uuid.UUID(current["society_id"])
    rows = db.execute(select(Vendor).where(Vendor.society_id == society_id).order_by(Vendor.name)).scalars().all()
    vendors = [_serialize(r) for r in rows]
    return {"vendors": vendors}
