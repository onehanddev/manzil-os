"""Nightly IST cashbook snapshots, callable from Lambda or a local cron stub."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.daily_reports import push
from app.models import CashOpeningBalance, Expense, MembershipRole, Notification, PushSubscription, Receipt, ReportRun, Role, Society, SocietyMembership


def _message(business_date: date, receipts: float, receipt_count: int, expenses: float, closing: float) -> str:
    return (
        f"Daily Report {business_date.strftime('%d %b')} - Collected Rs. {receipts:,.0f} ({receipt_count} receipts), "
        f"Expenses Rs. {expenses:,.0f}, Closing Rs. {closing:,.0f} - tap to view"
    )


def run_daily_cashbook(db: Session, *, business_date: date) -> dict[str, int]:
    """Snapshot every society with activity and notify each society administrator."""
    processed = 0
    skipped = 0
    societies = db.execute(select(Society.id)).scalars().all()
    for society_id in societies:
        receipt_count = db.execute(
            select(func.count()).select_from(Receipt).where(
                Receipt.society_id == society_id,
                Receipt.business_date == business_date,
                Receipt.status != "VOIDED",
            )
        ).scalar_one()
        expense_count = db.execute(
            select(func.count()).select_from(Expense).where(
                Expense.society_id == society_id,
                Expense.business_date == business_date,
            )
        ).scalar_one()
        if receipt_count + expense_count == 0:
            skipped += 1
            continue

        opening = float(
            db.execute(
                select(func.coalesce(CashOpeningBalance.amount, 0)).where(
                    CashOpeningBalance.society_id == society_id,
                    CashOpeningBalance.opening_date == business_date,
                )
            ).scalar_one()
        )
        receipts = float(
            db.execute(
                select(func.coalesce(func.sum(Receipt.amount), 0)).where(
                    Receipt.society_id == society_id,
                    Receipt.business_date == business_date,
                    Receipt.status != "VOIDED",
                )
            ).scalar_one()
        )
        expenses = float(
            db.execute(
                select(func.coalesce(func.sum(Expense.amount), 0)).where(
                    Expense.society_id == society_id,
                    Expense.business_date == business_date,
                )
            ).scalar_one()
        )
        closing = opening + receipts - expenses
        run = db.execute(
            select(ReportRun).where(
                ReportRun.society_id == society_id,
                ReportRun.from_date == business_date,
                ReportRun.to_date == business_date,
            )
        ).scalar_one_or_none()
        if run is None:
            db.add(
                ReportRun(
                    society_id=society_id,
                    from_date=business_date,
                    to_date=business_date,
                    opening=opening,
                    total_receipts=receipts,
                    total_expenses=expenses,
                    closing=closing,
                    format="daily",
                )
            )
        else:
            run.opening = opening
            run.total_receipts = receipts
            run.total_expenses = expenses
            run.closing = closing
            run.generated_at = datetime.now(timezone.utc)
            run.format = "daily"

        message = _message(business_date, receipts, receipt_count, expenses, closing)
        admin_ids = db.execute(
            select(SocietyMembership.user_id)
            .join(MembershipRole, MembershipRole.society_membership_id == SocietyMembership.id)
            .join(Role, Role.id == MembershipRole.role_id)
            .where(
                SocietyMembership.society_id == society_id,
                SocietyMembership.status == "ACTIVE",
                Role.key == "SOCIETY_ADMIN",
            )
        ).scalars().all()
        for user_id in admin_ids:
            subscriptions = db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id)).scalars().all()
            delivered = any(
                push.send(
                    subscription,
                    {
                        "title": f"Daily Report {business_date.strftime('%d %b')}",
                        "body": message,
                        "click_action": "/reports?from=today&to=today",
                    },
                )
                for subscription in subscriptions
            )
            db.add(
                Notification(
                    id=uuid.uuid4(),
                    society_id=society_id,
                    user_id=user_id,
                    channel="PUSH",
                    provider_mode="live" if push.vapid_public_key() else "test",
                    status="SENT" if delivered else "LOGGED",
                    message=message,
                    business_date=business_date,
                )
            )
        processed += 1

    db.query(ReportRun).filter(ReportRun.generated_at < datetime.now(timezone.utc) - timedelta(days=90)).delete(synchronize_session=False)
    db.commit()
    return {"processed": processed, "skipped": skipped}
