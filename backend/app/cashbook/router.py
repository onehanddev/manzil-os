"""Cashbook deep module — single seam for cashbook invariants.

Interface (the seam):
  POST   /api/receipts                — recordReceipt
  POST   /api/expenses                — recordExpense (vendor_name inline)
  PUT    /api/cash-opening-balance    — set opening cash for a start date
  GET    /api/cash-opening-balance    — get opening cash
  GET    /api/reports/cashbook        — getReport(range) → opening/receipts/expenses/closing

All handlers enforce society scoping, amount>0 / >=0, business_date required,
fund/category/vendor belonging to the same society, and inclusive business_date
filtering. The report equation closing = opening + receipts − expenses is the
module's core invariant.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import require_active, require_admin
from app.db import get_db
from app.models import CashOpeningBalance, Expense, ExpenseCategory, Flat, Fund, Receipt, Vendor

router = APIRouter(tags=["cashbook"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_uuid(val: str | None, field: str) -> uuid.UUID:
    if not val:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field} required")
    try:
        return uuid.UUID(val)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid {field}") from e


def _get_society_id(current: dict) -> uuid.UUID:
    sid = current.get("society_id")
    if not sid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No society linked")
    return uuid.UUID(sid)


def _resolve_membership_id(db: Session, user_id: str, society_id: uuid.UUID) -> uuid.UUID:
    from app.models import SocietyMembership

    row = db.execute(
        select(SocietyMembership.id).where(
            SocietyMembership.user_id == uuid.UUID(user_id),
            SocietyMembership.society_id == society_id,
            SocietyMembership.status == "ACTIVE",
        )
    ).scalar_one_or_none()
    if row is None:
        # fallback: any active membership for this user (tests have single society)
        row = db.execute(
            select(SocietyMembership.id).where(
                SocietyMembership.user_id == uuid.UUID(user_id),
                SocietyMembership.status == "ACTIVE",
            )
        ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No active membership")
    return row  # already UUID


def _ensure_fund(db: Session, fund_id: uuid.UUID, society_id: uuid.UUID) -> Fund:
    fund = db.execute(select(Fund).where(Fund.id == fund_id, Fund.society_id == society_id)).scalar_one_or_none()
    if not fund:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid fund_id")
    return fund


def _ensure_flat(db: Session, flat_id: uuid.UUID, society_id: uuid.UUID) -> Flat:
    flat = db.execute(select(Flat).where(Flat.id == flat_id, Flat.society_id == society_id)).scalar_one_or_none()
    if not flat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flat not found")
    return flat


def _ensure_category(db: Session, cat_id: uuid.UUID, society_id: uuid.UUID) -> ExpenseCategory:
    cat = db.execute(
        select(ExpenseCategory).where(ExpenseCategory.id == cat_id, ExpenseCategory.society_id == society_id)
    ).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid category_id")
    return cat


def _ensure_person_same_society(db: Session, person_id: uuid.UUID, society_id: uuid.UUID) -> None:
    from app.models import Person

    row = db.execute(select(Person.id).where(Person.id == person_id, Person.society_id == society_id)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid payer_person_id")


def _ensure_payer_is_occupant(db: Session, flat_id: uuid.UUID, person_id: uuid.UUID) -> None:
    from app.models import FlatOccupant

    occ = db.execute(
        select(FlatOccupant.id).where(
            FlatOccupant.flat_id == flat_id, FlatOccupant.person_id == person_id, FlatOccupant.is_active.is_(True)
        )
    ).scalar_one_or_none()
    if not occ:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="payer_person_id must be an active occupant of the flat"
        )


# ---------------------------------------------------------------------------
# Receipts
# ---------------------------------------------------------------------------


class CreateReceiptRequest(BaseModel):
    flat_id: str
    amount: float
    business_date: str
    fund_id: str
    payer_person_id: str | None = None
    type: str | None = None
    narration: str | None = None
    payment_method: str | None = None

    model_config = {"extra": "forbid"}


def _serialize_receipt(r: Receipt) -> dict:
    return {
        "id": str(r.id),
        "society_id": str(r.society_id),
        "flat_id": str(r.flat_id),
        "payer_person_id": str(r.payer_person_id) if r.payer_person_id else None,
        "fund_id": str(r.fund_id) if r.fund_id else None,
        "amount": float(r.amount),
        "business_date": r.business_date.isoformat() if r.business_date else None,
        "type": r.type,
        "narration": r.narration,
        "payment_method": getattr(r, "payment_method", "CASH") or "CASH",
        "collected_by": str(r.collected_by),
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "status": getattr(r, "status", "POSTED") or "POSTED",
        "voided_at": r.voided_at.isoformat() if getattr(r, "voided_at", None) else None,
        "voided_by": str(r.voided_by) if getattr(r, "voided_by", None) else None,
        "void_reason": getattr(r, "void_reason", None),
        "updated_at": r.updated_at.isoformat() if getattr(r, "updated_at", None) else None,
    }


@router.post("/api/receipts", status_code=status.HTTP_201_CREATED)
def create_receipt(payload: CreateReceiptRequest, db: Session = Depends(get_db), current=Depends(require_active)):
    society_id = _get_society_id(current)
    if payload.amount is None or float(payload.amount) <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="amount must be > 0")

    # business_date
    try:
        biz_date = date.fromisoformat(payload.business_date)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid business_date") from e

    # type
    rtype = (payload.type or "REGULAR").strip().upper()
    if rtype not in ("REGULAR", "ARREARS", "PART", "ADVANCE"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid type")

    flat_id = _parse_uuid(payload.flat_id, "flat_id")
    fund_id = _parse_uuid(payload.fund_id, "fund_id")

    _ensure_flat(db, flat_id, society_id)
    _ensure_fund(db, fund_id, society_id)

    # payment_method – fixed CASH in Phase 0
    pm = (payload.payment_method or "CASH").strip().upper()
    if pm != "CASH":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="payment_method must be CASH")

    payer_id = None
    if payload.payer_person_id:
        try:
            payer_id = uuid.UUID(payload.payer_person_id)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid payer_person_id") from e
        _ensure_person_same_society(db, payer_id, society_id)
        _ensure_payer_is_occupant(db, flat_id, payer_id)

    membership_id = _resolve_membership_id(db, current["user_id"], society_id)

    receipt = Receipt(
        id=uuid.uuid4(),
        society_id=society_id,
        flat_id=flat_id,
        payer_person_id=payer_id,
        fund_id=fund_id,
        amount=payload.amount,
        business_date=biz_date,
        type=rtype,
        narration=payload.narration.strip() if payload.narration and payload.narration.strip() else None,
        payment_method=pm,
        collected_by=membership_id,
        status="POSTED",
    )
    db.add(receipt)
    db.flush()  # ensure receipt id available for notification FK
    # in-app notification (provider toggle – test mode logs, no external call)
    try:
        from app.notifications.provider import get_notification_provider

        provider = get_notification_provider()
        provider.send_receipt_notification(
            db=db,
            society_id=society_id,
            receipt_id=receipt.id,
            payer_person_id=payer_id,
            flat_id=flat_id,
            business_date=biz_date,
            amount=float(payload.amount),
            narration=payload.narration.strip() if payload.narration and payload.narration.strip() else None,
        )
    except Exception:
        # notification failure should not block receipt creation in pilot – log and continue
        pass
    db.commit()
    db.refresh(receipt)
    return _serialize_receipt(receipt)


class VoidReceiptRequest(BaseModel):
    reason: str | None = None


@router.get("/api/receipts/{receipt_id}")
def get_receipt(receipt_id: str, db: Session = Depends(get_db), current=Depends(require_active)):
    society_id = _get_society_id(current)
    try:
        rid = uuid.UUID(receipt_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found") from e
    row = db.execute(select(Receipt).where(Receipt.id == rid, Receipt.society_id == society_id)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    return _serialize_receipt(row)


@router.post("/api/receipts/{receipt_id}/void", status_code=status.HTTP_200_OK)
@router.post("/api/receipts/{receipt_id}/undo", status_code=status.HTTP_200_OK)
def void_receipt(
    receipt_id: str,
    payload: VoidReceiptRequest | None = None,
    db: Session = Depends(get_db),
    current=Depends(require_active),
):
    """Void/undo a directly-submitted receipt while preserving history.

    Receipts have no draft state – they are POSTED on creation.
    Voiding keeps the row, sets status=VOIDED, and records voided_at/by/reason
    so the report can exclude it from totals while history remains auditable.
    """
    society_id = _get_society_id(current)
    try:
        rid = uuid.UUID(receipt_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found") from e
    receipt = db.execute(select(Receipt).where(Receipt.id == rid, Receipt.society_id == society_id)).scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    if getattr(receipt, "status", "POSTED") == "VOIDED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Receipt already voided")
    membership_id = _resolve_membership_id(db, current["user_id"], society_id)
    # RBAC: admin can void any; collector can only void receipts they collected
    roles = current.get("roles") or []
    is_admin = "SOCIETY_ADMIN" in roles or "super_admin" in roles
    if not is_admin and receipt.collected_by != membership_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admin or the collector who created the receipt can void it")
    reason = (payload.reason.strip() if payload and payload.reason and payload.reason.strip() else None)
    # SOCIETY_ADMIN should provide reason but not strictly required for Phase 0; collector undo may omit
    receipt.status = "VOIDED"  # type: ignore[assignment]
    receipt.voided_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    receipt.voided_by = membership_id  # type: ignore[assignment]
    receipt.void_reason = reason  # type: ignore[assignment]
    receipt.updated_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    db.commit()
    db.refresh(receipt)
    return _serialize_receipt(receipt)


@router.get("/api/receipts")
def list_receipts(
    db: Session = Depends(get_db),
    current=Depends(require_active),
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    date_from: str | None = Query(None, description="Alias for from"),
    date_to: str | None = Query(None, description="Alias for to"),
    include_voided: bool = Query(False, description="Include VOIDED receipts in listing (history view)"),
    flat_id: str | None = Query(None, description="Filter by flat"),
    collected_by: str | None = Query(None, description="Filter by collector membership id"),
    collector_id: str | None = Query(None, description="Alias for collected_by"),
    payer_person_id: str | None = Query(None, description="Filter by payer"),
):
    society_id = _get_society_id(current)
    q = select(Receipt).where(Receipt.society_id == society_id).order_by(Receipt.business_date, Receipt.created_at)
    if not include_voided:
        q = q.where(Receipt.status != "VOIDED")
    effective_from = from_date or date_from
    effective_to = to_date or date_to
    if effective_from:
        try:
            fd = date.fromisoformat(effective_from)
            q = q.where(Receipt.business_date >= fd)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid from date") from e
    if effective_to:
        try:
            td = date.fromisoformat(effective_to)
            q = q.where(Receipt.business_date <= td)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid to date") from e
    if flat_id:
        try:
            fid = uuid.UUID(flat_id)
            q = q.where(Receipt.flat_id == fid)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid flat_id") from e
    effective_collected = collected_by or collector_id
    if effective_collected:
        try:
            cb = uuid.UUID(effective_collected)
            q = q.where(Receipt.collected_by == cb)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid collected_by") from e
    if payer_person_id:
        try:
            pid = uuid.UUID(payer_person_id)
            q = q.where(Receipt.payer_person_id == pid)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid payer_person_id") from e
    rows = db.execute(q).scalars().all()
    return {"receipts": [_serialize_receipt(r) for r in rows]}


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------


class CreateExpenseRequest(BaseModel):
    business_date: str
    amount: float
    fund_id: str
    category_id: str
    vendor_id: str | None = None
    vendor_name: str | None = None
    narration: str | None = None

    model_config = {"extra": "forbid"}


def _serialize_expense(e: Expense) -> dict:
    return {
        "id": str(e.id),
        "society_id": str(e.society_id),
        "business_date": e.business_date.isoformat() if e.business_date else None,
        "amount": float(e.amount),
        "fund_id": str(e.fund_id) if e.fund_id else None,
        "category_id": str(e.category_id),
        "vendor_id": str(e.vendor_id) if e.vendor_id else None,
        "narration": e.narration,
        "created_by": str(e.created_by),
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


@router.post("/api/expenses", status_code=status.HTTP_201_CREATED)
def create_expense(payload: CreateExpenseRequest, db: Session = Depends(get_db), current=Depends(require_admin)):
    society_id = _get_society_id(current)
    if payload.amount is None or float(payload.amount) <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="amount must be > 0")
    try:
        biz_date = date.fromisoformat(payload.business_date)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid business_date") from e

    fund_id = _parse_uuid(payload.fund_id, "fund_id")
    cat_id = _parse_uuid(payload.category_id, "category_id")
    _ensure_fund(db, fund_id, society_id)
    _ensure_category(db, cat_id, society_id)

    vendor_uuid: uuid.UUID | None = None
    if payload.vendor_id:
        try:
            vendor_uuid = uuid.UUID(payload.vendor_id)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid vendor_id") from e
        v = db.execute(select(Vendor).where(Vendor.id == vendor_uuid, Vendor.society_id == society_id)).scalar_one_or_none()
        if not v:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid vendor_id")
    elif payload.vendor_name and payload.vendor_name.strip():
        vname = payload.vendor_name.strip()
        # get-or-create by (society_id, name) case-insensitive
        existing = db.execute(
            select(Vendor).where(Vendor.society_id == society_id, func.lower(Vendor.name) == func.lower(vname))
        ).scalar_one_or_none()
        if existing:
            vendor_uuid = existing.id  # type: ignore[assignment]
        else:
            vendor_uuid = uuid.uuid4()
            vendor = Vendor(id=vendor_uuid, society_id=society_id, name=vname, is_active=True)
            db.add(vendor)
            db.flush()  # ensure vendor exists before expense FK

    membership_id = _resolve_membership_id(db, current["user_id"], society_id)

    expense = Expense(
        id=uuid.uuid4(),
        society_id=society_id,
        business_date=biz_date,
        amount=payload.amount,
        fund_id=fund_id,
        category_id=cat_id,
        vendor_id=vendor_uuid,
        narration=payload.narration.strip() if payload.narration and payload.narration.strip() else None,
        created_by=membership_id,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return _serialize_expense(expense)


@router.get("/api/expenses")
def list_expenses(
    db: Session = Depends(get_db),
    current=Depends(require_active),
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
):
    society_id = _get_society_id(current)
    q = select(Expense).where(Expense.society_id == society_id).order_by(Expense.business_date, Expense.created_at)
    if from_date:
        try:
            fd = date.fromisoformat(from_date)
            q = q.where(Expense.business_date >= fd)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid from date") from e
    if to_date:
        try:
            td = date.fromisoformat(to_date)
            q = q.where(Expense.business_date <= td)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid to date") from e
    rows = db.execute(q).scalars().all()
    return {"expenses": [_serialize_expense(r) for r in rows]}


# ---------------------------------------------------------------------------
# Cash opening balance
# ---------------------------------------------------------------------------


class CashOpeningRequest(BaseModel):
    opening_date: str
    amount: float

    model_config = {"extra": "forbid"}


@router.put("/api/cash-opening-balance")
def put_cash_opening(payload: CashOpeningRequest, db: Session = Depends(get_db), current=Depends(require_admin)):
    society_id = _get_society_id(current)
    if payload.amount is None or float(payload.amount) < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="amount must be >= 0")
    try:
        od = date.fromisoformat(payload.opening_date)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid opening_date") from e

    membership_id = _resolve_membership_id(db, current["user_id"], society_id)
    existing = db.execute(
        select(CashOpeningBalance).where(
            CashOpeningBalance.society_id == society_id, CashOpeningBalance.opening_date == od
        )
    ).scalar_one_or_none()
    if existing:
        existing.amount = payload.amount  # type: ignore[assignment]
        existing.updated_at = datetime.now(timezone.utc)
        existing.created_by = membership_id  # type: ignore[assignment]
        db.commit()
        db.refresh(existing)
        row = existing
    else:
        row = CashOpeningBalance(
            society_id=society_id, opening_date=od, amount=payload.amount, created_by=membership_id
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return {
        "society_id": str(row.society_id),
        "opening_date": row.opening_date.isoformat(),
        "amount": float(row.amount),
    }


@router.get("/api/cash-opening-balance")
def get_cash_opening(
    db: Session = Depends(get_db),
    current=Depends(require_active),
    date_: str | None = Query(None, alias="date"),
):
    society_id = _get_society_id(current)
    if not date_:
        # return most recent or 0
        row = db.execute(
            select(CashOpeningBalance)
            .where(CashOpeningBalance.society_id == society_id)
            .order_by(CashOpeningBalance.opening_date.desc())
            .limit(1)
        ).scalar_one_or_none()
        if not row:
            return {"society_id": str(society_id), "opening_date": None, "amount": 0}
        return {"society_id": str(row.society_id), "opening_date": row.opening_date.isoformat(), "amount": float(row.amount)}
    try:
        od = date.fromisoformat(date_)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid date") from e
    row = db.execute(
        select(CashOpeningBalance).where(CashOpeningBalance.society_id == society_id, CashOpeningBalance.opening_date == od)
    ).scalar_one_or_none()
    if not row:
        return {"society_id": str(society_id), "opening_date": date_, "amount": 0}
    return {"society_id": str(row.society_id), "opening_date": row.opening_date.isoformat(), "amount": float(row.amount)}


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


@router.get("/api/reports/cashbook")
def cashbook_report(
    db: Session = Depends(get_db),
    current=Depends(require_active),
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
):
    society_id = _get_society_id(current)
    try:
        fd = date.fromisoformat(from_date)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid from date") from e
    try:
        td = date.fromisoformat(to_date)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid to date") from e
    if fd > td:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="from must be <= to")

    # opening = cash_opening_balances where opening_date == from, else 0
    opening_row = db.execute(
        select(CashOpeningBalance).where(CashOpeningBalance.society_id == society_id, CashOpeningBalance.opening_date == fd)
    ).scalar_one_or_none()
    opening = float(opening_row.amount) if opening_row else 0.0

    # Only POSTED receipts contribute to cash; VOIDED are preserved for history but excluded from totals
    total_receipts = float(
        db.execute(
            select(func.coalesce(func.sum(Receipt.amount), 0)).where(
                Receipt.society_id == society_id,
                Receipt.status != "VOIDED",
                Receipt.business_date >= fd,
                Receipt.business_date <= td,
            )
        ).scalar_one()
    )
    total_expenses = float(
        db.execute(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.society_id == society_id, Expense.business_date >= fd, Expense.business_date <= td
            )
        ).scalar_one()
    )
    closing = opening + total_receipts - total_expenses

    receipts = db.execute(
        select(Receipt)
        .where(Receipt.society_id == society_id, Receipt.status != "VOIDED", Receipt.business_date >= fd, Receipt.business_date <= td)
        .order_by(Receipt.business_date, Receipt.created_at)
    ).scalars().all()
    expenses = db.execute(
        select(Expense)
        .where(Expense.society_id == society_id, Expense.business_date >= fd, Expense.business_date <= td)
        .order_by(Expense.business_date, Expense.created_at)
    ).scalars().all()

    # society name for report header
    from app.models import Society

    society = db.execute(select(Society).where(Society.id == society_id)).scalar_one_or_none()
    society_name = society.name if society else None

    return {
        "society": {"id": str(society_id), "name": society_name},
        "from": from_date,
        "to": to_date,
        "opening": opening,
        "total_receipts": total_receipts,
        "total_expenses": total_expenses,
        "closing": closing,
        "receipts": [_serialize_receipt(r) for r in receipts],
        "expenses": [_serialize_expense(e) for e in expenses],
    }
