"""Notifications vertical slice – in-app center for receipt notifications."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_active
from app.db import get_db
from app.models import Notification

router = APIRouter(tags=["notifications"])


@router.get("/api/notifications")
def list_notifications(db: Session = Depends(get_db), current=Depends(require_active)):
    sid = current.get("society_id")
    if not sid:
        raise HTTPException(status_code=400, detail="No society linked")
    society_id = uuid.UUID(sid)
    rows = db.execute(select(Notification).where(Notification.society_id == society_id).order_by(Notification.created_at.desc())).scalars().all()
    return {
        "notifications": [
            {
                "id": str(n.id),
                "society_id": str(n.society_id),
                "receipt_id": str(n.receipt_id) if n.receipt_id else None,
                "payer_person_id": str(n.payer_person_id) if n.payer_person_id else None,
                "flat_id": str(n.flat_id) if n.flat_id else None,
                "channel": n.channel,
                "provider_mode": n.provider_mode,
                "status": n.status,
                "message": n.message,
                "business_date": n.business_date.isoformat() if n.business_date else None,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in rows
        ]
    }
