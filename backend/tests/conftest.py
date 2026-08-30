import os
import subprocess
import pathlib

import psycopg
import pytest

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://hakimuddinhaweliwala@localhost:5432/manzil_os_test"
)


def _alembic_upgrade(db_url: str):
    """Run `alembic upgrade head` against the given DB URL."""
    env = os.environ.copy()
    env["DATABASE_URL"] = db_url
    # Ensure alembic uses this project's alembic.ini
    backend_dir = pathlib.Path(__file__).parent.parent
    result = subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
        cwd=str(backend_dir),
        env=env,
    )
    return result


@pytest.fixture(scope="session")
def db_url():
    return TEST_DB_URL


@pytest.fixture(scope="session")
def conn(db_url):
    # Ensure schema is initialized once per session by dropping public schema and running alembic
    with psycopg.connect(db_url) as c:
        c.autocommit = True
        with c.cursor() as cur:
            cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    result = _alembic_upgrade(db_url)
    assert result.returncode == 0, f"alembic upgrade failed: {result.stderr}\n{result.stdout}"
    # Provide a connection for tests that will autocommit
    with psycopg.connect(db_url, autocommit=True) as connection:
        yield connection
