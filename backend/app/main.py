"""FastAPI service for NC Carrom 2026.

The tournament runs in four stages, each frozen before the next opens:

    league  ->  super_six  ->  playoffs  ->  done

The teams and the league draw are settled and are read-only from here on.
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from . import auth, config
from .domain import (
    GROUPS,
    PLAYOFF_NAMES,
    STAGE_DONE,
    STAGE_LEAGUE,
    STAGE_PLAYOFFS,
    STAGE_SUPER_SIX,
    SUPER_GROUPS,
    build_groups,
    build_playoff_fixtures,
    build_super_six_fixtures,
    downstream_slots,
    podium,
    resolve_playoffs,
    select_super_six,
    third_placed_table,
)
from .schemas import (
    DrawPayload,
    LoginPayload,
    ResultPayload,
    Session,
    SuperSixPayload,
    TournamentState,
)
from .store import get_store

app = FastAPI(
    title=config.TITLE,
    description=(
        "League stage, Super Six and playoffs for the nCompass Carrom Tournament."
    ),
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

STAGE_LABELS = {
    STAGE_LEAGUE: "League Stage",
    STAGE_SUPER_SIX: "Super Six",
    STAGE_PLAYOFFS: "Playoffs",
    STAGE_DONE: "Champions",
}


def _summary(groups: list[dict[str, Any]]) -> tuple[int, int]:
    played = sum(g["played"] for g in groups)
    total = sum(g["total_matches"] for g in groups)
    return played, total


def present(raw: dict[str, Any], principal: dict[str, str] | None = None) -> dict[str, Any]:
    """Turn stored rows into the payload the front end renders."""
    teams = raw.get("teams") or []
    matches = raw.get("matches") or []
    stage = raw.get("stage") or STAGE_LEAGUE

    league_groups = build_groups(teams, matches, STAGE_LEAGUE)
    league_played, league_total = _summary(league_groups)
    league_complete = league_total > 0 and league_played == league_total

    super_groups = build_groups(teams, matches, STAGE_SUPER_SIX)
    super_played, super_total = _summary(super_groups)
    super_complete = super_total > 0 and super_played == super_total

    playoff_rows = [m for m in matches if m.get("stage") == STAGE_PLAYOFFS]
    playoffs = resolve_playoffs(super_groups, playoff_rows)
    places = podium(playoffs)
    champion = places["champion"]

    stages = [
        {
            "id": STAGE_LEAGUE,
            "label": STAGE_LABELS[STAGE_LEAGUE],
            "played": league_played,
            "total": league_total,
            "complete": league_complete,
            "live": stage == STAGE_LEAGUE,
            "frozen": stage != STAGE_LEAGUE,
        },
        {
            "id": STAGE_SUPER_SIX,
            "label": STAGE_LABELS[STAGE_SUPER_SIX],
            "played": super_played,
            "total": super_total,
            "complete": super_complete,
            "live": stage == STAGE_SUPER_SIX,
            "frozen": stage in (STAGE_PLAYOFFS, STAGE_DONE),
            "open": stage in (STAGE_SUPER_SIX, STAGE_PLAYOFFS, STAGE_DONE),
        },
        {
            "id": STAGE_PLAYOFFS,
            "label": STAGE_LABELS[STAGE_PLAYOFFS],
            "played": sum(1 for p in playoffs if p.get("played")),
            "total": len(playoffs),
            "complete": bool(champion),
            "live": stage in (STAGE_PLAYOFFS, STAGE_DONE),
            "frozen": False,
            "open": stage in (STAGE_PLAYOFFS, STAGE_DONE),
        },
    ]

    return {
        "title": config.TITLE,
        "subtitle": config.SUBTITLE,
        "storage": get_store().name,
        "role": (principal or {}).get("role", auth.ADMIN),
        "can_edit": (principal or {}).get("role", auth.ADMIN) != auth.VIEWER,
        "stage": stage,
        "stage_label": STAGE_LABELS.get(stage, stage),
        "stages": stages,
        "teams": teams,
        "league": {
            "groups": league_groups,
            "played": league_played,
            "total": league_total,
            "complete": league_complete,
            # Always ranked, so the qualification board can fill in live. Until
            # the league is finished these standings are provisional.
            "thirds": third_placed_table(league_groups),
        },
        "super_six": {
            "groups": super_groups,
            "seed": raw.get("super_six_seed"),
            "played": super_played,
            "total": super_total,
            "complete": super_complete,
            "drawn": super_total > 0,
        },
        "playoffs": {"matches": playoffs, **places},
        "draw": raw.get("draw"),
        "stats": {
            "teams": len(teams),
            "players": len(teams) * 2,
            "matches": len(matches),
            "played": sum(1 for m in matches if m.get("played")),
        },
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    """Public: the sign-in screen needs this before anyone is signed in."""
    return {
        "ok": True,
        "storage": get_store().name,
        "tournament": config.TOURNAMENT_SLUG,
        "auth_required": config.auth_enabled(),
        "groups": [{"code": code, "name": name} for code, name in GROUPS],
        "super_groups": [{"code": code, "name": name} for code, name in SUPER_GROUPS],
    }


@app.post("/api/login", response_model=Session)
def login(payload: LoginPayload, request: Request) -> dict[str, Any]:
    """Public: exchange the organiser credentials for a session token."""
    if not config.auth_enabled():
        raise HTTPException(
            status_code=400, detail="Sign-in is not configured on this server."
        )

    client = request.client.host if request.client else "unknown"
    wait = auth.seconds_locked_out(client)
    if wait:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {wait} seconds.",
        )

    role = auth.authenticate(payload.username, payload.password)
    if role is None:
        auth.record_failure(client)
        raise HTTPException(status_code=401, detail="Wrong username or password.")

    auth.clear_failures(client)
    username = payload.username.strip()
    token, expires_at = auth.issue_token(username, role)
    return {"token": token, "username": username, "role": role, "expires_at": expires_at}


@app.get("/api/session", response_model=Session)
def session(principal: dict = Depends(auth.require_auth)) -> dict[str, Any]:
    """Confirm a stored token is still good, and slide the expiry forward."""
    token, expires_at = auth.issue_token(principal["username"], principal["role"])
    return {
        "token": token,
        "username": principal["username"],
        "role": principal["role"],
        "expires_at": expires_at,
    }


@app.get("/api/state", response_model=TournamentState)
def get_state(principal: dict = Depends(auth.require_auth)) -> dict[str, Any]:
    return present(get_store().load(), principal)


# --------------------------------------------------------------------------
# Settled for good: the teams and the league draw
# --------------------------------------------------------------------------

FROZEN = (
    "The {what} is final for NC Carrom 2026 and can no longer be changed here."
)


@app.put("/api/teams", response_model=TournamentState)
def put_teams(editor: dict = Depends(auth.require_editor)) -> dict[str, Any]:
    raise HTTPException(status_code=409, detail=FROZEN.format(what="team list"))


@app.post("/api/draw", response_model=TournamentState)
def post_draw(
    payload: DrawPayload | None = None, editor: dict = Depends(auth.require_editor)
) -> dict[str, Any]:
    raise HTTPException(status_code=409, detail=FROZEN.format(what="league group draw"))


@app.delete("/api/draw", response_model=TournamentState)
def delete_draw(editor: dict = Depends(auth.require_editor)) -> dict[str, Any]:
    raise HTTPException(status_code=409, detail=FROZEN.format(what="league group draw"))


# --------------------------------------------------------------------------
# Stages
# --------------------------------------------------------------------------


@app.post("/api/stage/super-six", response_model=TournamentState)
def open_super_six(
    payload: SuperSixPayload | None = None, editor: dict = Depends(auth.require_editor)
) -> dict[str, Any]:
    """Freeze the league and draw the two Super Six groups."""
    store = get_store()
    raw = store.load()
    state = present(raw)

    if raw.get("stage") not in (STAGE_LEAGUE, None):
        raise HTTPException(
            status_code=409,
            detail="The Super Six has already been drawn. Roll it back first if you need to redraw.",
        )
    if not state["league"]["complete"]:
        remaining = state["league"]["total"] - state["league"]["played"]
        raise HTTPException(
            status_code=400,
            detail=f"{remaining} league match(es) still to play. Finish the group stage first.",
        )

    try:
        seed, assignments = select_super_six(
            state["league"]["groups"], payload.seed if payload else None
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    fixtures = build_super_six_fixtures(
        assignments, start_no=len(raw.get("matches") or []) + 1
    )
    return present(store.save_super_six(seed, assignments, fixtures))


@app.post("/api/stage/playoffs", response_model=TournamentState)
def open_playoffs(editor: dict = Depends(auth.require_editor)) -> dict[str, Any]:
    """Freeze the Super Six and set up Qualifier 1, the Eliminator, Q2 and the Final."""
    store = get_store()
    raw = store.load()
    state = present(raw)

    if raw.get("stage") == STAGE_LEAGUE:
        raise HTTPException(status_code=400, detail="Draw the Super Six first.")
    if raw.get("stage") in (STAGE_PLAYOFFS, STAGE_DONE):
        raise HTTPException(status_code=409, detail="The playoffs are already under way.")
    if not state["super_six"]["complete"]:
        remaining = state["super_six"]["total"] - state["super_six"]["played"]
        raise HTTPException(
            status_code=400,
            detail=f"{remaining} Super Six match(es) still to play.",
        )

    fixtures = build_playoff_fixtures(start_no=len(raw.get("matches") or []) + 1)
    return present(store.save_playoffs(fixtures))


@app.post("/api/stage/rollback", response_model=TournamentState)
def rollback_stage(editor: dict = Depends(auth.require_editor)) -> dict[str, Any]:
    """Step back one stage, throwing away that stage's fixtures and results.
    Everything before it is untouched."""
    store = get_store()
    stage = store.load().get("stage") or STAGE_LEAGUE

    if stage in (STAGE_PLAYOFFS, STAGE_DONE):
        store.drop_stage(STAGE_PLAYOFFS)
        return present(store.set_stage(STAGE_SUPER_SIX))
    if stage == STAGE_SUPER_SIX:
        store.drop_stage(STAGE_PLAYOFFS)
        store.drop_stage(STAGE_SUPER_SIX)
        return present(store.set_stage(STAGE_LEAGUE))
    raise HTTPException(status_code=400, detail="The league stage is the first stage.")


# --------------------------------------------------------------------------
# Results
# --------------------------------------------------------------------------


@app.patch("/api/matches/{match_id}", response_model=TournamentState)
def patch_match(
    match_id: str, payload: ResultPayload, editor: dict = Depends(auth.require_editor)
) -> dict[str, Any]:
    store = get_store()
    raw = store.load()
    matches = raw.get("matches") or []
    match = next((m for m in matches if m["id"] == match_id), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found.")

    stage = raw.get("stage") or STAGE_LEAGUE
    match_stage = match.get("stage") or STAGE_LEAGUE
    if match_stage != stage and not (match_stage == STAGE_PLAYOFFS and stage == STAGE_DONE):
        raise HTTPException(
            status_code=409,
            detail=(
                f"The {STAGE_LABELS.get(match_stage, match_stage)} is frozen. "
                "Roll the tournament back if a result there really has to change."
            ),
        )

    # Playoff line-ups are worked out from earlier results, not stored.
    if match_stage == STAGE_PLAYOFFS:
        state = present(raw)
        resolved = next(
            (p for p in state["playoffs"]["matches"] if p["id"] == match_id), None
        )
        if resolved is None or not resolved["ready"]:
            raise HTTPException(
                status_code=400,
                detail=f"{PLAYOFF_NAMES.get(match.get('slot'), 'That match')} does not have both teams yet.",
            )
        sides = (resolved["team_a_id"], resolved["team_b_id"])
    else:
        sides = (match["team_a_id"], match["team_b_id"])

    winner = payload.winner_team_id

    if winner is None:
        store.update_match(match_id, None, None, False)
    else:
        if winner not in sides:
            raise HTTPException(
                status_code=400, detail="That team is not playing in this match."
            )
        if payload.coins is None:
            raise HTTPException(
                status_code=400,
                detail="Enter how many coins the losing team left on the board (0 if none).",
            )
        store.update_match(match_id, winner, payload.coins, payload.red_to_winner)

    # A changed playoff result rewrites who plays later, so clear what follows.
    if match_stage == STAGE_PLAYOFFS:
        following = downstream_slots(match.get("slot") or "")
        for other in matches:
            if other.get("slot") in following and other.get("played"):
                store.update_match(other["id"], None, None, False)

    raw = store.load()
    state = present(raw)
    champion = state["playoffs"]["champion"]
    if champion and raw.get("stage") == STAGE_PLAYOFFS:
        state = present(store.set_stage(STAGE_DONE))
    elif not champion and raw.get("stage") == STAGE_DONE:
        state = present(store.set_stage(STAGE_PLAYOFFS))
    return state
