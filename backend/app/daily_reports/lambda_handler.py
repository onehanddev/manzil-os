"""EventBridge Scheduler entrypoint for the 21:00 Asia/Kolkata daily report."""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.daily_reports.scheduler import run_daily_cashbook
from app.db import SessionLocal


def handler(event, context):
    """Run by EventBridge cron `30 3 * * ? *` (21:00 IST)."""
    db = SessionLocal()
    try:
        return run_daily_cashbook(db, business_date=datetime.now(ZoneInfo("Asia/Kolkata")).date())
    finally:
        db.close()
