"""Minimal dev entrypoint so `uv run dev` works.

Usage (from backend/):
  uv run dev                 # -> http://127.0.0.1:8000 (PORT env or 8000)
  PORT=8001 uv run dev       # custom port
  uv run python -m app       # same, no extra config needed
"""

import os
import sys

import uvicorn


def main() -> None:
    # Allow `uv run dev --port 8001` or `uv run dev --host 0.0.0.0 --port 8001`
    # by forwarding unknown args to uvicorn. If no port given, use $PORT or 8000.
    args = sys.argv[1:]

    # Default if user didn't pass --port explicitly
    has_port = any(a == "--port" or a.startswith("--port=") for a in args)
    if not has_port:
        port = os.getenv("PORT", "8000")
        args = ["--port", port, *args]

    has_host = any(a == "--host" or a.startswith("--host=") for a in args)
    if not has_host:
        args = ["--host", "127.0.0.1", *args]

    # Extra args like --reload are already added below via explicit flags
    # We exec uvicorn with the same semantics as `uvicorn app.main:app --reload ...`
    sys.argv = ["uvicorn", "app.main:app", "--reload", *args]
    uvicorn.main.main()


if __name__ == "__main__":
    main()
