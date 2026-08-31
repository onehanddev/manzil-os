"""Demo seed – idempotent fixture for Issue 7 (trimmed Phase 1).

Outcome: 1 society, 2 flat categories, ~8 flats with varied opening_due
(2000 owes, 0 clear, 500 owes), owner/tenant POCs (tenant-default +
owner-fallback), ~6 receipts across flats (including advance -500),
1 admin + 1 collector user, notifications logged via test provider.

Run:
    uv run python -m app.seed          # from backend/
    python -m app.seed                  # same
Idempotent: re-running does not duplicate flats/receipts – deterministic
UUIDs + ON CONFLICT / existence checks.
"""

from __future__ import annotations

import os
import uuid
from datetime import date

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import get_database_url
from app.db import SessionLocal, get_engine
from app.models import Flat, FlatCategory, FlatOccupant, OpeningDue, Person, Receipt, Role, Society, SocietyMembership, User, MembershipRole, Fund

# ---------------------------------------------------------------------------
# Deterministic IDs – stable across reruns for idempotency
# ---------------------------------------------------------------------------

SOCIETY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
CAT_1BHK_ID = uuid.UUID("00000000-0000-0000-0000-000000000101")
CAT_2BHK_ID = uuid.UUID("00000000-0000-0000-0000-000000000102")
FUND_MAIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000501")
ADMIN_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000201")
ADMIN_MEMBERSHIP_ID = uuid.UUID("00000000-0000-0000-0000-000000000301")
COLLECTOR_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000202")
COLLECTOR_MEMBERSHIP_ID = uuid.UUID("00000000-0000-0000-0000-000000000302")

# Flats DEMO-A101 .. DEMO-A108
DEMO_FLATS = [
    ("00000000-0000-0000-0000-000000001101", "DEMO-A101", "00000000-0000-0000-0000-000000000101", 2000),
    ("00000000-0000-0000-0000-000000001102", "DEMO-A102", "00000000-0000-0000-0000-000000000102", 0),
    ("00000000-0000-0000-0000-000000001103", "DEMO-A103", "00000000-0000-0000-0000-000000000101", 500),
    ("00000000-0000-0000-0000-000000001104", "DEMO-A104", "00000000-0000-0000-0000-000000000102", 2000),
    ("00000000-0000-0000-0000-000000001105", "DEMO-A105", "00000000-0000-0000-0000-000000000101", 1500),
    ("00000000-0000-0000-0000-000000001106", "DEMO-A106", "00000000-0000-0000-0000-000000000102", 500),
    ("00000000-0000-0000-0000-000000001107", "DEMO-A107", "00000000-0000-0000-0000-000000000101", 2000),
    ("00000000-0000-0000-0000-000000001108", "DEMO-A108", "00000000-0000-0000-0000-000000000102", 0),
]

# Persons: 8 owners + 4 tenants for tenant-default cases (A101, A102, A103, A105)
DEMO_PERSONS = [
    ("00000000-0000-0000-0000-000000002101", "Demo Owner A101", "+919000000201"),
    ("00000000-0000-0000-0000-000000002102", "Demo Tenant A101", "+919000000202"),
    ("00000000-0000-0000-0000-000000002103", "Demo Owner A102", "+919000000203"),
    ("00000000-0000-0000-0000-000000002104", "Demo Tenant A102", "+919000000204"),
    ("00000000-0000-0000-0000-000000002105", "Demo Owner A103", "+919000000205"),
    ("00000000-0000-0000-0000-000000002106", "Demo Tenant A103", "+919000000206"),
    ("00000000-0000-0000-0000-000000002107", "Demo Owner A104", "+919000000207"),
    ("00000000-0000-0000-0000-000000002108", "Demo Owner A105", "+919000000208"),
    ("00000000-0000-0000-0000-000000002109", "Demo Tenant A105", "+919000000209"),
    ("00000000-0000-0000-0000-000000002110", "Demo Owner A106", "+919000000210"),
    ("00000000-0000-0000-0000-000000002111", "Demo Owner A107", "+919000000211"),
    ("00000000-0000-0000-0000-000000002112", "Demo Owner A108", "+919000000212"),
]

# Occupants: (flat_uuid, person_uuid, role)
DEMO_OCCUPANTS = [
    ("00000000-0000-0000-0000-000000001101", "00000000-0000-0000-0000-000000002101", "OWNER"),
    ("00000000-0000-0000-0000-000000001101", "00000000-0000-0000-0000-000000002102", "TENANT"),
    ("00000000-0000-0000-0000-000000001102", "00000000-0000-0000-0000-000000002103", "OWNER"),
    ("00000000-0000-0000-0000-000000001102", "00000000-0000-0000-0000-000000002104", "TENANT"),
    ("00000000-0000-0000-0000-000000001103", "00000000-0000-0000-0000-000000002105", "OWNER"),
    ("00000000-0000-0000-0000-000000001103", "00000000-0000-0000-0000-000000002106", "TENANT"),
    ("00000000-0000-0000-0000-000000001104", "00000000-0000-0000-0000-000000002107", "OWNER"),
    ("00000000-0000-0000-0000-000000001105", "00000000-0000-0000-0000-000000002108", "OWNER"),
    ("00000000-0000-0000-0000-000000001105", "00000000-0000-0000-0000-000000002109", "TENANT"),
    ("00000000-0000-0000-0000-000000001106", "00000000-0000-0000-0000-000000002110", "OWNER"),
    ("00000000-0000-0000-0000-000000001107", "00000000-0000-0000-0000-000000002111", "OWNER"),
    ("00000000-0000-0000-0000-000000001108", "00000000-0000-0000-0000-000000002112", "OWNER"),
]

# Receipts: 6 rows with narration DEMO-SEED* to make test filtering easy
DEMO_RECEIPTS = [
    # A101 2000-500=1500
    ("00000000-0000-0000-0000-000000003101", "00000000-0000-0000-0000-000000001101", "00000000-0000-0000-0000-000000002101", 500, "2026-07-10", "REGULAR", "DEMO-SEED A101 payment"),
    # A102 0-500=-500 advance
    ("00000000-0000-0000-0000-000000003102", "00000000-0000-0000-0000-000000001102", "00000000-0000-0000-0000-000000002103", 500, "2026-07-11", "ADVANCE", "DEMO-SEED A102 advance -500"),
    # A103 500-500=0 clear
    ("00000000-0000-0000-0000-000000003103", "00000000-0000-0000-0000-000000001103", "00000000-0000-0000-0000-000000002105", 500, "2026-07-12", "REGULAR", "DEMO-SEED A103 clear 0"),
    # A104 2000-2000=0 clear
    ("00000000-0000-0000-0000-000000003104", "00000000-0000-0000-0000-000000001104", "00000000-0000-0000-0000-000000002107", 2000, "2026-07-13", "REGULAR", "DEMO-SEED A104 clear"),
    # A105 1500-1000=500
    ("00000000-0000-0000-0000-000000003105", "00000000-0000-0000-0000-000000001105", "00000000-0000-0000-0000-000000002108", 1000, "2026-07-14", "PART", "DEMO-SEED A105 part"),
    # A107 2000-500=1500
    ("00000000-0000-0000-0000-000000003106", "00000000-0000-0000-0000-000000001107", "00000000-0000-0000-0000-000000002111", 500, "2026-07-15", "ARREARS", "DEMO-SEED A107 arrears"),
]


def _ensure_society(db: Session):
    soc = db.get(Society, SOCIETY_ID)
    if not soc:
        soc = Society(id=SOCIETY_ID, name="Manzil Pilot Society", location="Pilot Location", city="Pune")
        db.add(soc)
        db.flush()


def _ensure_categories(db: Session):
    for cat_id, name in [(CAT_1BHK_ID, "1 BHK"), (CAT_2BHK_ID, "2 BHK")]:
        cat = db.get(FlatCategory, cat_id)
        if not cat:
            # also check by (society_id, name) to avoid duplicate name if UUID mismatched
            existing = db.execute(select(FlatCategory).where(FlatCategory.society_id == SOCIETY_ID, FlatCategory.name == name)).scalar_one_or_none()
            if not existing:
                db.add(FlatCategory(id=cat_id, society_id=SOCIETY_ID, name=name, is_active=True))


def _ensure_funds(db: Session):
    for fid, name in [(FUND_MAIN_ID, "Main Fund"), (uuid.UUID("00000000-0000-0000-0000-000000000502"), "Sinking Fund")]:
        f = db.get(Fund, fid)
        if not f:
            existing = db.execute(select(Fund).where(Fund.society_id == SOCIETY_ID, Fund.name == name)).scalar_one_or_none()
            if not existing:
                db.add(Fund(id=fid, society_id=SOCIETY_ID, name=name, is_active=True))


def _ensure_users(db: Session):
    # admin – already seeded via alembic, ensure exists
    admin = db.get(User, ADMIN_USER_ID)
    if not admin:
        # may exist under different UUID but same mobile – upsert by mobile
        admin_by_mobile = db.execute(select(User).where(User.mobile == "+919000000000")).scalar_one_or_none()
        if not admin_by_mobile:
            db.add(User(id=ADMIN_USER_ID, mobile="+919000000000", display_name="Pilot Admin", auth_user_id=uuid.uuid4()))
            db.flush()
            if not db.execute(select(SocietyMembership).where(SocietyMembership.id == ADMIN_MEMBERSHIP_ID)).scalar_one_or_none():
                db.add(SocietyMembership(id=ADMIN_MEMBERSHIP_ID, user_id=ADMIN_USER_ID, society_id=SOCIETY_ID, status="ACTIVE"))
                db.flush()
                role = db.execute(select(Role).where(Role.key == "SOCIETY_ADMIN")).scalar_one_or_none()
                if role:
                    db.add(MembershipRole(society_membership_id=ADMIN_MEMBERSHIP_ID, role_id=role.id))
    else:
        mem = db.get(SocietyMembership, ADMIN_MEMBERSHIP_ID)
        if not mem:
            db.add(SocietyMembership(id=ADMIN_MEMBERSHIP_ID, user_id=ADMIN_USER_ID, society_id=SOCIETY_ID, status="ACTIVE"))
            db.flush()
            role = db.execute(select(Role).where(Role.key == "SOCIETY_ADMIN")).scalar_one_or_none()
            if role and not db.execute(select(MembershipRole).where(MembershipRole.society_membership_id == ADMIN_MEMBERSHIP_ID, MembershipRole.role_id == role.id)).scalar_one_or_none():
                db.add(MembershipRole(society_membership_id=ADMIN_MEMBERSHIP_ID, role_id=role.id))

    # collector demo user
    collector = db.get(User, COLLECTOR_USER_ID)
    if not collector:
        by_mobile = db.execute(select(User).where(User.mobile == "+919000000100")).scalar_one_or_none()
        if by_mobile:
            collector = by_mobile
        else:
            db.add(User(id=COLLECTOR_USER_ID, mobile="+919000000100", display_name="Collector Demo", auth_user_id=uuid.uuid4()))
            db.flush()
    coll_mem = db.get(SocietyMembership, COLLECTOR_MEMBERSHIP_ID)
    if not coll_mem:
        # check any active membership for collector user
        existing_mem = db.execute(select(SocietyMembership).where(SocietyMembership.user_id == COLLECTOR_USER_ID, SocietyMembership.society_id == SOCIETY_ID)).scalar_one_or_none()
        if not existing_mem:
            db.add(SocietyMembership(id=COLLECTOR_MEMBERSHIP_ID, user_id=COLLECTOR_USER_ID, society_id=SOCIETY_ID, status="ACTIVE"))
            db.flush()
            role = db.execute(select(Role).where(Role.key == "COLLECTOR")).scalar_one_or_none()
            if role:
                db.add(MembershipRole(society_membership_id=COLLECTOR_MEMBERSHIP_ID, role_id=role.id))
        else:
            # ensure role
            role = db.execute(select(Role).where(Role.key == "COLLECTOR")).scalar_one_or_none()
            if role and not db.execute(select(MembershipRole).where(MembershipRole.society_membership_id == existing_mem.id, MembershipRole.role_id == role.id)).scalar_one_or_none():
                db.add(MembershipRole(society_membership_id=existing_mem.id, role_id=role.id))


def _ensure_flats(db: Session):
    for fid_str, flat_number, cat_id_str, _opening in DEMO_FLATS:
        fid = uuid.UUID(fid_str)
        flat = db.get(Flat, fid)
        if not flat:
            # check by number to avoid duplicate
            existing = db.execute(select(Flat).where(Flat.society_id == SOCIETY_ID, Flat.flat_number == flat_number)).scalar_one_or_none()
            if not existing:
                db.add(Flat(id=fid, society_id=SOCIETY_ID, flat_number=flat_number, flat_category_id=uuid.UUID(cat_id_str), is_active=True))


def _ensure_persons(db: Session):
    for pid_str, name, mobile in DEMO_PERSONS:
        pid = uuid.UUID(pid_str)
        person = db.get(Person, pid)
        if not person:
            # check by name+mobile within society
            existing = db.execute(select(Person).where(Person.society_id == SOCIETY_ID, Person.name == name)).scalar_one_or_none()
            if not existing:
                db.add(Person(id=pid, society_id=SOCIETY_ID, name=name, mobile=mobile, is_active=True))


def _ensure_occupants(db: Session):
    for flat_str, person_str, role in DEMO_OCCUPANTS:
        flat_id = uuid.UUID(flat_str)
        person_id = uuid.UUID(person_str)
        existing = db.execute(select(FlatOccupant).where(FlatOccupant.flat_id == flat_id, FlatOccupant.person_id == person_id, FlatOccupant.role == role)).scalar_one_or_none()
        if not existing:
            # respect unique partial index – avoid duplicate active role
            active_exists = db.execute(select(FlatOccupant).where(FlatOccupant.flat_id == flat_id, FlatOccupant.role == role, FlatOccupant.is_active.is_(True))).scalar_one_or_none()
            if not active_exists:
                db.add(FlatOccupant(id=uuid.uuid4(), flat_id=flat_id, person_id=person_id, role=role, is_active=True))


def _ensure_opening_dues(db: Session):
    for fid_str, _flat_number, _cat, opening in DEMO_FLATS:
        fid = uuid.UUID(fid_str)
        od = db.get(OpeningDue, fid)
        if not od:
            # use upsert semantics – if exists, update amount to desired demo value
            existing = db.execute(select(OpeningDue).where(OpeningDue.flat_id == fid)).scalar_one_or_none()
            if existing:
                existing.amount = opening  # type: ignore[assignment]
            else:
                db.add(OpeningDue(flat_id=fid, amount=opening))
        else:
            # ensure amount matches expected (idempotent update if drift)
            if float(od.amount) != float(opening):
                od.amount = opening  # type: ignore[assignment]


def _ensure_receipts(db: Session):
    for rid_str, flat_str, payer_str, amount, biz_date_str, rtype, narration in DEMO_RECEIPTS:
        rid = uuid.UUID(rid_str)
        receipt = db.get(Receipt, rid)
        if receipt:
            continue
        # also avoid duplicate by narration within demo?
        existing = db.execute(select(Receipt).where(Receipt.narration == narration, Receipt.society_id == SOCIETY_ID)).scalar_one_or_none()
        if existing:
            continue
        flat_id = uuid.UUID(flat_str)
        payer_id = uuid.UUID(payer_str)
        biz_date = date.fromisoformat(biz_date_str)
        # payer must be valid person in society – already ensured
        # fund Main Fund, collected_by admin membership
        db.add(
            Receipt(
                id=rid,
                society_id=SOCIETY_ID,
                flat_id=flat_id,
                payer_person_id=payer_id,
                fund_id=FUND_MAIN_ID,
                amount=amount,
                business_date=biz_date,
                type=rtype,
                narration=narration,
                payment_method="CASH",
                collected_by=ADMIN_MEMBERSHIP_ID,
                status="POSTED",
            )
        )


def _ensure_notifications_for_demo(db: Session):
    """Ensure test provider LOGGED rows for demo receipts (provider_mode=test)."""
    from app.models import Notification

    # provider_mode from env – default test
    provider_mode = os.environ.get("PROVIDER_MODE", "test").strip().lower()
    if provider_mode not in ("test", "live"):
        provider_mode = "test"
    for rid_str, _flat, _payer, amount, biz_str, _type, narration in DEMO_RECEIPTS:
        rid = uuid.UUID(rid_str)
        receipt = db.get(Receipt, rid)
        if not receipt:
            continue
        existing = db.execute(select(Notification).where(Notification.receipt_id == rid)).scalar_one_or_none()
        if existing:
            continue
        flat_id = receipt.flat_id
        payer = receipt.payer_person_id
        db.add(
            Notification(
                id=uuid.uuid4(),
                society_id=SOCIETY_ID,
                receipt_id=rid,
                payer_person_id=payer,
                flat_id=flat_id,
                channel="WHATSAPP",
                provider_mode=provider_mode,
                status="LOGGED",
                message=f"[test] receipt {rid} flat {flat_id} amount {amount} narration={narration}",
                business_date=date.fromisoformat(biz_str),
            )
        )


def run() -> dict:
    """Run the idempotent seed – returns summary counts."""
    db: Session = SessionLocal()
    try:
        # ensure extensions/roles exist before inserts
        _ensure_society(db)
        _ensure_categories(db)
        _ensure_funds(db)
        db.flush()
        _ensure_users(db)
        db.flush()
        _ensure_flats(db)
        db.flush()
        _ensure_persons(db)
        db.flush()
        _ensure_occupants(db)
        db.flush()
        _ensure_opening_dues(db)
        db.flush()
        _ensure_receipts(db)
        db.flush()
        _ensure_notifications_for_demo(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        # counts for observability
        try:
            flats_c = db.execute(text("SELECT count(*) FROM flats WHERE flat_number LIKE 'DEMO-%'")).scalar_one()
            receipts_c = db.execute(text("SELECT count(*) FROM receipts WHERE narration LIKE 'DEMO-SEED%'")).scalar_one()
        except Exception:
            flats_c = receipts_c = -1
        db.close()
    return {"flats": int(flats_c) if isinstance(flats_c, int) else flats_c, "receipts": int(receipts_c) if isinstance(receipts_c, int) else receipts_c}


# Alias for compatibility with test that looks for seed/ main
seed = run
main = run

if __name__ == "__main__":
    summary = run()
    print(f"Seed complete: {summary}")
