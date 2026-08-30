"""Admin vertical slice – staff creation, pending approval and stats."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.auth.security import normalize_mobile
from app.auth.supabase_client import is_supabase_configured, supabase_create_user
from app.db import get_db


class CreateStaffRequest(BaseModel):
    mobile: str
    password: str
    display_name: str
    role: str = "COLLECTOR"

router = APIRouter(tags=["admin"])


@router.post("/api/admin/users")
def create_staff(payload: CreateStaffRequest, db: Session = Depends(get_db), current=Depends(require_admin)):
    if not is_supabase_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase not configured")
    if payload.role not in ("SOCIETY_ADMIN", "COLLECTOR"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid role")
    mobile = normalize_mobile(payload.mobile)
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Password too short")
    existing = db.execute(text("SELECT id FROM users WHERE mobile=:m"), {"m": mobile}).fetchone()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Mobile already registered")
    auth_user_id = supabase_create_user(mobile, payload.password, payload.display_name)
    if not auth_user_id:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Supabase create_user failed")
    user_id = str(uuid.uuid4())
    db.execute(
        text("INSERT INTO users (id, mobile, display_name, auth_user_id) VALUES (:id, :mobile, :name, :aid)"),
        {"id": user_id, "mobile": mobile, "name": payload.display_name, "aid": auth_user_id},
    )
    society_id = current["society_id"]
    membership_id = str(uuid.uuid4())
    db.execute(
        text("INSERT INTO society_memberships (id, user_id, society_id, status) VALUES (:mid, :uid, :sid, 'ACTIVE')"),
        {"mid": membership_id, "uid": user_id, "sid": society_id},
    )
    role_row = db.execute(text("SELECT id FROM roles WHERE key=:k"), {"k": payload.role}).fetchone()
    if role_row is None:
        raise HTTPException(status_code=500, detail="Role not found")
    db.execute(
        text("INSERT INTO membership_roles (society_membership_id, role_id) VALUES (:mid, :rid)"),
        {"mid": membership_id, "rid": str(role_row[0])},
    )
    db.commit()
    return {"id": user_id, "mobile": mobile, "role": payload.role, "auth_user_id": auth_user_id}


@router.get("/api/admin/pending")
def list_pending(db: Session = Depends(get_db), current=Depends(require_admin)):
    rows = db.execute(
        text(
            """
            SELECT u.id, u.mobile, u.display_name, sm.id as membership_id, sm.status
            FROM users u
            JOIN society_memberships sm ON sm.user_id = u.id
            WHERE sm.status='PENDING' AND sm.society_id=:sid
            ORDER BY sm.created_at DESC
            """
        ),
        {"sid": current["society_id"]},
    ).fetchall()
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
    mem = db.execute(
        text("SELECT id, status, society_id FROM society_memberships WHERE user_id=:uid AND status='PENDING'"),
        {"uid": user_id},
    ).fetchone()
    if mem is None:
        existing = db.execute(text("SELECT id FROM society_memberships WHERE user_id=:uid"), {"uid": user_id}).fetchone()
        if existing is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending membership not found")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already active")
    mem_id, _, society_id = mem
    if str(society_id) != str(current["society_id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Society mismatch")
    db.execute(text("UPDATE society_memberships SET status='ACTIVE' WHERE id=:mid"), {"mid": str(mem_id)})
    role_row = db.execute(text("SELECT id FROM roles WHERE key=:k"), {"k": role}).fetchone()
    if role_row is None:
        raise HTTPException(status_code=500, detail="Role not found")
    existing_role = db.execute(
        text("SELECT 1 FROM membership_roles WHERE society_membership_id=:mid AND role_id=:rid"),
        {"mid": str(mem_id), "rid": str(role_row[0])},
    ).fetchone()
    if not existing_role:
        db.execute(
            text("INSERT INTO membership_roles (society_membership_id, role_id) VALUES (:mid, :rid)"),
            {"mid": str(mem_id), "rid": str(role_row[0])},
        )
    db.commit()
    return {"status": "active", "user_id": user_id, "role": role}


@router.get("/api/admin/stats")
def admin_stats(current=Depends(require_admin)):
    return {"stats": "ok", "for": current["user_id"]}
