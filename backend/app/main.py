"""FastAPI application factory – wires vertical slices together.

Design:
  - `create_app()` builds a fresh FastAPI instance (test-friendly).
  - Module-level `app` is the ASGI callable for `uvicorn app.main:app`.
  - `handler` alias stays available for AWS Lambda (Mangum) – import stays
    optional so the pilot does not require deployment deps.

Vertical-slice registration lives here in one place so each slice can be
developed independently but the wiring stays visible.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.cashbook.router import router as cashbook_router
from app.expense_categories.router import router as expense_categories_router
from app.flat_categories.router import router as flat_categories_router
from app.flats.router import router as flats_router
from app.funds.router import router as funds_router
from app.health.router import router as health_router
from app.notifications.router import router as notifications_router
from app.opening_dues.router import router as opening_dues_router
from app.persons.router import router as persons_router
from app.reports.router import router as reports_router
from app.vendors.router import router as vendors_router
from app.webhooks.router import router as webhooks_router

APP_TITLE = "Manzil OS API"
APP_VERSION = "0.1.0"


ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def create_app() -> FastAPI:
    app = FastAPI(title=APP_TITLE, version=APP_VERSION)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(admin_router)
    app.include_router(flat_categories_router)
    app.include_router(flats_router)
    app.include_router(persons_router)
    app.include_router(cashbook_router)
    app.include_router(opening_dues_router)
    app.include_router(funds_router)
    app.include_router(vendors_router)
    app.include_router(expense_categories_router)
    app.include_router(webhooks_router)
    app.include_router(notifications_router)
    app.include_router(reports_router)
    return app


# ASGI entrypoint – `uvicorn app.main:app --reload`
app = create_app()

# AWS Lambda compatibility – `from app.main import handler` for Mangum
# (optional dep, so we only create it if mangum is installed).
try:  # pragma: no cover
    from mangum import Mangum  # type: ignore

    handler = Mangum(app)
except Exception:  # pragma: no cover
    handler = app  # type: ignore


__all__ = ["app", "create_app", "handler"]
