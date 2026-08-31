"""Auth dependencies – Supabase Auth only.

Every /api/* request must present a Supabase JWT (from `supabase.auth.signInWithPassword`
or `signInWithOtp`). We verify via SUPABASE_JWT_SECRET and map `sub` -> users.auth_user_id -> roles.
No local JWT fallback. Supabase is expected to be available in all envs (including CI via mock).
"""

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.supabase_client import verify_supabase_jwt
from app.db import get_db
from app.models import MembershipRole, Role, SocietyMembership, User

_bearer = HTTPBearer(auto_error=False)


def _resolve_user_by_auth_id(db: Session, auth_user_id: str) -> User | None:
    try:
        aid = uuid.UUID(auth_user_id)
    except ValueError:
        return None
    return db.execute(select(User).where(User.auth_user_id == aid)).scalar_one_or_none()


def _get_roles_and_society(db: Session, user_id: str) -> tuple[str | None, list[str]]:
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


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> dict:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = credentials.credentials
    payload = verify_supabase_jwt(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    auth_user_id = payload.get("sub")
    if not auth_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    row = _resolve_user_by_auth_id(db, str(auth_user_id))
    if row is None:
        phone = payload.get("phone") or payload.get("user_metadata", {}).get("mobile")
        if phone:
            from app.auth.security import normalize_mobile

            phone_norm = normalize_mobile(str(phone))
            user_by_mobile = db.execute(select(User).where(User.mobile == phone_norm)).scalar_one_or_none()
            if user_by_mobile:
                try:
                    user_by_mobile.auth_user_id = uuid.UUID(str(auth_user_id))  # type: ignore[assignment]
                    db.commit()
                    db.refresh(user_by_mobile)
                    row = user_by_mobile
                except ValueError:
                    pass
        if row is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not linked")
    user_id = str(row.id)
    society_id, roles = _get_roles_and_society(db, user_id)
    return {
        "user_id": user_id,
        "auth_user_id": str(auth_user_id),
        "society_id": str(society_id) if society_id else None,
        "roles": roles,
        "mobile": row.mobile,
        "display_name": row.display_name,
    }


def require_admin(current=Depends(get_current_user)) -> dict:
    if "SOCIETY_ADMIN" not in current.get("roles", []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current


def require_active(current=Depends(get_current_user)) -> dict:
    if not current.get("roles"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pending approval")
    return current


def require_auth(current=Depends(get_current_user)) -> dict:
    return current
