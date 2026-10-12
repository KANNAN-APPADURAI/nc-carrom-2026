"""Vercel entry point: serves the FastAPI app as a Python serverless function.

All /api/* requests are rewritten here by vercel.json. The real app lives in
backend/app; this file only puts backend/ on the import path and re-exports it.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402,F401
