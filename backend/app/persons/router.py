"""Persons (POC/contacts) vertical slice – admin only."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.auth.security import normalize_mobile
from app.db import get_db
from app.models import Person

router = APIRouter(tags=["persons"])


class CreatePersonRequest(BaseModel):
    name: str
    mobile: str
    alt_mobile: str | None = None
    email: str | None = None


def _serialize(person: Person) -> dict:
    return {
        "id": str(person.id),
        "society_id": str(person.society_id),
        "name": person.name,
        "mobile": person.mobile,
        "email": person.email,
        "alt_mobile": person.alt_mobile,
    }


@router.post("/api/persons", status_code=status.HTTP_201_CREATED)
def create_person(payload: CreatePersonRequest, db: Session = Depends(get_db), current=Depends(require_admin)):
    society_id = current["society_id"]
    if not society_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No society linked")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name required")
    mobile = normalize_mobile(payload.mobile.strip())
    if not mobile or mobile == "+":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mobile required")
    alt_mobile = None
    if payload.alt_mobile:
        alt_mobile = normalize_mobile(payload.alt_mobile.strip())
    person = Person(
        id=uuid.uuid4(),
        society_id=uuid.UUID(society_id),
        name=name,
        mobile=mobile,
        alt_mobile=alt_mobile,
        email=payload.email,
    )
    db.add(person)
    try:
        db.commit()
        db.refresh(person)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create person") from e
    data = _serialize(person)
    data["person"] = {"id": data["id"], "name": data["name"], "mobile": data["mobile"]}
    return data


@router.get("/api/persons")
def list_persons(db: Session = Depends(get_db), current=Depends(require_admin)):
    society_id = uuid.UUID(current["society_id"])
    rows = db.execute(select(Person).where(Person.society_id == society_id).order_by(Person.name)).scalars().all()
    persons = [_serialize(r) for r in rows]
    return {"persons": persons}
