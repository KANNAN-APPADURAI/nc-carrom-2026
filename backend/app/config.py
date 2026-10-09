"""Runtime configuration, loaded once from the environment."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent
SCHEMA_PATH = PROJECT_DIR / "db" / "schema.sql"

load_dotenv(BASE_DIR / ".env")

TITLE = "NC Carrom 2026 – Team Selection!"
SUBTITLE = "nCompass Carrom Tournament"

TOURNAMENT_SLUG = os.getenv("TOURNAMENT_SLUG", "nc-carrom-2026").strip()

# Neon (or any Postgres) connection string - the primary store.
DATABASE_URL = (os.getenv("DATABASE_URL") or os.getenv("NEON_DATABASE_URL") or "").strip()

# Supabase is supported as an alternative backend if you ever move.
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()

LOCAL_DB_PATH = BASE_DIR / "data" / "tournament.json"

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]

# The tournament shape the event is built around: 25 teams of 2, five per group.
# The draw still works for a smaller turnout - groups simply end up uneven.
TARGET_TEAMS = 25
MIN_TEAMS = 10


def postgres_enabled() -> bool:
    return bool(DATABASE_URL)


def supabase_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)
