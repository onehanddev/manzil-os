-- Manzil OS: Phase 1 PostgreSQL schema
-- IDs are UUIDs so records can be created safely by the application without
-- depending on a sequence. Run this file against an empty database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE,
    auth_user_id UUID UNIQUE,
    mobile TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- should mobile number be a integer
CREATE TABLE societies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location TEXT,
    city TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE society_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    society_id UUID NOT NULL REFERENCES societies(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'ENDED', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ended_at IS NULL OR ended_at >= joined_at)
);

CREATE INDEX society_memberships_by_society_user
    ON society_memberships (society_id, user_id);

CREATE TABLE membership_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_membership_id UUID NOT NULL REFERENCES society_memberships(id),
    role_id UUID NOT NULL REFERENCES roles(id),
    UNIQUE (society_membership_id, role_id)
);

CREATE TABLE funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (society_id, name),
    UNIQUE (society_id, id)
);

CREATE TABLE flat_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    name TEXT NOT NULL,
    size_sq_ft NUMERIC(10, 2),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (size_sq_ft IS NULL OR size_sq_ft > 0),
    UNIQUE (society_id, name),
    UNIQUE (society_id, id)
);

CREATE TABLE flats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    flat_number TEXT NOT NULL,
    flat_category_id UUID NOT NULL,
    current_owner_user_id UUID REFERENCES users(id),
    current_resident_user_id UUID REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (society_id, flat_category_id)
        REFERENCES flat_categories (society_id, id),
    UNIQUE (society_id, flat_number),
    UNIQUE (society_id, id)
);

CREATE TABLE charge_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    name TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('MONTHLY', 'SIX_MONTHLY')),
    default_fund_id UUID NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (society_id, default_fund_id)
        REFERENCES funds (society_id, id),
    UNIQUE (society_id, name),
    UNIQUE (society_id, id)
);

CREATE TABLE maintenance_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    flat_category_id UUID NOT NULL,
    charge_type_id UUID NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    effective_from DATE NOT NULL,
    effective_until DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (effective_until IS NULL OR effective_until >= effective_from),
    FOREIGN KEY (society_id, flat_category_id)
        REFERENCES flat_categories (society_id, id),
    FOREIGN KEY (society_id, charge_type_id)
        REFERENCES charge_types (society_id, id),
    -- No two rates may be valid for the same category/type on the same day.
    EXCLUDE USING gist (
        flat_category_id WITH =,
        charge_type_id WITH =,
        daterange(effective_from, effective_until, '[]') WITH &&
    )
);

CREATE TABLE charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    flat_id UUID NOT NULL,
    charge_type_id UUID NOT NULL,
    fund_id UUID NOT NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    due_date DATE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'VOID')),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    FOREIGN KEY (society_id, flat_id) REFERENCES flats (society_id, id),
    FOREIGN KEY (society_id, charge_type_id)
        REFERENCES charge_types (society_id, id),
    FOREIGN KEY (society_id, fund_id) REFERENCES funds (society_id, id),
    CHECK (billing_period_end >= billing_period_start),
    CHECK ((status = 'PUBLISHED') = (published_at IS NOT NULL))
);

-- A voided bill may be reissued, but two active bills for the same period may not exist.
CREATE UNIQUE INDEX one_active_charge_per_flat_type_period
    ON charges (flat_id, charge_type_id, billing_period_start)
    WHERE status <> 'VOID';

CREATE INDEX charges_open_by_flat
    ON charges (flat_id, billing_period_start)
    WHERE status = 'PUBLISHED';

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    flat_id UUID NOT NULL,
    payer_user_id UUID REFERENCES users(id),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'CASH'
        CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER')),
    payment_reference TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')),
    voided_at TIMESTAMPTZ, voided_by UUID, void_reason TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    received_by UUID NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (society_id, flat_id) REFERENCES flats (society_id, id)
);

CREATE INDEX payments_by_flat_received_at ON payments (flat_id, received_at);

CREATE TABLE payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id),
    charge_id UUID NOT NULL REFERENCES charges(id),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')), 
    voided_at TIMESTAMPTZ, 
    voided_by UUID REFERENCES users(id), 
    void_reason TEXT,
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    allocated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (payment_id, charge_id)
);

CREATE UNIQUE INDEX one_active_allocation_per_payment_charge
ON payment_allocations(payment_id, charge_id)
WHERE status = 'ACTIVE'

CREATE INDEX payment_allocations_by_charge ON payment_allocations (charge_id);

CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    name TEXT NOT NULL,
    mobile TEXT,
    email TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (society_id, id)
);

CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (society_id, name),
    UNIQUE (society_id, id)
);

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    vendor_id UUID,
    expense_category_id UUID NOT NULL,
    fund_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payment_method TEXT NOT NULL DEFAULT 'CASH'
        CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER')),
    payment_reference TEXT,
    attachment_url TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')),
    voided_at TIMESTAMPTZ, voided_by UUID, void_reason TEXT,
    recorded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (society_id, vendor_id) REFERENCES vendors (society_id, id),
    FOREIGN KEY (society_id, expense_category_id)
        REFERENCES expense_categories (society_id, id),
    FOREIGN KEY (society_id, fund_id) REFERENCES funds (society_id, id),
    UNIQUE (society_id, id)
);

CREATE INDEX expenses_by_fund_paid_at ON expenses (fund_id, paid_at);

CREATE TABLE fund_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id),
    fund_id UUID NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('CREDIT', 'DEBIT')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    reversal_of UUID REFERENCES fund_transactions(id),
    payment_allocation_id UUID REFERENCES payment_allocations(id),
    expense_id UUID REFERENCES expenses(id),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (society_id, fund_id) REFERENCES funds (society_id, id),
    CHECK (
        (payment_allocation_id IS NOT NULL AND expense_id IS NULL AND transaction_type = 'CREDIT')
        OR
        (payment_allocation_id IS NULL AND expense_id IS NOT NULL AND transaction_type = 'DEBIT')
    )
);

-- A completed allocation or expense must post to its fund exactly once.
CREATE UNIQUE INDEX one_fund_credit_per_payment_allocation
    ON fund_transactions (payment_allocation_id)
    WHERE payment_allocation_id IS NOT NULL;
CREATE UNIQUE INDEX one_fund_debit_per_expense
    ON fund_transactions (expense_id)
    WHERE expense_id IS NOT NULL;
CREATE INDEX fund_transactions_balance_lookup
    ON fund_transactions (fund_id, occurred_at, created_at);

-- These rules require transaction-aware validation in the payment-recording service:
-- 1. Lock the flat's open published charges and existing allocations.
-- 2. An allocation may only join a payment and charge from the same flat/society.
-- 3. Sum of allocations may not exceed either payment.amount or charge.amount.
-- 4. Create payment, allocations, and their fund credits atomically.
