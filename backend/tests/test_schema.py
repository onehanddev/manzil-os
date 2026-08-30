import os
import pathlib
import subprocess

import psycopg
import pytest
from psycopg import errors

from conftest import TEST_DB_URL


def _get_conn():
    return psycopg.connect(TEST_DB_URL, autocommit=True)


def test_alembic_migration_initializes_cleanly_on_empty_db():
    """alembic upgrade head must run cleanly on an empty Postgres DB."""
    with psycopg.connect(TEST_DB_URL) as c:
        c.autocommit = True
        with c.cursor() as cur:
            cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    env = os.environ.copy()
    env["DATABASE_URL"] = TEST_DB_URL
    backend_dir = pathlib.Path(__file__).parent.parent
    result = subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
        cwd=str(backend_dir),
        env=env,
    )
    assert result.returncode == 0, f"alembic upgrade failed:\nSTDOUT:{result.stdout}\nSTDERR:{result.stderr}"
    # Verify at least core tables exist
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
            )
            tables = {r[0] for r in cur.fetchall()}
    for required in [
        "societies",
        "users",
        "roles",
        "society_memberships",
        "membership_roles",
        "flat_categories",
        "flats",
        "persons",
        "flat_occupants",
        "opening_dues",
        "receipts",
        "funds",
        "vendors",
        "expense_categories",
    ]:
        assert required in tables, f"missing required table {required}, got {tables}"


def test_no_fund_charge_expense_tables(conn):
    """Phase 0 expanded slice: funds/vendors/expense_categories are required; charge tables still forbidden."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
        )
        tables = {r[0] for r in cur.fetchall()}
    for forbidden in [
        "charge_types",
        "maintenance_rates",
        "charges",
        "payment_allocations",
        "fund_transactions",
        "expenses",
    ]:
        assert forbidden not in tables, f"forbidden table {forbidden} should not exist in trimmed schema"


def test_roles_seeded(conn):
    """Roles SOCIETY_ADMIN and COLLECTOR must be seeded."""
    with conn.cursor() as cur:
        cur.execute("SELECT key FROM roles ORDER BY key")
        keys = {r[0] for r in cur.fetchall()}
    assert "SOCIETY_ADMIN" in keys
    assert "COLLECTOR" in keys


def test_society_and_flat_categories_seeded(conn):
    """One society and two flat categories must be seeded."""
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM societies")
        assert cur.fetchone()[0] == 1
        cur.execute("SELECT count(*) FROM flat_categories")
        count = cur.fetchone()[0]
        assert count >= 2, f"expected >=2 flat_categories seeded, got {count}"


def test_admin_user_and_membership_seeded(conn):
    """One admin user with SOCIETY_ADMIN membership must be seeded."""
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM users")
        assert cur.fetchone()[0] >= 1
        cur.execute("SELECT count(*) FROM society_memberships")
        assert cur.fetchone()[0] >= 1
        cur.execute(
            """
            SELECT count(*) FROM membership_roles mr
            JOIN roles r ON r.id = mr.role_id
            WHERE r.key = 'SOCIETY_ADMIN'
            """
        )
        assert cur.fetchone()[0] >= 1


def test_opening_due_minus_receipts_produces_negative_advance(conn):
    """
    Trimmed model: current_due = opening_due - sum(receipts).
    opening 2000, paid 2500 => due -500 (advance).
    """
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM societies LIMIT 1")
        society_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM flat_categories LIMIT 1")
        cat_id = cur.fetchone()[0]
        # create flat for this test
        cur.execute(
            "INSERT INTO flats (society_id, flat_number, flat_category_id) VALUES (%s, %s, %s) RETURNING id",
            (society_id, "ADV-101", cat_id),
        )
        flat_id = cur.fetchone()[0]
        # opening due 2000
        cur.execute(
            "INSERT INTO opening_dues (flat_id, amount) VALUES (%s, %s) ON CONFLICT (flat_id) DO UPDATE SET amount=EXCLUDED.amount",
            (flat_id, 2000),
        )
        # need a person and membership for receipt
        cur.execute("SELECT id FROM persons LIMIT 1")
        row = cur.fetchone()
        if row:
            person_id = row[0]
        else:
            cur.execute(
                "INSERT INTO persons (society_id, name, mobile) VALUES (%s, %s, %s) RETURNING id",
                (society_id, "Test Payer", "+919000000001"),
            )
            person_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM society_memberships LIMIT 1")
        membership_id = cur.fetchone()[0]
        cur.execute(
            """
            INSERT INTO receipts (society_id, flat_id, payer_person_id, amount, business_date, type, collected_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (society_id, flat_id, person_id, 2500, "2026-08-01", "ADVANCE", membership_id),
        )
        cur.execute(
            """
            SELECT od.amount - COALESCE(sum(r.amount),0) as current_due
            FROM opening_dues od
            LEFT JOIN receipts r ON r.flat_id = od.flat_id
            WHERE od.flat_id = %s
            GROUP BY od.amount
            """,
            (flat_id,),
        )
        due = cur.fetchone()[0]
        assert due == -500, f"expected -500 advance, got {due}"
        # cleanup
        cur.execute("DELETE FROM receipts WHERE flat_id=%s", (flat_id,))
        cur.execute("DELETE FROM opening_dues WHERE flat_id=%s", (flat_id,))
        cur.execute("DELETE FROM flats WHERE id=%s", (flat_id,))


def test_receipt_amount_rejects_zero_and_negative(conn):
    """Receipt amount check must reject 0 and negative amounts."""
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM societies LIMIT 1")
        society_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM flat_categories LIMIT 1")
        cat_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO flats (society_id, flat_number, flat_category_id) VALUES (%s, %s, %s) RETURNING id",
            (society_id, "AMT-102", cat_id),
        )
        flat_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM persons LIMIT 1")
        person_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM society_memberships LIMIT 1")
        membership_id = cur.fetchone()[0]
        for bad_amount in [0, -100, -0.01]:
            with pytest.raises(errors.CheckViolation):
                cur.execute(
                    """
                    INSERT INTO receipts (society_id, flat_id, payer_person_id, amount, business_date, type, collected_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (society_id, flat_id, person_id, bad_amount, "2026-08-02", "REGULAR", membership_id),
                )
        cur.execute("DELETE FROM flats WHERE id=%s", (flat_id,))


def test_flat_number_unique_per_society(conn):
    """Flat numbers must be unique within a society."""
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM societies LIMIT 1")
        society_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM flat_categories LIMIT 1")
        cat_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO flats (society_id, flat_number, flat_category_id) VALUES (%s, %s, %s) RETURNING id",
            (society_id, "UNIQ-103", cat_id),
        )
        first_id = cur.fetchone()[0]
        with pytest.raises(errors.UniqueViolation):
            cur.execute(
                "INSERT INTO flats (society_id, flat_number, flat_category_id) VALUES (%s, %s, %s)",
                (society_id, "UNIQ-103", cat_id),
            )
        cur.execute("DELETE FROM flats WHERE id=%s", (first_id,))


def test_flat_occupants_single_active_owner_and_tenant(conn):
    """At most one active OWNER and one active TENANT per flat."""
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM societies LIMIT 1")
        society_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM flat_categories LIMIT 1")
        cat_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO flats (society_id, flat_number, flat_category_id) VALUES (%s, %s, %s) RETURNING id",
            (society_id, "OCC-104", cat_id),
        )
        flat_id = cur.fetchone()[0]
        # create two persons
        cur.execute(
            "INSERT INTO persons (society_id, name, mobile) VALUES (%s, %s, %s) RETURNING id",
            (society_id, "Owner One", "+919000000010"),
        )
        p1 = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO persons (society_id, name, mobile) VALUES (%s, %s, %s) RETURNING id",
            (society_id, "Owner Two", "+919000000011"),
        )
        p2 = cur.fetchone()[0]
        # first active owner succeeds
        cur.execute(
            "INSERT INTO flat_occupants (flat_id, person_id, role, is_active) VALUES (%s, %s, %s, %s)",
            (flat_id, p1, "OWNER", True),
        )
        # second active owner must fail
        with pytest.raises(errors.UniqueViolation):
            cur.execute(
                "INSERT INTO flat_occupants (flat_id, person_id, role, is_active) VALUES (%s, %s, %s, %s)",
                (flat_id, p2, "OWNER", True),
            )
        # cleanup: allow inactive second owner
        cur.execute(
            "INSERT INTO flat_occupants (flat_id, person_id, role, is_active) VALUES (%s, %s, %s, %s)",
            (flat_id, p2, "OWNER", False),
        )
        # tenant single-active check
        cur.execute(
            "INSERT INTO persons (society_id, name, mobile) VALUES (%s, %s, %s) RETURNING id",
            (society_id, "Tenant One", "+919000000012"),
        )
        t1 = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO persons (society_id, name, mobile) VALUES (%s, %s, %s) RETURNING id",
            (society_id, "Tenant Two", "+919000000013"),
        )
        t2 = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO flat_occupants (flat_id, person_id, role, is_active) VALUES (%s, %s, %s, %s)",
            (flat_id, t1, "TENANT", True),
        )
        with pytest.raises(errors.UniqueViolation):
            cur.execute(
                "INSERT INTO flat_occupants (flat_id, person_id, role, is_active) VALUES (%s, %s, %s, %s)",
                (flat_id, t2, "TENANT", True),
            )
        # cleanup flats cascading?
        cur.execute("DELETE FROM flat_occupants WHERE flat_id=%s", (flat_id,))
        cur.execute("DELETE FROM flats WHERE id=%s", (flat_id,))
        cur.execute("DELETE FROM persons WHERE id IN (%s,%s,%s,%s)", (p1, p2, t1, t2))


def test_receipt_business_date_required(conn):
    """Receipt business_date is NOT NULL."""
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM societies LIMIT 1")
        society_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM flat_categories LIMIT 1")
        cat_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO flats (society_id, flat_number, flat_category_id) VALUES (%s, %s, %s) RETURNING id",
            (society_id, "BD-105", cat_id),
        )
        flat_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM persons LIMIT 1")
        person_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM society_memberships LIMIT 1")
        membership_id = cur.fetchone()[0]
        with pytest.raises(errors.NotNullViolation):
            cur.execute(
                """
                INSERT INTO receipts (society_id, flat_id, payer_person_id, amount, business_date, type, collected_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (society_id, flat_id, person_id, 100, None, "REGULAR", membership_id),
            )
        cur.execute("DELETE FROM flats WHERE id=%s", (flat_id,))
