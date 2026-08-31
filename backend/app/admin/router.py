"""Admin vertical slice – staff creation, pending approval and stats."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.auth.security import normalize_mobile
from app.auth.supabase_client import is_supabase_configured, supabase_create_user
from app.db import get_db
from app.models import MembershipRole, Role, SocietyMembership, User

router = APIRouter(tags=["admin"])


class CreateStaffRequest(BaseModel):
    mobile: str
    password: str
    display_name: str
    role: str = "COLLECTOR"


@router.post("/api/admin/users")
def create_staff(payload: CreateStaffRequest, db: Session = Depends(get_db), current=Depends(require_admin)):
    if not is_supabase_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase not configured")
    if payload.role not in ("SOCIETY_ADMIN", "COLLECTOR"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid role")
    mobile = normalize_mobile(payload.mobile)
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Password too short")
    existing = db.execute(select(User).where(User.mobile == mobile)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Mobile already registered")
    auth_user_id = supabase_create_user(mobile, payload.password, payload.display_name)
    if not auth_user_id:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Supabase create_user failed")
    try:
        auth_uuid = uuid.UUID(auth_user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Invalid auth_user_id") from e
    user = User(id=uuid.uuid4(), mobile=mobile, display_name=payload.display_name, auth_user_id=auth_uuid)
    db.add(user)
    db.flush()
    try:
        sid = uuid.UUID(current["society_id"])
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid society") from e
    membership = SocietyMembership(id=uuid.uuid4(), user_id=user.id, society_id=sid, status="ACTIVE")
    db.add(membership)
    db.flush()
    role_row = db.execute(select(Role).where(Role.key == payload.role)).scalar_one_or_none()
    if role_row is None:
        db.rollback()
        raise HTTPException(status_code=500, detail="Role not found")
    membership_role = MembershipRole(society_membership_id=membership.id, role_id=role_row.id)
    db.add(membership_role)
    db.commit()
    return {"id": str(user.id), "mobile": mobile, "role": payload.role, "auth_user_id": auth_user_id}


@router.get("/api/admin/pending")
def list_pending(db: Session = Depends(get_db), current=Depends(require_admin)):
    sid = uuid.UUID(current["society_id"])
    rows = db.execute(
        select(User.id, User.mobile, User.display_name, SocietyMembership.id, SocietyMembership.status)
        .join(SocietyMembership, SocietyMembership.user_id == User.id)
        .where(SocietyMembership.status == "PENDING", SocietyMembership.society_id == sid)
        .order_by(SocietyMembership.created_at.desc())
    ).all()
    pending = [
        {"user_id": str(r[0]), "mobile": r[1], "display_name": r[2], "membership_id": str(r[3]), "status": r[4]}
        for r in rows
    ]
    return {"pending": pending}


@router.post("/api/admin/users/{user_id}/approve")
def approve_user(user_id: str, payload: dict, db: Session = Depends(get_db), current=Depends(require_admin)):
    role = payload.get("role")
    if role not in ("SOCIETY_ADMIN", "COLLECTOR"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid role")
    try:
        uid = uuid.UUID(user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending membership not found") from e
    mem = db.execute(
        select(SocietyMembership).where(SocietyMembership.user_id == uid, SocietyMembership.status == "PENDING")
    ).scalar_one_or_none()
    if mem is None:
        existing = db.execute(select(SocietyMembership).where(SocietyMembership.user_id == uid)).scalar_one_or_none()
        if existing is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending membership not found")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already active")
    if str(mem.society_id) != str(current["society_id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Society mismatch")
    mem.status = "ACTIVE"  # type: ignore[assignment]
    role_row = db.execute(select(Role).where(Role.key == role)).scalar_one_or_none()
    if role_row is None:
        raise HTTPException(status_code=500, detail="Role not found")
    existing_role = db.execute(
        select(MembershipRole).where(
            MembershipRole.society_membership_id == mem.id, MembershipRole.role_id == role_row.id
        )
    ).scalar_one_or_none()
    if not existing_role:
        db.add(MembershipRole(society_membership_id=mem.id, role_id=role_row.id))
    db.commit()
    return {"status": "active", "user_id": user_id, "role": role}


@router.get("/api/admin/stats")
def admin_stats(current=Depends(require_admin)):
    return {"stats": "ok", "for": current["user_id"]}
