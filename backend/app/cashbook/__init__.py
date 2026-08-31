"""Cashbook deep module — receipts + expenses + opening balance + report."""

from app.cashbook.router import router  # noqa: F401 — re-export for main.py

__all__ = ["router"]
