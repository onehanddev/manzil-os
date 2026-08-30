"""Opening dues vertical slice – admin only."""

from fastapi import APIRouter, Depends

from app.auth.deps import require_admin

router = APIRouter(tags=["opening-dues"])


@router.post("/api/opening-dues")
def create_opening_due(payload: dict, current=Depends(require_admin)):
    return {"status": "opening due created"}
