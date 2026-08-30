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

from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.flats.router import router as flats_router
from app.health.router import router as health_router
from app.opening_dues.router import router as opening_dues_router
from app.receipts.router import router as receipts_router

APP_TITLE = "Manzil OS API"
APP_VERSION = "0.1.0"


def create_app() -> FastAPI:
    app = FastAPI(title=APP_TITLE, version=APP_VERSION)
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(admin_router)
    app.include_router(flats_router)
    app.include_router(receipts_router)
    app.include_router(opening_dues_router)
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
