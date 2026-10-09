"""FastAPI service for the NC Carrom 2026 group draw."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .domain import GROUPS, build_groups, now_iso, run_group_draw
from .schemas import DrawPayload, ResultPayload, TeamsPayload, TournamentState
from .store import get_store

app = FastAPI(
    title=config.TITLE,
    description=(
        "Group allocation, fixtures and standings for the nCompass Carrom Tournament. "
        "Partners are paired on paper lots in the room and typed in; the app draws the groups."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def present(raw: dict[str, Any]) -> dict[str, Any]:
    """Turn stored rows into the payload the front end renders."""
    teams = raw.get("teams") or []
    matches = raw.get("matches") or []
    drawn = any(team.get("group_code") for team in teams)
    return {
        "title": config.TITLE,
        "subtitle": config.SUBTITLE,
        "storage": get_store().name,
        "target_teams": config.TARGET_TEAMS,
        "min_teams": config.MIN_TEAMS,
        "teams": teams,
        "matches": matches,
        "groups": build_groups(teams, matches),
        "draw": raw.get("draw") if drawn else None,
        "stats": {
            "teams": len(teams),
            "players": len(teams) * 2,
            "matches": len(matches),
            "played": sum(1 for m in matches if m.get("played")),
        },
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "storage": get_store().name,
        "tournament": config.TOURNAMENT_SLUG,
        "groups": [{"code": code, "name": name} for code, name in GROUPS],
    }


@app.get("/api/state", response_model=TournamentState)
def get_state() -> dict[str, Any]:
    return present(get_store().load())


@app.put("/api/teams", response_model=TournamentState)
def put_teams(payload: TeamsPayload) -> dict[str, Any]:
    pairs = [(team.player1, team.player2) for team in payload.teams]

    names = [name for pair in pairs for name in pair]
    seen: dict[str, int] = {}
    for name in names:
        key = name.casefold()
        seen[key] = seen.get(key, 0) + 1
    repeated = sorted({name for name in names if seen[name.casefold()] > 1})
    if repeated:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{', '.join(repeated)} appears in more than one slot. "
                "Add an initial to tell two players with the same name apart."
            ),
        )

    for index, (first, second) in enumerate(pairs, start=1):
        if first.casefold() == second.casefold():
            raise HTTPException(
                status_code=400,
                detail=f"Team {index} has the same player twice ({first}).",
            )

    return present(get_store().set_teams(pairs))


@app.post("/api/draw", response_model=TournamentState)
def post_draw(payload: DrawPayload | None = None) -> dict[str, Any]:
    store = get_store()
    raw = store.load()
    teams = raw.get("teams") or []

    if len(teams) < config.MIN_TEAMS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Need at least {config.MIN_TEAMS} teams to fill the groups - "
                f"{len(teams)} entered so far."
            ),
        )

    seed, assigned, matches = run_group_draw(teams, payload.seed if payload else None)
    return present(store.save_draw(seed, now_iso(), assigned, matches))


@app.delete("/api/draw", response_model=TournamentState)
def delete_draw() -> dict[str, Any]:
    """Undo the group draw. The entered teams stay exactly as they are."""
    return present(get_store().clear_draw())


@app.patch("/api/matches/{match_id}", response_model=TournamentState)
def patch_match(match_id: str, payload: ResultPayload) -> dict[str, Any]:
    boards_a, boards_b = payload.boards_a, payload.boards_b
    if (boards_a is None) != (boards_b is None):
        raise HTTPException(
            status_code=400, detail="Enter a board score for both teams, or clear both."
        )
    if boards_a is not None and boards_a == boards_b:
        raise HTTPException(
            status_code=400, detail="A carrom tie cannot end level - play it out."
        )

    store = get_store()
    if store.update_match(match_id, boards_a, boards_b) is None:
        raise HTTPException(status_code=404, detail="Match not found.")
    return present(store.load())
