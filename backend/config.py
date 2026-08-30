import os
import pathlib

from sqlalchemy import create_engine


def _get_database_url() -> str:
    url = os.environ.get("DATABASE_URL") or os.environ.get("TEST_DATABASE_URL")
    if url:
        url = url.strip().strip('"').strip("'")
    else:
        env_path = pathlib.Path(__file__).parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line.startswith("DATABASE_URL"):
                    _, val = line.split("=", 1)
                    url = val.strip().strip('"').strip("'")
                    break
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    # SQLAlchemy psycopg driver needs postgresql+psycopg:// and no pgbouncer query param
    cleaned = url.replace("?pgbouncer=true", "").replace("&pgbouncer=true", "")
    if cleaned.startswith("postgresql://"):
        cleaned = cleaned.replace("postgresql://", "postgresql+psycopg://", 1)
    elif cleaned.startswith("postgres://"):
        cleaned = cleaned.replace("postgres://", "postgresql+psycopg://", 1)
    return cleaned


engine = create_engine(_get_database_url())