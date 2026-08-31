"""ASGI entrypoint shim – re-exports the FastAPI app from app.main.

This exists so both of these work from backend/:
  uv run uvicorn main:app --reload        # via this shim
  uv run uvicorn app.main:app --reload    # canonical import

`api` is an alias for `app` so `uvicorn main:api` also works if you
instinctively type it.
"""

from app.main import app, create_app, handler  # noqa: F401

# Alias – `uvicorn main:api` compatibility.
api = app


def main():
    print("Hello from manzil-os!")


if __name__ == "__main__":
    main()
