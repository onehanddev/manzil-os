"""Manzil OS backend – vertical-slice package.

Each feature lives in its own slice (e.g. `app.health`, `app.receipts`),
while shared kernel pieces (`app.config`, `app.db`, `app.main`) wire the
FastAPI application. This layout keeps AI context local to one slice.
"""
