"""Flats vertical slice – admin vs collector RBAC, occupancy, default-payer."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.deps import require_active, require_admin
from app.db import get_db
from app.models import Flat, FlatCategory, FlatOccupant, Person

router = APIRouter(tags=["flats"])


class CreateFlatRequest(BaseModel):
    flat_number: str
    flat_category_id: str
    is_active: bool | None = None


class CreateOccupantRequest(BaseModel):
    person_id: str
    role: str
    is_active: bool | None = True
    effective_from: str | None = None
    effective_until: str | None = None


def _serialize_flat(flat: Flat, category: FlatCategory | None) -> dict:
    return {
        "id": str(flat.id),
        "society_id": str(flat.society_id),
        "flat_number": flat.flat_number,
        "flat_category_id": str(flat.flat_category_id),
        "is_active": flat.is_active,
        "created_at": flat.created_at.isoformat() if flat.created_at else None,
        "maintenance_amount": float(category.maintenance_amount) if category and category.maintenance_amount is not None else None,
        "category_maintenance_amount": float(category.maintenance_amount) if category and category.maintenance_amount is not None else None,
        "flat_category": {"id": str(flat.flat_category_id), "name": category.name, "maintenance_amount": float(category.maintenance_amount) if category and category.maintenance_amount is not None else None}
        if category
        else None,
    }


@router.get("/api/flats")
def list_flats(db: Session = Depends(get_db), current=Depends(require_active)):
    society_id = current["society_id"]
    if not society_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No society linked")
    sid = uuid.UUID(society_id)
    flats = db.execute(select(Flat).where(Flat.society_id == sid).order_by(Flat.flat_number)).scalars().all()
    # batch-load categories for this society
    cat_ids = {f.flat_category_id for f in flats}
    cats = {}
    if cat_ids:
        cats = {
            c.id: c
            for c in db.execute(select(FlatCategory).where(FlatCategory.id.in_(cat_ids))).scalars().all()
        }
    result = [_serialize_flat(f, cats.get(f.flat_category_id)) for f in flats]
    return {"flats": result}


@router.get("/api/flats/{flat_id}")
def get_flat(flat_id: str, db: Session = Depends(get_db), current=Depends(require_active)):
    society_id = current["society_id"]
    try:
        fid = uuid.UUID(flat_id)
        sid = uuid.UUID(society_id) if society_id else None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found") from e
    flat = db.execute(select(Flat).where(Flat.id == fid, Flat.society_id == sid)).scalar_one_or_none()
    if not flat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found")
    category = db.execute(select(FlatCategory).where(FlatCategory.id == flat.flat_category_id)).scalar_one_or_none()
    return _serialize_flat(flat, category)


@router.post("/api/flats", status_code=status.HTTP_201_CREATED)
def create_flat(payload: CreateFlatRequest, db: Session = Depends(get_db), current=Depends(require_admin)):
    society_id = current["society_id"]
    if not society_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No society linked")
    flat_number = payload.flat_number.strip()
    if not flat_number:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="flat_number required")
    try:
        cat_id = uuid.UUID(payload.flat_category_id)
        sid = uuid.UUID(society_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid flat_category_id") from e
    cat = db.execute(select(FlatCategory).where(FlatCategory.id == cat_id, FlatCategory.society_id == sid)).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid flat_category_id")
    is_active = payload.is_active if payload.is_active is not None else True
    flat = Flat(
        id=uuid.uuid4(),
        society_id=sid,
        flat_number=flat_number,
        flat_category_id=cat_id,
        is_active=is_active,
    )
    db.add(flat)
    try:
        db.commit()
        db.refresh(flat)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Flat number already exists") from e
    return {"id": str(flat.id), "society_id": str(flat.society_id), "flat_number": flat.flat_number, "flat_category_id": str(flat.flat_category_id), "is_active": flat.is_active, "flat": {"id": str(flat.id), "flat_number": flat.flat_number}}


@router.post("/api/flats/{flat_id}/occupants", status_code=status.HTTP_201_CREATED)
def assign_occupant(flat_id: str, payload: CreateOccupantRequest, db: Session = Depends(get_db), current=Depends(require_admin)):
    society_id = current["society_id"]
    try:
        fid = uuid.UUID(flat_id)
        sid = uuid.UUID(society_id)
        pid = uuid.UUID(payload.person_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found") from e
    flat_row = db.execute(select(Flat).where(Flat.id == fid, Flat.society_id == sid)).scalar_one_or_none()
    if not flat_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found")
    person_row = db.execute(select(Person).where(Person.id == pid, Person.society_id == sid)).scalar_one_or_none()
    if not person_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    role = payload.role.strip().upper()
    if role not in ("OWNER", "TENANT"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Role must be OWNER or TENANT")
    is_active = payload.is_active if payload.is_active is not None else True
    occupant = FlatOccupant(
        id=uuid.uuid4(),
        flat_id=fid,
        person_id=pid,
        role=role,
        is_active=is_active,
        effective_from=payload.effective_from,  # type: ignore[arg-type]
        effective_until=payload.effective_until,  # type: ignore[arg-type]
    )
    db.add(occupant)
    try:
        db.commit()
        db.refresh(occupant)
    except IntegrityError as e:
        db.rollback()
        msg = str(e).lower()
        if "one_active_occupant_per_flat_role" in msg or "unique" in msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Active occupant already exists for this role") from e
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Occupant already assigned") from e
    return {"id": str(occupant.id), "flat_id": str(occupant.flat_id), "person_id": str(occupant.person_id), "role": occupant.role, "is_active": occupant.is_active}


@router.get("/api/flats/{flat_id}/default-payer")
def get_default_payer(flat_id: str, db: Session = Depends(get_db), current=Depends(require_active)):
    society_id = current["society_id"]
    try:
        fid = uuid.UUID(flat_id)
        sid = uuid.UUID(society_id) if society_id else None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found") from e
    flat_row = db.execute(select(Flat).where(Flat.id == fid, Flat.society_id == sid)).scalar_one_or_none()
    if not flat_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found")
    # tenant first
    tenant = db.execute(
        select(FlatOccupant).where(FlatOccupant.flat_id == fid, FlatOccupant.role == "TENANT", FlatOccupant.is_active.is_(True))
    ).scalar_one_or_none()
    if tenant:
        person = db.execute(select(Person).where(Person.id == tenant.person_id)).scalar_one_or_none()
        return {"person_id": str(tenant.person_id), "default_payer": {"id": str(tenant.person_id), "name": person.name if person else None, "mobile": person.mobile if person else None}, "role": "TENANT"}
    owner = db.execute(
        select(FlatOccupant).where(FlatOccupant.flat_id == fid, FlatOccupant.role == "OWNER", FlatOccupant.is_active.is_(True))
    ).scalar_one_or_none()
    if owner:
        person = db.execute(select(Person).where(Person.id == owner.person_id)).scalar_one_or_none()
        return {"person_id": str(owner.person_id), "default_payer": {"id": str(owner.person_id), "name": person.name if person else None, "mobile": person.mobile if person else None}, "role": "OWNER"}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active occupant found")
