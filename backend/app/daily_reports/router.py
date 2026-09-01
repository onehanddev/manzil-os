"""HTTP seams for daily reports."""

import secrets
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_active, require_admin
from app.config import get_job_secret
from app.daily_reports.push import vapid_public_key
from app.daily_reports.scheduler import run_daily_cashbook
from app.db import get_db
from app.models import PushSubscription

router = APIRouter(tags=["daily reports"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: PushKeys


class UnsubscribeRequest(BaseModel):
    endpoint: str


def _require_job_secret(x_job_secret: str | None = Header(default=None, alias="X-Job-Secret")) -> None:
    expected = get_job_secret()
    if not expected or x_job_secret is None or not secrets.compare_digest(x_job_secret, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid job secret")


@router.get("/api/push/vapid_public_key")
def get_vapid_public_key(current=Depends(require_active)):
    return {"public_key": vapid_public_key()}


@router.post("/api/push/subscribe", status_code=status.HTTP_201_CREATED)
def subscribe(payload: SubscribeRequest, db: Session = Depends(get_db), current=Depends(require_admin)):
    subscription = db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == current["user_id"],
            PushSubscription.endpoint == payload.endpoint,
        )
    ).scalar_one_or_none()
    if subscription is None:
        subscription = PushSubscription(
            user_id=current["user_id"],
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
        )
        db.add(subscription)
    else:
        subscription.p256dh = payload.keys.p256dh
        subscription.auth = payload.keys.auth
    db.commit()
    return {"id": str(subscription.id), "endpoint": subscription.endpoint}


@router.delete("/api/push/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(payload: UnsubscribeRequest, db: Session = Depends(get_db), current=Depends(require_admin)):
    subscription = db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == current["user_id"],
            PushSubscription.endpoint == payload.endpoint,
        )
    ).scalar_one_or_none()
    if subscription is not None:
        db.delete(subscription)
        db.commit()


@router.post("/internal/jobs/daily-cashbook", dependencies=[Depends(_require_job_secret)])
def run_daily_cashbook_job(db: Session = Depends(get_db)):
    business_date = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    return run_daily_cashbook(db, business_date=business_date)
