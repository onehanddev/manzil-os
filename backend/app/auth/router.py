"""Auth vertical slice router – Supabase Auth only.

Login delegates to Supabase (`supabase.auth.sign_in_with_password` via supabase_client).
User creation delegates to Supabase admin API then links auth_user_id locally.
All /api/* routes verify Supabase JWT via deps.get_current_user.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
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
from app.models import MembershipRole, Role, Society, SocietyMembership, User

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
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return None, []
    rows = db.execute(
        select(SocietyMembership.society_id, Role.key)
        .join(MembershipRole, MembershipRole.society_membership_id == SocietyMembership.id)
        .join(Role, Role.id == MembershipRole.role_id)
        .where(SocietyMembership.user_id == uid, SocietyMembership.status == "ACTIVE")
    ).all()
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
        from app.auth.supabase_client import verify_supabase_jwt

        pv = verify_supabase_jwt(supa["access_token"])
        auth_id = pv.get("sub") if pv else None
    if not auth_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    try:
        auth_uuid = uuid.UUID(str(auth_id))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials") from e
    user = db.execute(select(User).where(User.auth_user_id == auth_uuid)).scalar_one_or_none()
    if user is None:
        user_by_mobile = db.execute(select(User).where(User.mobile == mobile)).scalar_one_or_none()
        if user_by_mobile:
            user_by_mobile.auth_user_id = auth_uuid  # type: ignore[assignment]
            db.commit()
            db.refresh(user_by_mobile)
            user = user_by_mobile
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No local mapping")
    user_id = str(user.id)
    mem = db.execute(
        select(SocietyMembership.status)
        .where(SocietyMembership.user_id == user.id)
        .order_by(SocietyMembership.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if not mem:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No membership")
    status_val = mem
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
    try:
        auth_uuid = uuid.UUID(auth_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP payload") from e
    user_row = db.execute(select(User).where(User.auth_user_id == auth_uuid)).scalar_one_or_none()
    if user_row is None:
        user_by_mobile = db.execute(select(User).where(User.mobile == mobile)).scalar_one_or_none()
        if user_by_mobile:
            if not user_by_mobile.auth_user_id:
                user_by_mobile.auth_user_id = auth_uuid  # type: ignore[assignment]
                db.commit()
                db.refresh(user_by_mobile)
            user_row = user_by_mobile
        else:
            new_user = User(id=uuid.uuid4(), mobile=mobile, display_name=payload.display_name or mobile, auth_user_id=auth_uuid)
            db.add(new_user)
            db.flush()
            society_row = db.execute(select(Society).limit(1)).scalar_one_or_none()
            society_id = society_row.id if society_row else None
            if society_id:
                admin_exists = db.execute(
                    select(SocietyMembership.id)
                    .join(MembershipRole, MembershipRole.society_membership_id == SocietyMembership.id)
                    .join(Role, Role.id == MembershipRole.role_id)
                    .where(Role.key == "SOCIETY_ADMIN", SocietyMembership.status == "ACTIVE")
                    .limit(1)
                ).scalar_one_or_none()
                if admin_exists is None:
                    membership = SocietyMembership(id=uuid.uuid4(), user_id=new_user.id, society_id=society_id, status="ACTIVE")
                    db.add(membership)
                    db.flush()
                    role_row = db.execute(select(Role).where(Role.key == "SOCIETY_ADMIN")).scalar_one_or_none()
                    if role_row:
                        db.add(MembershipRole(society_membership_id=membership.id, role_id=role_row.id))
                    db.commit()
                    return {"access_token": result["access_token"], "token_type": "bearer", "status": "active", "role": "SOCIETY_ADMIN"}
                else:
                    membership = SocietyMembership(id=uuid.uuid4(), user_id=new_user.id, society_id=society_id, status="PENDING")
                    db.add(membership)
                    db.commit()
                    return {"access_token": result["access_token"], "token_type": "bearer", "status": "pending"}
            db.commit()
            user_row = new_user
    uid = str(user_row.id)
    mem_status = db.execute(
        select(SocietyMembership.status)
        .where(SocietyMembership.user_id == user_row.id)
        .order_by(SocietyMembership.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    status_val = mem_status if mem_status else "active"
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
