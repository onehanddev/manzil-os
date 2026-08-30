"""Expense categories vertical slice – admin only."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.db import get_db
from app.models import ExpenseCategory

router = APIRouter(tags=["expense-categories"])


class CreateCategoryRequest(BaseModel):
    name: str

    model_config = {"extra": "forbid"}


def _serialize(c: ExpenseCategory) -> dict:
    return {
        "id": str(c.id),
        "society_id": str(c.society_id),
        "name": c.name,
        "is_active": c.is_active,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@router.post("/api/expense-categories", status_code=status.HTTP_201_CREATED)
def create_expense_category(
    payload: CreateCategoryRequest, db: Session = Depends(get_db), current=Depends(require_admin)
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name required")
    society_id = current["society_id"]
    if not society_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No society linked")
    cat = ExpenseCategory(id=uuid.uuid4(), society_id=uuid.UUID(society_id), name=name, is_active=True)
    db.add(cat)
    try:
        db.commit()
        db.refresh(cat)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Expense category name already exists") from e
    return _serialize(cat)


@router.get("/api/expense-categories")
def list_expense_categories(db: Session = Depends(get_db), current=Depends(require_admin)):
    society_id = uuid.UUID(current["society_id"])
    rows = (
        db.execute(select(ExpenseCategory).where(ExpenseCategory.society_id == society_id).order_by(ExpenseCategory.name))
        .scalars()
        .all()
    )
    categories = [_serialize(r) for r in rows]
    return {"categories": categories, "expense_categories": categories}
