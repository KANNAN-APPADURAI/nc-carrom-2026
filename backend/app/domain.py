"""Group-draw logic: allocation, fixtures and standings.

Partners are paired in the room on paper lots - the app never does that.
It takes the finished teams and draws which group each one lands in.

Everything here is pure, so a draw can be replayed from its seed without
touching the database.
"""

from __future__ import annotations

import random
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

# Group A .. Group E, with the NATO call signs used on the boards.
GROUPS: list[tuple[str, str]] = [
    ("A", "Alpha"),
    ("B", "Bravo"),
    ("C", "Charlie"),
    ("D", "Delta"),
    ("E", "Echo"),
]
GROUP_CODES = [code for code, _ in GROUPS]
GROUP_NAMES = dict(GROUPS)

WIN_POINTS = 2
LOSS_POINTS = 0


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_seed() -> str:
    """A short, readable, announceable seed - e.g. 7F2A91."""
    return secrets.token_hex(3).upper()


def round_robin(team_ids: list[str]) -> list[list[tuple[str, str]]]:
    """Circle-method round robin: every team meets every other team once.

    With an odd number of teams one team sits out each round, which is exactly
    what a 5-team group needs: 5 rounds, 2 matches per round, 10 matches total.
    """
    slots: list[str | None] = list(team_ids)
    if len(slots) < 2:
        return []
    if len(slots) % 2:
        slots.append(None)

    size = len(slots)
    rounds: list[list[tuple[str, str]]] = []
    for r in range(size - 1):
        pairs: list[tuple[str, str]] = []
        for i in range(size // 2):
            home, away = slots[i], slots[size - 1 - i]
            if home is None or away is None:
                continue
            # Alternate sides each round so nobody always breaks first.
            pairs.append((home, away) if r % 2 == 0 else (away, home))
        rounds.append(pairs)
        slots = [slots[0], slots[-1], *slots[1:-1]]
    return rounds


def run_group_draw(
    teams: list[dict[str, Any]], seed: str | None = None
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    """Spread the entered teams over the five groups and build the fixtures.

    Returns (seed, teams, matches). The teams keep the ids they were entered
    with - only their group, position and code are filled in. The same seed
    with the same teams always reproduces the same draw, so it can be audited
    after the event.
    """
    seed = (seed or new_seed()).strip().upper()
    rng = random.Random(f"nc-carrom::{seed}::{len(teams)}")

    order = list(teams)
    rng.shuffle(order)

    filled: dict[str, int] = {code: 0 for code in GROUP_CODES}
    assigned: list[dict[str, Any]] = []
    for index, team in enumerate(order):
        group_code = GROUP_CODES[index % len(GROUP_CODES)]
        filled[group_code] += 1
        assigned.append(
            {
                "id": team["id"],
                "entry_no": team["entry_no"],
                "player1_name": team["player1_name"],
                "player2_name": team["player2_name"],
                "group_code": group_code,
                "position": filled[group_code],
                "code": f"{group_code}{filled[group_code]}",
            }
        )

    assigned.sort(key=lambda t: (GROUP_CODES.index(t["group_code"]), t["position"]))

    matches: list[dict[str, Any]] = []
    for group_code in GROUP_CODES:
        group_team_ids = [t["id"] for t in assigned if t["group_code"] == group_code]
        for round_no, round_pairs in enumerate(round_robin(group_team_ids), start=1):
            for team_a, team_b in round_pairs:
                matches.append(
                    {
                        "id": str(uuid.uuid4()),
                        "group_code": group_code,
                        "round": round_no,
                        "team_a_id": team_a,
                        "team_b_id": team_b,
                        "boards_a": None,
                        "boards_b": None,
                        "played": False,
                    }
                )

    for order_no, match in enumerate(matches, start=1):
        match["match_no"] = order_no

    return seed, assigned, matches


def compute_standings(
    teams: Iterable[dict[str, Any]], matches: Iterable[dict[str, Any]]
) -> list[dict[str, Any]]:
    """League table for one group, ordered the way a tournament board shows it."""
    table: dict[str, dict[str, Any]] = {}
    for team in teams:
        table[team["id"]] = {
            "team_id": team["id"],
            "code": team["code"],
            "position": team["position"],
            "players": [team["player1_name"], team["player2_name"]],
            "played": 0,
            "won": 0,
            "lost": 0,
            "boards_for": 0,
            "boards_against": 0,
            "board_diff": 0,
            "points": 0,
        }

    for match in matches:
        if not match.get("played"):
            continue
        a, b = table.get(match["team_a_id"]), table.get(match["team_b_id"])
        if a is None or b is None:
            continue
        boards_a = int(match.get("boards_a") or 0)
        boards_b = int(match.get("boards_b") or 0)

        for row, scored, conceded in ((a, boards_a, boards_b), (b, boards_b, boards_a)):
            row["played"] += 1
            row["boards_for"] += scored
            row["boards_against"] += conceded
            if scored > conceded:
                row["won"] += 1
                row["points"] += WIN_POINTS
            else:
                row["lost"] += 1
                row["points"] += LOSS_POINTS

    rows = list(table.values())
    for row in rows:
        row["board_diff"] = row["boards_for"] - row["boards_against"]

    rows.sort(
        key=lambda r: (-r["points"], -r["board_diff"], -r["boards_for"], r["position"])
    )
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
    return rows


def build_groups(
    teams: list[dict[str, Any]], matches: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Assemble the per-group payload the front end renders.

    Teams that have not been drawn yet (no group_code) simply do not appear.
    """
    groups = []
    for code, name in GROUPS:
        group_teams = sorted(
            (t for t in teams if t.get("group_code") == code),
            key=lambda t: t.get("position") or 0,
        )
        group_matches = sorted(
            (m for m in matches if m["group_code"] == code),
            key=lambda m: (m["round"], m.get("match_no", 0)),
        )
        groups.append(
            {
                "code": code,
                "name": name,
                "label": f"Group {code}",
                "teams": group_teams,
                "matches": group_matches,
                "standings": compute_standings(group_teams, group_matches),
                "played": sum(1 for m in group_matches if m.get("played")),
                "total_matches": len(group_matches),
            }
        )
    return groups
