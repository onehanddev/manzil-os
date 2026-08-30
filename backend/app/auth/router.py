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

from app.auth.deps import get_current_user
from app.auth.security import normalize_mobile
from app.auth.supabase_client import (
    is_supabase_configured,
    supabase_send_otp,
    supabase_set_password,
    supabase_sign_in,
    supabase_verify_otp,
)
from app.db import get_db

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    mobile: str
    password: str


class OtpSendRequest(BaseModel):
    mobile: str


class OtpVerifyRequest(BaseModel):
    mobile: str
    token: str
    display_name: str | None = None


class SetPasswordRequest(BaseModel):
    password: str


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
    # Allow login even if still PENDING (registration complete, awaiting admin approval)
    # Check membership status – return token with status hint, deps will enforce ACTIVE for guarded routes
    mem = db.execute(
        text("SELECT status FROM society_memberships WHERE user_id=:uid ORDER BY created_at DESC LIMIT 1"),
        {"uid": user_id},
    ).fetchone()
    if not mem:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No membership")
    status_val = mem[0]
    if status_val == "PENDING":
        return {"access_token": supa["access_token"], "token_type": "bearer", "status": "pending"}
    society_id, roles = _get_roles_for_user(db, user_id)
    if not roles:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No active membership")
    return {"access_token": supa["access_token"], "token_type": "bearer", "status": "active"}


@router.post("/auth/otp/send")
def otp_send(payload: OtpSendRequest):
    mobile = normalize_mobile(payload.mobile)
    if not is_supabase_configured():
        # In pure test OTP mode, allow without full Supabase config (mock)
        from app.auth.supabase_client import supabase_send_otp as _send

        otp = _send(mobile)
        if otp == "123456":
            return {"status": "sent", "otp": "123456"}
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase not configured")
    otp = supabase_send_otp(mobile)
    if otp is None:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to send OTP")
    if otp == "123456":
        return {"status": "sent", "otp": "123456"}
    return {"status": "sent"}


@router.post("/auth/otp/verify")
def otp_verify(payload: OtpVerifyRequest, db: Session = Depends(get_db)):
    mobile = normalize_mobile(payload.mobile)
    if not payload.token or not payload.token.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Token required")
    result = supabase_verify_otp(mobile, payload.token.strip())
    if not result or not result.get("access_token"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP")
    auth_id = None
    user = result.get("user")
    if user is not None:
        auth_id = user.get("id") if isinstance(user, dict) else getattr(user, "id", None)
    if not auth_id:
        from app.auth.supabase_client import verify_supabase_jwt

        pv = verify_supabase_jwt(result["access_token"])
        auth_id = pv.get("sub") if pv else None
    if not auth_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP payload")
    auth_id = str(auth_id)
    # Find or create local user
    row = db.execute(text("SELECT id FROM users WHERE auth_user_id=:a"), {"a": auth_id}).fetchone()
    if row is None:
        row2 = db.execute(text("SELECT id, auth_user_id FROM users WHERE mobile=:m"), {"m": mobile}).fetchone()
        if row2:
            # Link existing mobile row (e.g. seeded admin with no auth_id)
            uid, existing_auth = row2
            if not existing_auth:
                db.execute(text("UPDATE users SET auth_user_id=:a WHERE id=:uid"), {"a": auth_id, "uid": str(uid)})
                db.commit()
            row = (uid,)
        else:
            # New registration - create user + membership
            new_user_id = str(uuid.uuid4())
            display_name = payload.display_name or mobile
            db.execute(
                text("INSERT INTO users (id, mobile, display_name, auth_user_id) VALUES (:id, :m, :d, :a)"),
                {"id": new_user_id, "m": mobile, "d": display_name, "a": auth_id},
            )
            # Decide membership status: first user in system becomes ACTIVE SOCIETY_ADMIN, rest PENDING
            society_id_row = db.execute(text("SELECT id FROM societies LIMIT 1")).fetchone()
            society_id = str(society_id_row[0]) if society_id_row else None
            if society_id:
                # Check if any ACTIVE SOCIETY_ADMIN exists
                admin_exists = db.execute(
                    text(
                        """
                        SELECT 1 FROM society_memberships sm
                        JOIN membership_roles mr ON mr.society_membership_id=sm.id
                        JOIN roles r ON r.id=mr.role_id
                        WHERE r.key='SOCIETY_ADMIN' AND sm.status='ACTIVE' LIMIT 1
                        """
                    )
                ).fetchone()
                if admin_exists is None:
                    # Bootstrap first admin
                    mem_id = str(uuid.uuid4())
                    db.execute(
                        text("INSERT INTO society_memberships (id, user_id, society_id, status) VALUES (:mid, :uid, :sid, 'ACTIVE')"),
                        {"mid": mem_id, "uid": new_user_id, "sid": society_id},
                    )
                    role_row = db.execute(text("SELECT id FROM roles WHERE key='SOCIETY_ADMIN'")).fetchone()
                    db.execute(
                        text("INSERT INTO membership_roles (society_membership_id, role_id) VALUES (:mid, :rid)"),
                        {"mid": mem_id, "rid": str(role_row[0])},
                    )
                    db.commit()
                    return {"access_token": result["access_token"], "token_type": "bearer", "status": "active", "role": "SOCIETY_ADMIN"}
                else:
                    # Regular user pending approval
                    mem_id = str(uuid.uuid4())
                    db.execute(
                        text("INSERT INTO society_memberships (id, user_id, society_id, status) VALUES (:mid, :uid, :sid, 'PENDING')"),
                        {"mid": mem_id, "uid": new_user_id, "sid": society_id},
                    )
                    db.commit()
                    return {"access_token": result["access_token"], "token_type": "bearer", "status": "pending"}
            row = (new_user_id,)
    # Existing user – just return token (approval check happens via deps on guarded routes)
    # Determine status for response hint
    uid = str(row[0])
    mem = db.execute(
        text("SELECT status FROM society_memberships WHERE user_id=:uid ORDER BY created_at DESC LIMIT 1"),
        {"uid": uid},
    ).fetchone()
    status_val = mem[0] if mem else "active"
    return {"access_token": result["access_token"], "token_type": "bearer", "status": status_val.lower()}


@router.post("/auth/set-password")
def set_password(payload: SetPasswordRequest, current=Depends(get_current_user)):
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Password too short")
    auth_id = current.get("auth_user_id")
    if not auth_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No auth user linked")
    ok = supabase_set_password(str(auth_id), payload.password)
    if not ok:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to set password")
    return {"status": "password_set"}


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
