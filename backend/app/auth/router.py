"""Auth vertical slice router – Supabase Auth only.

Login delegates to Supabase (`supabase.auth.sign_in_with_password` via supabase_client).
User creation delegates to Supabase admin API then links auth_user_id locally.
All /api/* routes verify Supabase JWT via deps.get_current_user.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_admin
from app.auth.security import normalize_mobile
from app.auth.supabase_client import is_supabase_configured, supabase_create_user, supabase_sign_in
from app.db import get_db

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    mobile: str
    password: str


class CreateStaffRequest(BaseModel):
    mobile: str
    password: str
    display_name: str
    role: str = "COLLECTOR"


def _get_roles_for_user(db: Session, user_id: str) -> tuple[str | None, list[str]]:
    rows = db.execute(
        text(
            """
            SELECT sm.society_id, r.key
            FROM society_memberships sm
            JOIN membership_roles mr ON mr.society_membership_id = sm.id
            JOIN roles r ON r.id = mr.role_id
            WHERE sm.user_id=:uid AND sm.status='ACTIVE'
            """
        ),
        {"uid": user_id},
    ).fetchall()
    if not rows:
        return None, []
    society_id = str(rows[0][0])
    roles = [r[1] for r in rows]
    return society_id, roles


@router.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    if not is_supabase_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase not configured")
    mobile = normalize_mobile(payload.mobile)
    supa = supabase_sign_in(mobile, payload.password)
    if not supa or not supa.get("access_token"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    supa_user = supa.get("user")
    auth_id = None
    if supa_user is not None:
        auth_id = getattr(supa_user, "id", None) if not isinstance(supa_user, dict) else supa_user.get("id")
    if not auth_id:
        # supabase_sign_in may return token without user; decode token sub as fallback
        from app.auth.supabase_client import verify_supabase_jwt

        pv = verify_supabase_jwt(supa["access_token"])
        auth_id = pv.get("sub") if pv else None
    if not auth_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    row = db.execute(text("SELECT id FROM users WHERE auth_user_id=:a"), {"a": str(auth_id)}).fetchone()
    if row is None:
        # legacy mobile row – link it
        row2 = db.execute(text("SELECT id FROM users WHERE mobile=:m"), {"m": mobile}).fetchone()
        if row2:
            db.execute(text("UPDATE users SET auth_user_id=:a WHERE id=:uid"), {"a": str(auth_id), "uid": str(row2[0])})
            db.commit()
            row = row2
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No local mapping")
    user_id = str(row[0])
    society_id, roles = _get_roles_for_user(db, user_id)
    if not roles:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No active membership")
    return {"access_token": supa["access_token"], "token_type": "bearer"}


@router.post("/auth/logout")
def logout(current=Depends(get_current_user)):
    return {"status": "ok"}


@router.get("/api/me")
def get_me(current=Depends(get_current_user)):
    return {
        "user_id": current["user_id"],
        "auth_user_id": current.get("auth_user_id"),
        "mobile": current["mobile"],
        "roles": current["roles"],
        "society_id": current["society_id"],
    }


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


@router.get("/api/flats")
def list_flats(current=Depends(get_current_user)):
    return {"flats": [], "user_roles": current["roles"]}


@router.post("/api/flats")
def create_flat(payload: dict, db: Session = Depends(get_db), current=Depends(require_admin)):
    return {"status": "created", "by": current["user_id"]}


@router.post("/api/receipts")
def create_receipt(payload: dict, current=Depends(get_current_user)):
    return {"status": "receipt created", "by": current["user_id"], "roles": current["roles"]}


@router.post("/api/opening-dues")
def create_opening_due(payload: dict, current=Depends(require_admin)):
    return {"status": "opening due created"}


@router.get("/api/admin/stats")
def admin_stats(current=Depends(require_admin)):
    return {"stats": "ok", "for": current["user_id"]}
