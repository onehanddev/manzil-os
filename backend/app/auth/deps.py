"""Auth dependencies – Supabase Auth only.

Every /api/* request must present a Supabase JWT (from `supabase.auth.signInWithPassword`
or `signInWithOtp`). We verify via SUPABASE_JWT_SECRET and map `sub` -> users.auth_user_id -> roles.
No local JWT fallback. Supabase is expected to be available in all envs (including CI via mock).
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.supabase_client import verify_supabase_jwt
from app.db import get_db

_bearer = HTTPBearer(auto_error=False)


def _resolve_user_by_auth_id(db: Session, auth_user_id: str):
    return db.execute(
        text("SELECT id, mobile, display_name FROM users WHERE auth_user_id=:aid"), {"aid": auth_user_id}
    ).fetchone()


def _get_roles_and_society(db: Session, user_id: str):
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
        # No local mapping – phone may be in JWT (useful for first OTP sync)
        # Try to auto-link by phone if a legacy mobile row exists (eases seed migration)
        phone = payload.get("phone") or payload.get("user_metadata", {}).get("mobile")
        if phone:
            from app.auth.security import normalize_mobile

            phone_norm = normalize_mobile(str(phone))
            row2 = db.execute(text("SELECT id FROM users WHERE mobile=:m"), {"m": phone_norm}).fetchone()
            if row2:
                db.execute(
                    text("UPDATE users SET auth_user_id=:aid WHERE id=:uid"),
                    {"aid": str(auth_user_id), "uid": str(row2[0])},
                )
                db.commit()
                row = db.execute(
                    text("SELECT id, mobile, display_name FROM users WHERE id=:uid"), {"uid": str(row2[0])}
                ).fetchone()
        if row is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not linked")
    user_id = str(row[0])
    society_id, roles = _get_roles_and_society(db, user_id)
    return {
        "user_id": user_id,
        "auth_user_id": str(auth_user_id),
        "society_id": str(society_id) if society_id else None,
        "roles": roles,
        "mobile": row[1],
        "display_name": row[2],
    }


def require_admin(current=Depends(get_current_user)) -> dict:
    if "SOCIETY_ADMIN" not in current.get("roles", []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current


def require_auth(current=Depends(get_current_user)) -> dict:
    return current
