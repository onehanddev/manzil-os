"""Receipts — re-exported from the cashbook deep module.

Kept for backwards compatibility; the deep module lives at `app.cashbook`.
"""

from app.cashbook.router import router  # noqa: F401 — single seam lives in cashbook

__all__ = ["router"]
