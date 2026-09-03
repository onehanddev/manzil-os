"""Clear all data from manzil_os (local dev) but keep schema – for fresh onboarding.

Usage:
  uv run python -m scripts.clear_local_db  # from backend/
  # or
  uv run python backend/scripts/clear_local_db.py

Keeps: alembic_version, roles (re-seeded)
Clears: societies, users, memberships, flats, persons, receipts, expenses, funds, etc.
After running, first signup will be prompted for onboarding (society + opening balance).
"""

import psycopg
from app.config import get_database_url

def main():
    url = get_database_url()
    print(f"Clearing DB: {url.split('@')[-1]}")
    with psycopg.connect(url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                DO $$ DECLARE r RECORD; BEGIN
                  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename!='alembic_version') LOOP
                    EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
                  END LOOP;
                END $$;
            """)
            cur.execute("INSERT INTO roles (key, name) VALUES ('SOCIETY_ADMIN','Society Admin'), ('COLLECTOR','Collector') ON CONFLICT (key) DO NOTHING")
            print("Done – DB is empty, roles re-seeded. First signup will trigger onboarding.")

if __name__ == "__main__":
    main()
