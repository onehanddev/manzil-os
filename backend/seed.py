"""Shim for `python -m backend.seed` – delegates to app.seed.

Issue 7 requires both invocations:
  uv run python -m app.seed          (from backend/)
  uv run python -m backend.seed      (from repo root)
  psql -f backend/seed.sql

This module lives at backend/seed.py so ``python -m backend.seed`` works
when executed from the repo root, while the canonical implementation stays
in ``backend/app/seed.py`` (vertical slice).
"""

import pathlib
import sys

# Ensure backend/ is on sys.path when running `python -m backend.seed` from repo root
_this = pathlib.Path(__file__).resolve()
_backend_dir = _this.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from app.seed import main, run, seed  # noqa: F401,E402

if __name__ == "__main__":
    summary = run()
    print(f"Seed complete (via backend.seed): {summary}")
