"""Flats vertical slice – admin vs collector RBAC, occupancy, default-payer."""

import uuid
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.deps import require_active, require_admin
from app.db import get_db
from app.models import Flat, FlatCategory, FlatOccupant, OpeningDue, Person, Receipt

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


def _serialize_person_brief(person: Person | None) -> dict | None:
    if not person:
        return None
    return {"id": str(person.id), "name": person.name, "mobile": person.mobile, "email": person.email}


def _build_occupant_maps(db: Session, flat_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    """Batch-load active occupants for the given flats.

    Returns mapping flat_id -> {owner: Person|None, tenant: Person|None, owner_occ: FlatOccupant|None, tenant_occ: FlatOccupant|None, occupants: [...]}
    """
    if not flat_ids:
        return {}
    occupants = db.execute(
        select(FlatOccupant).where(FlatOccupant.flat_id.in_(flat_ids), FlatOccupant.is_active.is_(True))
    ).scalars().all()
    person_ids = {o.person_id for o in occupants}
    persons_by_id: dict[uuid.UUID, Person] = {}
    if person_ids:
        persons_by_id = {
            p.id: p for p in db.execute(select(Person).where(Person.id.in_(person_ids))).scalars().all()
        }
    result: dict[uuid.UUID, dict] = {fid: {"owner": None, "tenant": None, "owner_occ": None, "tenant_occ": None, "occupants": []} for fid in flat_ids}
    for occ in occupants:
        person = persons_by_id.get(occ.person_id)
        entry = {"occupant_id": str(occ.id), "person": _serialize_person_brief(person), "role": occ.role, "is_active": occ.is_active}
        result[occ.flat_id]["occupants"].append(entry)
        if occ.role == "OWNER" and result[occ.flat_id]["owner"] is None:
            result[occ.flat_id]["owner"] = _serialize_person_brief(person)
            result[occ.flat_id]["owner_occ"] = occ
        elif occ.role == "TENANT" and result[occ.flat_id]["tenant"] is None:
            result[occ.flat_id]["tenant"] = _serialize_person_brief(person)
            result[occ.flat_id]["tenant_occ"] = occ
    return result


def _compute_dues_maps(db: Session, flat_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    """Derived field: current_due = COALESCE(opening,0) - COALESCE(sum(posted receipts),0) – never stored."""
    if not flat_ids:
        return {}
    # opening dues
    opening_map: dict[uuid.UUID, float] = {}
    for od in db.execute(select(OpeningDue).where(OpeningDue.flat_id.in_(flat_ids))).scalars().all():
        opening_map[od.flat_id] = float(od.amount)
    # total_paid per flat (only POSTED)
    paid_rows = db.execute(
        select(Receipt.flat_id, func.coalesce(func.sum(Receipt.amount), 0)).where(
            Receipt.flat_id.in_(flat_ids), Receipt.status != "VOIDED"
        ).group_by(Receipt.flat_id)
    ).all()
    paid_map: dict[uuid.UUID, float] = {fid: float(total) for fid, total in paid_rows}
    result: dict[uuid.UUID, dict] = {}
    for fid in flat_ids:
        opening = opening_map.get(fid, 0.0)
        paid = paid_map.get(fid, 0.0)
        result[fid] = {"opening_due": opening, "total_paid": paid, "current_due": opening - paid}
    return result


def _serialize_flat(flat: Flat, category: FlatCategory | None, occupant_info: dict | None = None, dues_info: dict | None = None) -> dict:
    base = {
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
        "category": {"id": str(flat.flat_category_id), "name": category.name} if category else None,
    }
    # enrich with occupant details (Issue 4 AC6 + tenant-first default payer)
    if occupant_info is not None:
        owner = occupant_info.get("owner")
        tenant = occupant_info.get("tenant")
        occupants = occupant_info.get("occupants", [])
        # default payer = tenant first, owner fallback
        default_payer = None
        default_role = None
        if tenant:
            default_payer = tenant
            default_role = "TENANT"
        elif owner:
            default_payer = owner
            default_role = "OWNER"
        base["owner"] = owner
        base["tenant"] = tenant
        base["occupants"] = occupants
        base["default_payer"] = {"person": default_payer, "role": default_role} if default_payer else None
        # also flat direct shortcuts for receipt entry prefill
        base["default_payer_person_id"] = default_payer["id"] if default_payer else None
        base["default_payer_role"] = default_role
    else:
        base["owner"] = None
        base["tenant"] = None
        base["occupants"] = []
        base["default_payer"] = None
        base["default_payer_person_id"] = None
        base["default_payer_role"] = None
    if dues_info is not None:
        base["opening_due"] = dues_info.get("opening_due", 0)
        base["total_paid"] = dues_info.get("total_paid", 0)
        base["current_due"] = dues_info.get("current_due", 0)
    return base


@router.get("/api/flats")
def list_flats(
    db: Session = Depends(get_db),
    current=Depends(require_active),
    with_dues: bool = Query(False, description="Include derived current_due per flat"),
    is_active: bool | None = Query(None, description="Filter by is_active optionally"),
):
    society_id = current["society_id"]
    if not society_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No society linked")
    sid = uuid.UUID(society_id)
    q = select(Flat).where(Flat.society_id == sid)
    if is_active is not None:
        q = q.where(Flat.is_active.is_(is_active))
    q = q.order_by(Flat.flat_number)
    flats = db.execute(q).scalars().all()
    # batch-load categories for this society
    cat_ids = {f.flat_category_id for f in flats}
    cats = {}
    if cat_ids:
        cats = {
            c.id: c
            for c in db.execute(select(FlatCategory).where(FlatCategory.id.in_(cat_ids))).scalars().all()
        }
    flat_ids = [f.id for f in flats]
    occ_maps = _build_occupant_maps(db, flat_ids)
    dues_maps = _compute_dues_maps(db, flat_ids) if with_dues else {}
    result = [
        _serialize_flat(f, cats.get(f.flat_category_id), occ_maps.get(f.id), dues_maps.get(f.id) if with_dues else None)
        for f in flats
    ]
    return {"flats": result}


@router.get("/api/flats/{flat_id}/ledger")
def get_flat_ledger(flat_id: str, db: Session = Depends(get_db), current=Depends(require_active)):
    society_id = current["society_id"]
    try:
        fid = uuid.UUID(flat_id)
        sid = uuid.UUID(society_id) if society_id else None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found") from e
    flat = db.execute(select(Flat).where(Flat.id == fid, Flat.society_id == sid)).scalar_one_or_none()
    if not flat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found")
    opening = db.execute(select(OpeningDue).where(OpeningDue.flat_id == fid)).scalar_one_or_none()
    opening_amount = float(opening.amount) if opening else 0.0
    receipts = db.execute(
        select(Receipt).where(Receipt.flat_id == fid, Receipt.society_id == sid, Receipt.status != "VOIDED").order_by(Receipt.business_date, Receipt.created_at)
    ).scalars().all()
    total_paid = sum(float(r.amount) for r in receipts)
    current_due = opening_amount - total_paid
    # build running due entries: opening row + each receipt row
    entries: list[dict] = []
    # opening row
    entries.append(
        {
            "type": "OPENING",
            "business_date": None,
            "amount": opening_amount,
            "narration": "Opening due",
            "running_due": opening_amount,
            "current_due": opening_amount,
        }
    )
    running = opening_amount
    for r in receipts:
        running -= float(r.amount)
        entries.append(
            {
                "id": str(r.id),
                "type": r.type,
                "business_date": r.business_date.isoformat() if r.business_date else None,
                "amount": float(r.amount),
                "narration": r.narration,
                "collected_by": str(r.collected_by) if r.collected_by else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "running_due": running,
                "current_due": running,
            }
        )
    # fetch POC for header
    occ_info = _build_occupant_maps(db, [fid]).get(fid, {})
    default_payer = occ_info.get("tenant") or occ_info.get("owner")
    return {
        "flat_id": str(fid),
        "society_id": str(sid) if sid else None,
        "flat_number": flat.flat_number,
        "opening_due": opening_amount,
        "opening": opening_amount,
        "total_paid": total_paid,
        "current_due": current_due,
        "default_payer": default_payer,
        "entries": entries,
        "ledger": entries,
        "rows": entries,
        "receipts": [_serialize_receipt_like(r) for r in receipts],
    }


def _serialize_receipt_like(r: Receipt) -> dict:
    return {
        "id": str(r.id),
        "flat_id": str(r.flat_id),
        "amount": float(r.amount),
        "business_date": r.business_date.isoformat() if r.business_date else None,
        "type": r.type,
        "narration": r.narration,
        "status": r.status,
    }


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
    occupant_info = _build_occupant_maps(db, [flat.id]).get(flat.id)
    return _serialize_flat(flat, category, occupant_info)


@router.get("/api/flats/{flat_id}/occupants")
def list_occupants(flat_id: str, db: Session = Depends(get_db), current=Depends(require_active)):
    society_id = current["society_id"]
    try:
        fid = uuid.UUID(flat_id)
        sid = uuid.UUID(society_id) if society_id else None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found") from e
    flat = db.execute(select(Flat).where(Flat.id == fid, Flat.society_id == sid)).scalar_one_or_none()
    if not flat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found")
    occ_maps = _build_occupant_maps(db, [fid])
    info = occ_maps.get(fid, {"occupants": [], "owner": None, "tenant": None})
    # also compute default_payer for convenience
    default_payer = info.get("tenant") or info.get("owner")
    default_role = "TENANT" if info.get("tenant") else ("OWNER" if info.get("owner") else None)
    return {
        "flat_id": str(fid),
        "occupants": info["occupants"],
        "owner": info["owner"],
        "tenant": info["tenant"],
        "default_payer": {"person": default_payer, "role": default_role} if default_payer else None,
    }


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
