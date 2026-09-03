"""Onboarding vertical slice – first admin sets up society + opening balance.

Seam:
  GET  /api/onboarding/status  – does current install need onboarding?
  POST /api/onboarding/setup   – create/update society + opening cash + admin membership
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db import get_db
from app.models import CashOpeningBalance, MembershipRole, Role, Society, SocietyMembership, User

router = APIRouter(tags=["onboarding"])


class OnboardingSetupRequest(BaseModel):
    name: str
    location: str | None = None
    city: str | None = None
    opening_date: str
    opening_amount: float


@router.get("/api/onboarding/status")
def onboarding_status(current=Depends(get_current_user), db: Session = Depends(get_db)):
    societies = db.execute(select(Society)).scalars().all()
    if not societies:
        return {"needs_onboarding": True, "society": None, "opening_balance": None}
    # if current user has no active membership, needs onboarding (fresh user)
    user_id = current.get("user_id")
    if user_id:
        try:
            uid = uuid.UUID(user_id)
            mem = db.execute(
                select(SocietyMembership).where(SocietyMembership.user_id == uid, SocietyMembership.status == "ACTIVE")
            ).scalar_one_or_none()
            if not mem:
                # check if any society exists but user not linked – needs onboarding/setup for that user
                # For first user after truncate, societies=0 already handled; for later fresh user, needs onboarding false (they are pending)
                # We treat needs_onboarding as societies==0 only, so return False here for pending users
                pass
        except Exception:
            pass
    # check opening balance for first society
    society = societies[0]
    opening = db.execute(
        select(CashOpeningBalance).where(CashOpeningBalance.society_id == society.id).order_by(CashOpeningBalance.opening_date.desc()).limit(1)
    ).scalar_one_or_none()
    needs = False
    # If societies exists but opening balance missing, still needs onboarding
    if not opening:
        needs = True
    else:
        needs = False
    # If societies exists, onboarding is considered done (even if opening missing, we let user complete via onboarding page)
    # Simpler: needs if societies empty
    if societies:
        # if opening missing, still needs onboarding
        if not opening:
            return {
                "needs_onboarding": True,
                "society": {"id": str(society.id), "name": society.name, "location": society.location, "city": society.city},
                "opening_balance": None,
            }
        return {
            "needs_onboarding": False,
            "society": {"id": str(society.id), "name": society.name, "location": society.location, "city": society.city},
            "opening_balance": {"opening_date": opening.opening_date.isoformat(), "amount": float(opening.amount)},
        }
    return {"needs_onboarding": True, "society": None, "opening_balance": None}


@router.post("/api/onboarding/setup")
def onboarding_setup(payload: OnboardingSetupRequest, current=Depends(get_current_user), db: Session = Depends(get_db)):
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Society name required")
    if payload.opening_amount is None or float(payload.opening_amount) < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="opening_amount must be >= 0")
    try:
        od = date.fromisoformat(payload.opening_date)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid opening_date") from e

    # Find or create society
    society = db.execute(select(Society).limit(1)).scalar_one_or_none()
    if not society:
        society = Society(id=uuid.uuid4(), name=payload.name.strip(), location=(payload.location or "").strip() or None, city=(payload.city or "").strip() or None)
        db.add(society)
        db.flush()
    else:
        society.name = payload.name.strip()  # type: ignore[assignment]
        if payload.location is not None:
            society.location = payload.location.strip() or None  # type: ignore[assignment]
        if payload.city is not None:
            society.city = payload.city.strip() or None  # type: ignore[assignment]
        db.flush()

    # Ensure current user has ACTIVE SOCIETY_ADMIN membership
    user_id = current.get("user_id")
    auth_id = current.get("auth_user_id")
    # Resolve user row (get_current_user already maps auth->user, but if no membership, user_id may still be present)
    # Ensure user exists
    user = None
    if user_id:
        try:
            user = db.execute(select(User).where(User.id == uuid.UUID(user_id))).scalar_one_or_none()
        except Exception:
            user = None
    if not user and auth_id:
        try:
            user = db.execute(select(User).where(User.auth_user_id == uuid.UUID(auth_id))).scalar_one_or_none()
        except Exception:
            user = None
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Create or activate membership
    membership = db.execute(
        select(SocietyMembership).where(SocietyMembership.user_id == user.id, SocietyMembership.society_id == society.id)
    ).scalar_one_or_none()
    if not membership:
        membership = SocietyMembership(id=uuid.uuid4(), user_id=user.id, society_id=society.id, status="ACTIVE")
        db.add(membership)
        db.flush()
    else:
        if membership.status != "ACTIVE":
            membership.status = "ACTIVE"  # type: ignore[assignment]

    # Ensure SOCIETY_ADMIN role
    role_row = db.execute(select(Role).where(Role.key == "SOCIETY_ADMIN")).scalar_one_or_none()
    if role_row:
        existing_role = db.execute(
            select(MembershipRole).where(MembershipRole.society_membership_id == membership.id, MembershipRole.role_id == role_row.id)
        ).scalar_one_or_none()
        if not existing_role:
            db.add(MembershipRole(society_membership_id=membership.id, role_id=role_row.id))

    # Upsert opening balance
    opening = db.execute(
        select(CashOpeningBalance).where(CashOpeningBalance.society_id == society.id, CashOpeningBalance.opening_date == od)
    ).scalar_one_or_none()
    if opening:
        opening.amount = payload.opening_amount  # type: ignore[assignment]
        opening.created_by = membership.id  # type: ignore[assignment]
    else:
        opening = CashOpeningBalance(society_id=society.id, opening_date=od, amount=payload.opening_amount, created_by=membership.id)
        db.add(opening)

    # Ensure default funds exist for new society
    from app.models import Fund

    for fund_name in ["Main Fund", "Sinking Fund"]:
        existing = db.execute(select(Fund).where(Fund.society_id == society.id, Fund.name == fund_name)).scalar_one_or_none()
        if not existing:
            db.add(Fund(id=uuid.uuid4(), society_id=society.id, name=fund_name, is_active=True))

    db.commit()
    db.refresh(society)
    db.refresh(opening)

    return {
        "society": {"id": str(society.id), "name": society.name, "location": society.location, "city": society.city},
        "opening_balance": {"opening_date": opening.opening_date.isoformat(), "amount": float(opening.amount)},
        "membership_id": str(membership.id),
    }
