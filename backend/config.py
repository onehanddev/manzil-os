"""Backward-compatible shim – delegates to app.config / app.db.

Legacy code did `from config import engine`. New code should use
`from app.config import get_database_url` or `from app.db import get_engine`.
"""

from app.config import get_database_url as _get_database_url
from app.db import get_engine

engine = get_engine()

__all__ = ["engine", "_get_database_url", "get_database_url"]