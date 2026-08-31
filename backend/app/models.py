"""SQLAlchemy ORM models – single source of truth for all vertical slices.

Each class maps 1:1 to the tables created by
``alembic/versions/be8fc2f64365_initial_trimmed_schema.py`` and subsequent
migrations.  All tables are reachable via :data:`Base.metadata` so that
``alembic --autogenerate`` and ``alembic/env.py`` can import a single
``target_metadata`` without circular imports.

Conventions
-----------
* ``Base`` is the shared :class:`DeclarativeBase`.
* PKs are ``UUID(as_uuid=True)`` so Python ``uuid.UUID`` round-trips.
* Timestamps are ``TIMESTAMPTZ`` via ``DateTime(timezone=True)`` with
  ``server_default=text("now()")`` matching the DDL defaults.
* Constraints that exist in DDL are mirrored as ``__table_args__`` so ORM
  inserts respect the same invariants (unique, check, FK, partial index).
* Relationships are declared where they aid ``joinedload``; the routers
  do not depend on lazy loading falling back to N+1 queries.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Core identity
# ---------------------------------------------------------------------------


class Society(Base):
    __tablename__ = "societies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    flat_categories: Mapped[list[FlatCategory]] = relationship(back_populates="society")
    flats: Mapped[list[Flat]] = relationship(back_populates="society", overlaps="flat_category,flats")
    persons: Mapped[list[Person]] = relationship(back_populates="society")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str | None] = mapped_column(Text, unique=True)
    auth_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), unique=True)
    mobile: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(Text)

    memberships: Mapped[list[SocietyMembership]] = relationship(back_populates="user")


class SocietyMembership(Base):
    __tablename__ = "society_memberships"
    __table_args__ = (
        CheckConstraint("status IN ('ACTIVE', 'ENDED', 'SUSPENDED', 'PENDING')", name="society_memberships_status_check"),
        CheckConstraint("ended_at IS NULL OR ended_at >= joined_at", name="society_memberships_ended_at_check"),
        Index("society_memberships_by_society_user", "society_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    society_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("societies.id"), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, server_default=text("'ACTIVE'"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    user: Mapped[User] = relationship(back_populates="memberships")
    society: Mapped[Society] = relationship()
    membership_roles: Mapped[list[MembershipRole]] = relationship(back_populates="membership", cascade="all, delete-orphan")


class MembershipRole(Base):
    __tablename__ = "membership_roles"
    __table_args__ = (UniqueConstraint("society_membership_id", "role_id", name="membership_roles_society_membership_id_role_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    society_membership_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("society_memberships.id"), nullable=False
    )
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)

    membership: Mapped[SocietyMembership] = relationship(back_populates="membership_roles")
    role: Mapped[Role] = relationship()


# ---------------------------------------------------------------------------
# Master data
# ---------------------------------------------------------------------------


class FlatCategory(Base):
    __tablename__ = "flat_categories"
    __table_args__ = (
        CheckConstraint("size_sq_ft IS NULL OR size_sq_ft > 0", name="flat_categories_size_sq_ft_check"),
        CheckConstraint(
            "maintenance_amount IS NULL OR maintenance_amount >= 0",
            name="flat_categories_maintenance_amount_check",
        ),
        UniqueConstraint("society_id", "name", name="flat_categories_society_id_name_key"),
        UniqueConstraint("society_id", "id", name="flat_categories_society_id_id_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    society_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("societies.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    size_sq_ft: Mapped[float | None] = mapped_column(Numeric(10, 2))
    maintenance_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("TRUE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    society: Mapped[Society] = relationship(back_populates="flat_categories")
    flats: Mapped[list[Flat]] = relationship(back_populates="flat_category", overlaps="flats,society")


class Flat(Base):
    __tablename__ = "flats"
    __table_args__ = (
        UniqueConstraint("society_id", "flat_number", name="flats_society_id_flat_number_key"),
        UniqueConstraint("society_id", "id", name="flats_society_id_id_key"),
        ForeignKeyConstraint(
            ["society_id", "flat_category_id"],
            ["flat_categories.society_id", "flat_categories.id"],
            name="flats_society_id_flat_category_id_fkey",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    society_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("societies.id"), nullable=False)
    flat_number: Mapped[str] = mapped_column(Text, nullable=False)
    flat_category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("TRUE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    society: Mapped[Society] = relationship(back_populates="flats", overlaps="flat_category,flats")
    flat_category: Mapped[FlatCategory] = relationship(back_populates="flats", overlaps="flats,society")
    occupants: Mapped[list[FlatOccupant]] = relationship(back_populates="flat", cascade="all, delete-orphan")
    opening_due: Mapped[OpeningDue | None] = relationship(back_populates="flat", uselist=False)


class Person(Base):
    __tablename__ = "persons"
    __table_args__ = (UniqueConstraint("society_id", "id", name="persons_society_id_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    society_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("societies.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    mobile: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str | None] = mapped_column(Text)
    alt_mobile: Mapped[str | None] = mapped_column(Text)
    alt_mobile_normalized: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("TRUE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    society: Mapped[Society] = relationship(back_populates="persons")


class FlatOccupant(Base):
    __tablename__ = "flat_occupants"
    __table_args__ = (
        CheckConstraint("role IN ('OWNER', 'TENANT')", name="flat_occupants_role_check"),
        CheckConstraint(
            "effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from",
            name="flat_occupants_effective_check",
        ),
        UniqueConstraint("flat_id", "person_id", "role", name="flat_occupants_flat_id_person_id_role_key"),
        Index("one_active_occupant_per_flat_role", "flat_id", "role", unique=True, postgresql_where=text("is_active")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flat_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("flats.id", ondelete="CASCADE"), nullable=False
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("persons.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("TRUE"), nullable=False)
    effective_from: Mapped[date | None] = mapped_column(Date)
    effective_until: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    flat: Mapped[Flat] = relationship(back_populates="occupants")
    person: Mapped[Person] = relationship()


# ---------------------------------------------------------------------------
# Cashbook
# ---------------------------------------------------------------------------


class OpeningDue(Base):
    __tablename__ = "opening_dues"
    __table_args__ = (CheckConstraint("amount >= 0", name="opening_dues_amount_check"),)

    flat_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("flats.id", ondelete="CASCADE"), primary_key=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    flat: Mapped[Flat] = relationship(back_populates="opening_due")


class Receipt(Base):
    __tablename__ = "receipts"
    __table_args__ = (
        CheckConstraint("amount > 0", name="receipts_amount_check"),
        CheckConstraint("type IN ('REGULAR', 'ARREARS', 'PART', 'ADVANCE')", name="receipts_type_check"),
        CheckConstraint("status IN ('POSTED', 'VOIDED')", name="receipts_status_check"),
        CheckConstraint("payment_method = 'CASH'", name="receipts_payment_method_check"),
        ForeignKeyConstraint(
            ["society_id", "flat_id"],
            ["flats.society_id", "flats.id"],
            name="receipts_society_id_flat_id_fkey",
        ),
        Index("receipts_by_flat_business_date", "flat_id", "business_date"),
        Index("receipts_by_society_business_date", "society_id", "business_date"),
        Index("receipts_by_fund", "fund_id"),
        Index("receipts_by_status", "status"),
        Index("receipts_by_society_status", "society_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    society_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("societies.id"), nullable=False)
    flat_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    payer_person_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("persons.id"))
    fund_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("funds.id"))
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    business_date: Mapped[date] = mapped_column(Date, nullable=False)
    type: Mapped[str] = mapped_column(Text, server_default=text("'REGULAR'"), nullable=False)
    narration: Mapped[str | None] = mapped_column(Text)
    payment_method: Mapped[str] = mapped_column(Text, server_default=text("'CASH'"), nullable=False)
    collected_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("society_memberships.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    # Direct submit – no draft state; undo is via void with audit history
    status: Mapped[str] = mapped_column(Text, server_default=text("'POSTED'"), nullable=False)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("society_memberships.id"))
    void_reason: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)


class Fund(Base):
    __tablename__ = "funds"
    __table_args__ = (
        UniqueConstraint("society_id", "name", name="funds_society_id_name_key"),
        UniqueConstraint("society_id", "id", name="funds_society_id_id_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    society_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("societies.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("TRUE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    society: Mapped[Society] = relationship()


class Vendor(Base):
    __tablename__ = "vendors"
    __table_args__ = (
        UniqueConstraint("society_id", "name", name="vendors_society_id_name_key"),
        UniqueConstraint("society_id", "id", name="vendors_society_id_id_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    society_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("societies.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    contact_info: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("TRUE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    society: Mapped[Society] = relationship()


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"
    __table_args__ = (
        UniqueConstraint("society_id", "name", name="expense_categories_society_id_name_key"),
        UniqueConstraint("society_id", "id", name="expense_categories_society_id_id_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    society_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("societies.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("TRUE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    society: Mapped[Society] = relationship()


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount > 0", name="expenses_amount_check"),
        Index("expenses_by_society_business_date", "society_id", "business_date"),
        Index("expenses_by_fund", "fund_id"),
        Index("expenses_by_category", "category_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    society_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("societies.id"), nullable=False)
    business_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    fund_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("funds.id"))
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("expense_categories.id"), nullable=False)
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id"))
    narration: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("society_memberships.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)


class CashOpeningBalance(Base):
    __tablename__ = "cash_opening_balances"
    __table_args__ = (CheckConstraint("amount >= 0", name="cash_opening_balances_amount_check"),)

    society_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("societies.id"), primary_key=True)
    opening_date: Mapped[date] = mapped_column(Date, primary_key=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("society_memberships.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint("provider_mode IN ('test', 'live')", name="notifications_provider_mode_check"),
        CheckConstraint("status IN ('LOGGED', 'SENT', 'FAILED')", name="notifications_status_check"),
        Index("notifications_by_society", "society_id"),
        Index("notifications_by_receipt", "receipt_id"),
        Index("notifications_by_society_date", "society_id", "business_date"),
        Index("notifications_by_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    society_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("societies.id"), nullable=False)
    receipt_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("receipts.id", ondelete="SET NULL"))
    payer_person_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("persons.id", ondelete="SET NULL"))
    flat_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("flats.id", ondelete="SET NULL"))
    channel: Mapped[str] = mapped_column(Text, server_default=text("'WHATSAPP'"), nullable=False)
    provider_mode: Mapped[str] = mapped_column(Text, server_default=text("'test'"), nullable=False)
    status: Mapped[str] = mapped_column(Text, server_default=text("'LOGGED'"), nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    business_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)


__all__ = [
    "Base",
    "CashOpeningBalance",
    "Expense",
    "ExpenseCategory",
    "Flat",
    "FlatCategory",
    "FlatOccupant",
    "Fund",
    "MembershipRole",
    "Notification",
    "OpeningDue",
    "Person",
    "Receipt",
    "Role",
    "Society",
    "SocietyMembership",
    "User",
    "Vendor",
]
