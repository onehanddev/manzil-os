"""Flats vertical slice – requires active membership."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import require_active, require_admin
from app.db import get_db

router = APIRouter(tags=["flats"])


@router.get("/api/flats")
def list_flats(current=Depends(require_active)):
    return {"flats": [], "user_roles": current["roles"]}


@router.post("/api/flats")
def create_flat(payload: dict, db: Session = Depends(get_db), current=Depends(require_admin)):
    return {"status": "created", "by": current["user_id"]}
