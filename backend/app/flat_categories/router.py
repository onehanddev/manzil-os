"""Flat categories vertical slice – admin only."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.db import get_db
from app.models import FlatCategory

router = APIRouter(tags=["flat-categories"])


class CreateCategoryRequest(BaseModel):
    name: str
    size_sq_ft: float | None = None
    maintenance_amount: float | None = None


class PatchCategoryRequest(BaseModel):
    is_active: bool | None = None
    maintenance_amount: float | None = None

    model_config = {"extra": "forbid"}


def _serialize(cat: FlatCategory) -> dict:
    return {
        "id": str(cat.id),
        "society_id": str(cat.society_id),
        "name": cat.name,
        "size_sq_ft": float(cat.size_sq_ft) if cat.size_sq_ft is not None else None,
        "maintenance_amount": float(cat.maintenance_amount) if cat.maintenance_amount is not None else None,
        "is_active": cat.is_active,
    }


@router.post("/api/flat-categories", status_code=status.HTTP_201_CREATED)
def create_flat_category(
    payload: CreateCategoryRequest, db: Session = Depends(get_db), current=Depends(require_admin)
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name required")
    society_id = current["society_id"]
    if not society_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No society linked")
    if payload.size_sq_ft is not None and payload.size_sq_ft <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="size_sq_ft must be > 0")
    if payload.maintenance_amount is not None and payload.maintenance_amount < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="maintenance_amount must be >= 0")
    cat = FlatCategory(
        id=uuid.uuid4(),
        society_id=uuid.UUID(society_id),
        name=name,
        size_sq_ft=payload.size_sq_ft,
        maintenance_amount=payload.maintenance_amount,
        is_active=True,
    )
    db.add(cat)
    try:
        db.commit()
        db.refresh(cat)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category name already exists") from e
    return _serialize(cat)


@router.get("/api/flat-categories")
def list_flat_categories(db: Session = Depends(get_db), current=Depends(require_admin)):
    society_id = uuid.UUID(current["society_id"])
    rows = db.execute(select(FlatCategory).where(FlatCategory.society_id == society_id).order_by(FlatCategory.name)).scalars().all()
    categories = [_serialize(r) for r in rows]
    return {"categories": categories, "flat_categories": categories}


@router.patch("/api/flat-categories/{cat_id}")
def patch_flat_category(
    cat_id: str, payload: PatchCategoryRequest, db: Session = Depends(get_db), current=Depends(require_admin)
):
    society_id = uuid.UUID(current["society_id"])
    try:
        cid = uuid.UUID(cat_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found") from e
    cat = db.execute(
        select(FlatCategory).where(FlatCategory.id == cid, FlatCategory.society_id == society_id)
    ).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    if payload.is_active is None and payload.maintenance_amount is None and payload.model_fields_set == set():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No fields to update")
    if payload.is_active is not None:
        cat.is_active = payload.is_active
    if "maintenance_amount" in payload.model_fields_set:
        if payload.maintenance_amount is not None and payload.maintenance_amount < 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="maintenance_amount must be >= 0")
        cat.maintenance_amount = payload.maintenance_amount
    if cat in db.dirty or db.new:
        from datetime import datetime, timezone

        cat.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(cat)
    data = _serialize(cat)
    data["category"] = {"id": data["id"], "is_active": data["is_active"], "maintenance_amount": data["maintenance_amount"]}
    return data
