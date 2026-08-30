"""Receipts vertical slice – requires active membership."""

from fastapi import APIRouter, Depends

from app.auth.deps import require_active

router = APIRouter(tags=["receipts"])


@router.post("/api/receipts")
def create_receipt(payload: dict, current=Depends(require_active)):
    return {"status": "receipt created", "by": current["user_id"], "roles": current["roles"]}
