"""Persistence.

Three interchangeable stores behind one interface, picked by what is
configured in the environment:

1. ``PostgresStore``  - DATABASE_URL set (Neon). The one the event runs on.
2. ``SupabaseStore``  - Supabase URL + service key set, if you ever move.
3. ``LocalJsonStore`` - nothing set. A single JSON file, so the site can be
   demoed on a laptop with no database at all.

A team row exists from the moment it is typed in; the group draw only fills in
group_code / position / code, and clearing the draw empties those again.
"""

from __future__ import annotations

import json
import threading
import uuid
from functools import lru_cache
from typing import Any

from . import config

EMPTY: dict[str, Any] = {"teams": [], "matches": [], "draw": None, "stage": "league", "super_six_seed": None}

TEAM_COLUMNS = (
    "id",
    "entry_no",
    "player1_name",
    "player2_name",
    "group_code",
    "position",
    "code",
    "super_group_code",
    "super_position",
    "super_origin",
)
MATCH_COLUMNS = (
    "id",
    "match_no",
    "stage",
    "slot",
    "group_code",
    "round",
    "team_a_id",
    "team_b_id",
    "winner_team_id",
    "coins",
    "red_to_winner",
    "played",
)


def _pick(row: dict[str, Any], columns: tuple[str, ...]) -> dict[str, Any]:
    return {key: row.get(key) for key in columns}


def make_teams(pairs: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """Fresh team rows from the entered pairs, undrawn."""
    return [
        {
            "id": str(uuid.uuid4()),
            "entry_no": index,
            "player1_name": first,
            "player2_name": second,
            "group_code": None,
            "position": None,
            "code": None,
        }
        for index, (first, second) in enumerate(pairs, start=1)
    ]


# --------------------------------------------------------------------------
# Neon / Postgres
# --------------------------------------------------------------------------


class PostgresStore:
    """Neon Postgres. Everything that touches more than one table runs in a
    single transaction, so a draw is either fully stored or not at all."""

    name = "postgres"

    TEAM_SELECT = """
        select id::text as id, entry_no, player1_name, player2_name,
               group_code, "position", code,
               super_group_code, super_position, super_origin
          from carrom_teams
         where tournament = %s
         order by entry_no
    """
    MATCH_SELECT = """
        select id::text as id, match_no, stage, slot, group_code, "round",
               team_a_id::text as team_a_id, team_b_id::text as team_b_id,
               winner_team_id::text as winner_team_id, coins, red_to_winner, played
          from carrom_matches
         where tournament = %s
         order by match_no
    """
    STAGE_SELECT = "select stage, super_six_seed from carrom_stage where tournament = %s"
    DRAW_SELECT = """
        select seed, created_at
          from carrom_draws
         where tournament = %s
         order by created_at desc
         limit 1
    """
    TEAM_INSERT = """
        insert into carrom_teams
               (id, tournament, entry_no, player1_name, player2_name,
                group_code, "position", code)
        values (%(id)s, %(tournament)s, %(entry_no)s, %(player1_name)s,
                %(player2_name)s, %(group_code)s, %(position)s, %(code)s)
    """
    MATCH_INSERT = """
        insert into carrom_matches
               (id, tournament, match_no, stage, slot, group_code, "round",
                team_a_id, team_b_id, winner_team_id, coins, red_to_winner, played)
        values (%(id)s, %(tournament)s, %(match_no)s, %(stage)s, %(slot)s,
                %(group_code)s, %(round)s,
                %(team_a_id)s, %(team_b_id)s, %(winner_team_id)s, %(coins)s,
                %(red_to_winner)s, %(played)s)
    """

    def __init__(self) -> None:
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool

        self.slug = config.TOURNAMENT_SLUG
        # Neon drops idle connections, so hand out checked connections only.
        self.pool = ConnectionPool(
            config.DATABASE_URL,
            min_size=1,
            max_size=5,
            timeout=15,
            max_idle=120,
            check=ConnectionPool.check_connection,
            kwargs={"row_factory": dict_row, "autocommit": False},
            open=True,
        )
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        """Create the tables on first run - the DDL is all IF NOT EXISTS."""
        if not config.SCHEMA_PATH.exists():
            return
        ddl = config.SCHEMA_PATH.read_text(encoding="utf-8")
        with self.pool.connection() as conn:
            conn.execute(ddl)

    def load(self) -> dict[str, Any]:
        with self.pool.connection() as conn:
            teams = conn.execute(self.TEAM_SELECT, (self.slug,)).fetchall()
            matches = conn.execute(self.MATCH_SELECT, (self.slug,)).fetchall()
            draws = conn.execute(self.DRAW_SELECT, (self.slug,)).fetchall()
            stage_rows = conn.execute(self.STAGE_SELECT, (self.slug,)).fetchall()

        draw = None
        if draws:
            created = draws[0]["created_at"]
            draw = {
                "seed": draws[0]["seed"],
                "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
            }
        stage_row = stage_rows[0] if stage_rows else {}
        return {
            "teams": [_pick(row, TEAM_COLUMNS) for row in teams],
            "matches": [_pick(row, MATCH_COLUMNS) for row in matches],
            "draw": draw,
            "stage": stage_row.get("stage") or "league",
            "super_six_seed": stage_row.get("super_six_seed"),
        }

    def set_stage(self, stage: str, super_six_seed: str | None = None) -> dict[str, Any]:
        with self.pool.connection() as conn:
            conn.execute(
                "insert into carrom_stage (tournament, stage, super_six_seed, updated_at)"
                " values (%s, %s, %s, now())"
                " on conflict (tournament) do update"
                "   set stage = excluded.stage,"
                "       super_six_seed = coalesce(excluded.super_six_seed, carrom_stage.super_six_seed),"
                "       updated_at = now()",
                (self.slug, stage, super_six_seed),
            )
        return self.load()

    def save_super_six(
        self,
        seed: str,
        assignments: list[dict[str, Any]],
        matches: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Write the Super Six draw and its fixtures in one transaction. The
        league's own matches and group placings are never touched."""
        with self.pool.connection() as conn:
            conn.execute(
                "delete from carrom_matches where tournament = %s and stage in ('super_six', 'playoffs')",
                (self.slug,),
            )
            conn.execute(
                "update carrom_teams set super_group_code = null, super_position = null,"
                " super_origin = null where tournament = %s",
                (self.slug,),
            )
            if assignments:
                conn.cursor().executemany(
                    "update carrom_teams"
                    "   set super_group_code = %(super_group_code)s,"
                    "       super_position = %(super_position)s,"
                    "       super_origin = %(super_origin)s"
                    " where tournament = %(tournament)s and id = %(team_id)s",
                    [{**a, "tournament": self.slug} for a in assignments],
                )
            if matches:
                conn.cursor().executemany(
                    self.MATCH_INSERT,
                    [{**m, "tournament": self.slug} for m in matches],
                )
        return self.set_stage("super_six", seed)

    def save_playoffs(self, matches: list[dict[str, Any]]) -> dict[str, Any]:
        with self.pool.connection() as conn:
            conn.execute(
                "delete from carrom_matches where tournament = %s and stage = 'playoffs'",
                (self.slug,),
            )
            if matches:
                conn.cursor().executemany(
                    self.MATCH_INSERT,
                    [{**m, "tournament": self.slug} for m in matches],
                )
        return self.set_stage("playoffs")

    def drop_stage(self, stage: str) -> dict[str, Any]:
        """Undo a stage: remove its fixtures, and any Super Six placings."""
        with self.pool.connection() as conn:
            conn.execute(
                "delete from carrom_matches where tournament = %s and stage = %s",
                (self.slug, stage),
            )
            if stage == "super_six":
                conn.execute(
                    "update carrom_teams set super_group_code = null, super_position = null,"
                    " super_origin = null where tournament = %s",
                    (self.slug,),
                )
        return self.load()

    def _wipe_draw(self, conn) -> None:
        """Remove the fixtures and undo the group allocation, keeping the teams."""
        for table in ("carrom_matches", "carrom_draws"):
            conn.execute(f"delete from {table} where tournament = %s", (self.slug,))
        conn.execute(
            'update carrom_teams set group_code = null, "position" = null, code = null'
            " where tournament = %s",
            (self.slug,),
        )

    def set_teams(self, pairs: list[tuple[str, str]]) -> dict[str, Any]:
        teams = make_teams(pairs)
        with self.pool.connection() as conn:
            # A changed team list invalidates any existing draw.
            self._wipe_draw(conn)
            conn.execute("delete from carrom_teams where tournament = %s", (self.slug,))
            if teams:
                conn.cursor().executemany(
                    self.TEAM_INSERT,
                    [{**team, "tournament": self.slug} for team in teams],
                )
        return self.load()

    def save_draw(
        self,
        seed: str,
        created_at: str,
        teams: list[dict[str, Any]],
        matches: list[dict[str, Any]],
    ) -> dict[str, Any]:
        with self.pool.connection() as conn:
            self._wipe_draw(conn)
            conn.execute(
                "insert into carrom_draws (id, tournament, seed, created_at)"
                " values (%s, %s, %s, %s)",
                (str(uuid.uuid4()), self.slug, seed, created_at),
            )
            conn.cursor().executemany(
                'update carrom_teams set group_code = %(group_code)s,'
                ' "position" = %(position)s, code = %(code)s'
                " where tournament = %(tournament)s and id = %(id)s",
                [
                    {
                        "id": team["id"],
                        "tournament": self.slug,
                        "group_code": team["group_code"],
                        "position": team["position"],
                        "code": team["code"],
                    }
                    for team in teams
                ],
            )
            if matches:
                conn.cursor().executemany(
                    self.MATCH_INSERT,
                    [{**match, "tournament": self.slug} for match in matches],
                )
        return self.load()

    def clear_draw(self) -> dict[str, Any]:
        with self.pool.connection() as conn:
            self._wipe_draw(conn)
        return self.load()

    def update_match(
        self,
        match_id: str,
        winner_team_id: str | None,
        coins: int | None,
        red_to_winner: bool,
    ) -> dict[str, Any] | None:
        played = winner_team_id is not None
        with self.pool.connection() as conn:
            try:
                row = conn.execute(
                    "update carrom_matches"
                    "   set winner_team_id = %s, coins = %s, red_to_winner = %s, played = %s"
                    " where tournament = %s and id = %s"
                    " returning id::text as id",
                    (
                        winner_team_id,
                        coins if played else None,
                        bool(red_to_winner) if played else False,
                        played,
                        self.slug,
                        match_id,
                    ),
                ).fetchone()
            except Exception:  # malformed uuid in the URL
                conn.rollback()
                return None
        return row


# --------------------------------------------------------------------------
# Local JSON (no database)
# --------------------------------------------------------------------------


class LocalJsonStore:
    """File-backed store. Good enough for one laptop running one tournament."""

    name = "local-json"

    def __init__(self, path=config.LOCAL_DB_PATH) -> None:
        self.path = path
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def _read(self) -> dict[str, Any]:
        if not self.path.exists():
            return json.loads(json.dumps(EMPTY))
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (json.JSONDecodeError, OSError):
            return json.loads(json.dumps(EMPTY))
        return {**json.loads(json.dumps(EMPTY)), **data}

    def _write(self, state: dict[str, Any]) -> None:
        temp = self.path.with_suffix(".tmp")
        with temp.open("w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, ensure_ascii=False)
        temp.replace(self.path)

    def load(self) -> dict[str, Any]:
        with self._lock:
            return self._read()

    def set_teams(self, pairs: list[tuple[str, str]]) -> dict[str, Any]:
        with self._lock:
            state = self._read()
            state["teams"] = make_teams(pairs)
            state["matches"] = []
            state["draw"] = None
            self._write(state)
            return state

    def save_draw(
        self,
        seed: str,
        created_at: str,
        teams: list[dict[str, Any]],
        matches: list[dict[str, Any]],
    ) -> dict[str, Any]:
        with self._lock:
            state = self._read()
            state["teams"] = teams
            state["matches"] = matches
            state["draw"] = {"seed": seed, "created_at": created_at}
            self._write(state)
            return state

    def clear_draw(self) -> dict[str, Any]:
        with self._lock:
            state = self._read()
            state["teams"] = [
                {**team, "group_code": None, "position": None, "code": None}
                for team in state["teams"]
            ]
            state["matches"] = []
            state["draw"] = None
            self._write(state)
            return state

    def set_stage(self, stage: str, super_six_seed: str | None = None) -> dict[str, Any]:
        with self._lock:
            state = self._read()
            state["stage"] = stage
            if super_six_seed is not None:
                state["super_six_seed"] = super_six_seed
            self._write(state)
            return state

    def save_super_six(
        self,
        seed: str,
        assignments: list[dict[str, Any]],
        matches: list[dict[str, Any]],
    ) -> dict[str, Any]:
        with self._lock:
            state = self._read()
            by_team = {a["team_id"]: a for a in assignments}
            state["teams"] = [
                {
                    **team,
                    "super_group_code": by_team.get(team["id"], {}).get("super_group_code"),
                    "super_position": by_team.get(team["id"], {}).get("super_position"),
                    "super_origin": by_team.get(team["id"], {}).get("super_origin"),
                }
                for team in state["teams"]
            ]
            state["matches"] = [
                m for m in state["matches"] if m.get("stage", "league") == "league"
            ] + matches
            state["stage"] = "super_six"
            state["super_six_seed"] = seed
            self._write(state)
            return state

    def save_playoffs(self, matches: list[dict[str, Any]]) -> dict[str, Any]:
        with self._lock:
            state = self._read()
            state["matches"] = [
                m for m in state["matches"] if m.get("stage", "league") != "playoffs"
            ] + matches
            state["stage"] = "playoffs"
            self._write(state)
            return state

    def drop_stage(self, stage: str) -> dict[str, Any]:
        with self._lock:
            state = self._read()
            state["matches"] = [
                m for m in state["matches"] if m.get("stage", "league") != stage
            ]
            if stage == "super_six":
                state["teams"] = [
                    {**t, "super_group_code": None, "super_position": None, "super_origin": None}
                    for t in state["teams"]
                ]
            self._write(state)
            return state

    def update_match(
        self,
        match_id: str,
        winner_team_id: str | None,
        coins: int | None,
        red_to_winner: bool,
    ) -> dict[str, Any] | None:
        with self._lock:
            state = self._read()
            target = next((m for m in state["matches"] if m["id"] == match_id), None)
            if target is None:
                return None
            played = winner_team_id is not None
            target["winner_team_id"] = winner_team_id
            target["coins"] = coins if played else None
            target["red_to_winner"] = bool(red_to_winner) if played else False
            target["played"] = played
            self._write(state)
            return target


# --------------------------------------------------------------------------
# Supabase (alternative)
# --------------------------------------------------------------------------


class SupabaseStore:
    """Supabase REST store, scoped to one tournament slug."""

    name = "supabase"

    def __init__(self) -> None:
        from supabase import create_client

        self.slug = config.TOURNAMENT_SLUG
        self.client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)

    def _table(self, table: str):
        return self.client.table(table)

    def _scoped(self, table: str):
        return self._table(table).select("*").eq("tournament", self.slug)

    def _stamp(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [{**row, "tournament": self.slug} for row in rows]

    def load(self) -> dict[str, Any]:
        teams = self._scoped("carrom_teams").order("entry_no").execute().data or []
        matches = self._scoped("carrom_matches").order("match_no").execute().data or []
        draws = (
            self._scoped("carrom_draws").order("created_at", desc=True).limit(1).execute().data
            or []
        )
        stages = self._scoped("carrom_stage").limit(1).execute().data or []
        draw = None
        if draws:
            draw = {"seed": draws[0]["seed"], "created_at": str(draws[0]["created_at"])}
        stage_row = stages[0] if stages else {}
        return {
            "teams": [_pick(row, TEAM_COLUMNS) for row in teams],
            "matches": [_pick(row, MATCH_COLUMNS) for row in matches],
            "draw": draw,
            "stage": stage_row.get("stage") or "league",
            "super_six_seed": stage_row.get("super_six_seed"),
        }

    def set_stage(self, stage: str, super_six_seed: str | None = None) -> dict[str, Any]:
        row = {"tournament": self.slug, "stage": stage}
        if super_six_seed is not None:
            row["super_six_seed"] = super_six_seed
        self._table("carrom_stage").upsert(row, on_conflict="tournament").execute()
        return self.load()

    def save_super_six(
        self,
        seed: str,
        assignments: list[dict[str, Any]],
        matches: list[dict[str, Any]],
    ) -> dict[str, Any]:
        table = self._table("carrom_matches")
        for stage in ("super_six", "playoffs"):
            table.delete().eq("tournament", self.slug).eq("stage", stage).execute()
        self._table("carrom_teams").update(
            {"super_group_code": None, "super_position": None, "super_origin": None}
        ).eq("tournament", self.slug).execute()
        for assignment in assignments:
            self._table("carrom_teams").update(
                {
                    "super_group_code": assignment["super_group_code"],
                    "super_position": assignment["super_position"],
                    "super_origin": assignment["super_origin"],
                }
            ).eq("tournament", self.slug).eq("id", assignment["team_id"]).execute()
        if matches:
            table.insert(self._stamp(matches)).execute()
        return self.set_stage("super_six", seed)

    def save_playoffs(self, matches: list[dict[str, Any]]) -> dict[str, Any]:
        table = self._table("carrom_matches")
        table.delete().eq("tournament", self.slug).eq("stage", "playoffs").execute()
        if matches:
            table.insert(self._stamp(matches)).execute()
        return self.set_stage("playoffs")

    def drop_stage(self, stage: str) -> dict[str, Any]:
        self._table("carrom_matches").delete().eq("tournament", self.slug).eq(
            "stage", stage
        ).execute()
        if stage == "super_six":
            self._table("carrom_teams").update(
                {"super_group_code": None, "super_position": None, "super_origin": None}
            ).eq("tournament", self.slug).execute()
        return self.load()

    def _wipe_draw(self) -> None:
        for table in ("carrom_matches", "carrom_draws"):
            self._table(table).delete().eq("tournament", self.slug).execute()
        self._table("carrom_teams").update(
            {"group_code": None, "position": None, "code": None}
        ).eq("tournament", self.slug).execute()

    def set_teams(self, pairs: list[tuple[str, str]]) -> dict[str, Any]:
        self._wipe_draw()
        self._table("carrom_teams").delete().eq("tournament", self.slug).execute()
        teams = make_teams(pairs)
        if teams:
            self._table("carrom_teams").insert(self._stamp(teams)).execute()
        return self.load()

    def save_draw(
        self,
        seed: str,
        created_at: str,
        teams: list[dict[str, Any]],
        matches: list[dict[str, Any]],
    ) -> dict[str, Any]:
        self._wipe_draw()
        self._table("carrom_draws").insert(
            self._stamp([{"id": str(uuid.uuid4()), "seed": seed, "created_at": created_at}])
        ).execute()
        for team in teams:
            self._table("carrom_teams").update(
                {
                    "group_code": team["group_code"],
                    "position": team["position"],
                    "code": team["code"],
                }
            ).eq("tournament", self.slug).eq("id", team["id"]).execute()
        if matches:
            self._table("carrom_matches").insert(self._stamp(matches)).execute()
        return self.load()

    def clear_draw(self) -> dict[str, Any]:
        self._wipe_draw()
        return self.load()

    def update_match(
        self,
        match_id: str,
        winner_team_id: str | None,
        coins: int | None,
        red_to_winner: bool,
    ) -> dict[str, Any] | None:
        played = winner_team_id is not None
        result = (
            self._table("carrom_matches")
            .update(
                {
                    "winner_team_id": winner_team_id,
                    "coins": coins if played else None,
                    "red_to_winner": bool(red_to_winner) if played else False,
                    "played": played,
                }
            )
            .eq("tournament", self.slug)
            .eq("id", match_id)
            .execute()
        )
        rows = result.data or []
        return _pick(rows[0], MATCH_COLUMNS) if rows else None


@lru_cache(maxsize=1)
def get_store():
    if config.postgres_enabled():
        return PostgresStore()
    if config.supabase_enabled():
        return SupabaseStore()
    return LocalJsonStore()
