"""Database session handling – single seam for all vertical slices.

Uses :func:`app.config.get_database_url` so the DB URL is resolved lazily
and consistently across the app and alembic.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_database_url

# Engine is created lazily but cached at module level – importing this
# module does not open a connection, only configures SQLAlchemy.
_engine = None
_SessionLocal = None


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(
            get_database_url(),
            pool_pre_ping=True,
        )
    return _engine


def get_engine():
    """Return the singleton SQLAlchemy Engine (lazy)."""
    return _get_engine()


def _get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=_get_engine(),
        )
    return _SessionLocal


def SessionLocal():
    """Create a new Session (caller must close)."""
    return _get_session_factory()()


def get_db():
    """FastAPI dependency – yields a Session and closes it after request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


__all__ = ["SessionLocal", "get_db", "get_engine"]
