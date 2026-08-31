"""Admin push-subscription HTTP seam for daily reports."""

from pydantic import BaseModel
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_active, require_admin
from app.daily_reports.push import vapid_public_key
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
