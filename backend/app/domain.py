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

# The Super Six: two groups of six, carrying on down the NATO alphabet.
SUPER_GROUPS: list[tuple[str, str]] = [("F", "Foxtrot"), ("G", "Golf")]
SUPER_GROUP_CODES = [code for code, _ in SUPER_GROUPS]
SUPER_GROUP_NAMES = dict(SUPER_GROUPS)

# The IPL-style run-in.
PLAYOFF_SLOTS: list[tuple[str, str, str]] = [
    ("q1", "Qualifier 1", "The two Super Six winners. Win here and you are in the final."),
    ("eliminator", "Eliminator", "The two runners-up. Lose here and you are out."),
    ("q2", "Qualifier 2", "The Qualifier 1 loser against the Eliminator winner."),
    ("final", "Final", "Qualifier 1 winner against the Qualifier 2 winner."),
]
PLAYOFF_ORDER = [slot for slot, _, _ in PLAYOFF_SLOTS]
PLAYOFF_NAMES = {slot: name for slot, name, _ in PLAYOFF_SLOTS}

STAGE_LEAGUE = "league"
STAGE_SUPER_SIX = "super_six"
STAGE_PLAYOFFS = "playoffs"
STAGE_DONE = "done"
STAGE_ORDER = [STAGE_LEAGUE, STAGE_SUPER_SIX, STAGE_PLAYOFFS, STAGE_DONE]

# Scoring
# -------
# Two separate things, the way a cricket group table keeps points and net run
# rate apart:
#
#   Points - 2 for a win, 0 for a loss. Nothing else moves them.
#   PD     - the coins the losing team left on the board, plus the queen if the
#            WINNER pocketed it. The winner gains that figure and the loser
#            drops exactly the same figure, so a match always nets to zero.
#
# The queen taken by the LOSING team is worth nothing to anybody: it neither
# adds to the winner nor spares the loser.
#
#   winner takes the red, 3 coins left -> +8 and -8
#   loser  takes the red, 3 coins left -> +3 and -3
WIN_POINTS = 2
LOSS_POINTS = 0
QUEEN_POINTS = 5  # the red


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
                        "stage": STAGE_LEAGUE,
                        "slot": None,
                        "group_code": group_code,
                        "round": round_no,
                        "team_a_id": team_a,
                        "team_b_id": team_b,
                        "winner_team_id": None,
                        "coins": None,
                        "red_to_winner": False,
                        "played": False,
                    }
                )

    for order_no, match in enumerate(matches, start=1):
        match["match_no"] = order_no

    return seed, assigned, matches


def match_pd(match: dict[str, Any]) -> int:
    """What the winner of this match banks: coins left, plus the red if theirs."""
    coins = int(match.get("coins") or 0)
    return coins + (QUEEN_POINTS if match.get("red_to_winner") else 0)


def loser_of(match: dict[str, Any]) -> str | None:
    winner = match.get("winner_team_id")
    if winner == match["team_a_id"]:
        return match["team_b_id"]
    if winner == match["team_b_id"]:
        return match["team_a_id"]
    return None


def compute_standings(
    teams: Iterable[dict[str, Any]], matches: Iterable[dict[str, Any]]
) -> list[dict[str, Any]]:
    """League table for one group, ordered the way a tournament board shows it.

    Points decide it (2 a win); PD breaks ties the way net run rate does.
    """
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
            "points": 0,
            "pd": 0,
            "reds": 0,
        }

    for match in matches:
        if not match.get("played"):
            continue
        winner = table.get(match.get("winner_team_id"))
        loser = table.get(loser_of(match))
        if winner is None or loser is None:
            continue

        difference = match_pd(match)  # coins, plus the red if the winner took it

        winner["played"] += 1
        winner["won"] += 1
        winner["points"] += WIN_POINTS
        winner["pd"] += difference
        if match.get("red_to_winner"):
            winner["reds"] += 1

        loser["played"] += 1
        loser["lost"] += 1
        loser["points"] += LOSS_POINTS
        loser["pd"] -= difference

    rows = list(table.values())
    rows.sort(key=lambda r: (-r["points"], -r["pd"], r["position"]))
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
    return rows


def stage_view(team: dict[str, Any], stage: str) -> dict[str, Any]:
    """A team as it appears in one stage: its code and seat in that stage."""
    if stage == STAGE_LEAGUE:
        return team
    code = team.get("super_group_code")
    position = team.get("super_position")
    return {
        **team,
        "code": f"{code}{position}" if code and position else None,
        "position": position,
        "group_code": code,
    }


def build_groups(
    teams: list[dict[str, Any]],
    matches: list[dict[str, Any]],
    stage: str = STAGE_LEAGUE,
) -> list[dict[str, Any]]:
    """Assemble the per-group payload the front end renders for one stage.

    Teams that have not been drawn into this stage simply do not appear.
    """
    definitions = GROUPS if stage == STAGE_LEAGUE else SUPER_GROUPS
    views = [stage_view(team, stage) for team in teams]

    groups = []
    for code, name in definitions:
        group_teams = sorted(
            (t for t in views if t.get("group_code") == code),
            key=lambda t: t.get("position") or 0,
        )
        group_matches = sorted(
            (m for m in matches if m.get("stage", STAGE_LEAGUE) == stage and m.get("group_code") == code),
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


# --------------------------------------------------------------------------
# Super Six
# --------------------------------------------------------------------------

# The Super Six groups were drawn on paper lots in the room, the same way the
# partners and the league groups were. These are the entry numbers that came
# out of the bag, in the order they were pulled - the app only looks the names
# up and seats them. Nothing here is random.
SUPER_SIX_ENTRIES: dict[str, list[int]] = {
    "F": [8, 9, 16, 2, 5, 21],
    "G": [15, 10, 17, 24, 25, 19],
}

# There is no seed to replay: this draw happened on paper, not in code.
HAND_DRAWN = "ROOM LOTS"

ORDINALS = {1: "winner", 2: "runner-up", 3: "3rd place", 4: "4th place", 5: "5th place"}


def third_placed_table(league_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Every group's third-placed team, best first, on points then PD."""
    rows = []
    for group in league_groups:
        for row in group["standings"]:
            if row["rank"] == 3:
                rows.append({**row, "from_group": group["code"], "from_name": group["name"]})
    rows.sort(key=lambda r: (-r["points"], -r["pd"], r["code"]))
    return rows


def league_origins(league_groups: list[dict[str, Any]]) -> dict[str, str]:
    """How each team finished its league group, as one line for its card.

    A group nobody has played yet is skipped: its standings are only the draw
    order, and calling a team the winner of it would be a lie on the board.
    """
    thirds = {
        row["team_id"]: index
        for index, row in enumerate(third_placed_table(league_groups))
    }
    origins: dict[str, str] = {}
    for group in league_groups:
        if not group.get("played"):
            continue
        for row in group["standings"]:
            place = ORDINALS.get(row["rank"], f"{row['rank']}th place")
            label = f"Group {group['code']} {place}"
            if row["rank"] == 3:
                seat = thirds.get(row["team_id"])
                if seat == 0:
                    label = f"Best 3rd (Group {group['code']})"
                elif seat == 1:
                    label = f"2nd best 3rd (Group {group['code']})"
            origins[row["team_id"]] = label
    return origins


def super_six_plan(
    teams: list[dict[str, Any]], league_groups: list[dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    """The hand-drawn Super Six as twelve named seats.

    Shown on the board before the stage opens, so the room can check the slips
    against the screen, and used to seat the two groups when it does open.
    """
    by_entry = {team["entry_no"]: team for team in teams if team.get("entry_no") is not None}
    origins = league_origins(league_groups or [])

    plan = []
    for code, name in SUPER_GROUPS:
        seats = []
        for position, entry_no in enumerate(SUPER_SIX_ENTRIES[code], start=1):
            team = by_entry.get(entry_no)
            seats.append(
                {
                    "entry_no": entry_no,
                    "position": position,
                    "code": f"{code}{position}",
                    "team_id": team["id"] if team else None,
                    "league_code": team.get("code") if team else None,
                    "players": [team["player1_name"], team["player2_name"]] if team else [],
                    "origin": origins.get(team["id"]) if team else None,
                }
            )
        plan.append({"code": code, "name": name, "label": f"Group {code}", "seats": seats})
    return plan


def select_super_six(
    teams: list[dict[str, Any]], league_groups: list[dict[str, Any]]
) -> tuple[str, list[dict[str, Any]]]:
    """Seat the twelve teams the room drew into Foxtrot and Golf.

    Nothing is drawn here. ``SUPER_SIX_ENTRIES`` is what came out of the bag;
    this turns those entry numbers into team ids and notes how each team
    qualified, so the line-up on screen matches the slips on the table.
    """
    plan = super_six_plan(teams, league_groups)

    assignments: list[dict[str, Any]] = []
    missing: list[int] = []
    for group in plan:
        for seat in group["seats"]:
            if seat["team_id"] is None:
                missing.append(seat["entry_no"])
                continue
            assignments.append(
                {
                    "team_id": seat["team_id"],
                    "super_group_code": group["code"],
                    "super_position": seat["position"],
                    "super_origin": seat["origin"] or f"Entry {seat['entry_no']}",
                }
            )

    if missing:
        numbers = ", ".join(str(number) for number in missing)
        raise ValueError(f"No team was entered with number {numbers}.")
    if len({a["team_id"] for a in assignments}) != len(assignments):
        raise ValueError("The same team is listed twice in the Super Six groups.")

    return HAND_DRAWN, assignments


def build_super_six_fixtures(
    assignments: list[dict[str, Any]], start_no: int = 1
) -> list[dict[str, Any]]:
    """A full round robin inside each Super Six group - 15 matches apiece."""
    matches: list[dict[str, Any]] = []
    for super_code in SUPER_GROUP_CODES:
        ids = [
            a["team_id"]
            for a in sorted(
                (a for a in assignments if a["super_group_code"] == super_code),
                key=lambda a: a["super_position"],
            )
        ]
        for round_no, pairs in enumerate(round_robin(ids), start=1):
            for team_a, team_b in pairs:
                matches.append(
                    {
                        "id": str(uuid.uuid4()),
                        "stage": STAGE_SUPER_SIX,
                        "slot": None,
                        "group_code": super_code,
                        "round": round_no,
                        "team_a_id": team_a,
                        "team_b_id": team_b,
                        "winner_team_id": None,
                        "coins": None,
                        "red_to_winner": False,
                        "played": False,
                    }
                )
    for offset, match in enumerate(matches):
        match["match_no"] = start_no + offset
    return matches


# --------------------------------------------------------------------------
# Playoffs
# --------------------------------------------------------------------------


def build_playoff_fixtures(start_no: int = 1) -> list[dict[str, Any]]:
    """The four knockout fixtures. Their teams are worked out as results land."""
    return [
        {
            "id": str(uuid.uuid4()),
            "stage": STAGE_PLAYOFFS,
            "slot": slot,
            "group_code": None,
            "round": index,
            "match_no": start_no + index - 1,
            "team_a_id": None,
            "team_b_id": None,
            "winner_team_id": None,
            "coins": None,
            "red_to_winner": False,
            "played": False,
        }
        for index, (slot, _, _) in enumerate(PLAYOFF_SLOTS, start=1)
    ]


def resolve_playoffs(
    super_groups: list[dict[str, Any]], playoff_matches: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Fill in who is playing whom, from the Super Six tables and the results
    already entered. Anything not yet decided comes back as a label only."""
    by_slot = {m.get("slot"): m for m in playoff_matches}
    foxtrot = next((g for g in super_groups if g["code"] == "F"), None)
    golf = next((g for g in super_groups if g["code"] == "G"), None)

    def seat(group, index):
        if not group:
            return None
        standings = group["standings"]
        if len(standings) <= index or group["played"] < group["total_matches"]:
            return None
        return standings[index]["team_id"]

    sources = {
        "q1": (("Foxtrot winner", seat(foxtrot, 0)), ("Golf winner", seat(golf, 0))),
        "eliminator": (
            ("Foxtrot runner-up", seat(foxtrot, 1)),
            ("Golf runner-up", seat(golf, 1)),
        ),
    }

    q1 = by_slot.get("q1") or {}
    eliminator = by_slot.get("eliminator") or {}

    # A playoff row stores no team ids - its two sides are worked out here -
    # so the loser has to be read off the resolved pair, not off the row.
    (_, q1_a), (_, q1_b) = sources["q1"]
    q1_winner = q1.get("winner_team_id") if q1.get("played") else None
    q1_loser = None
    if q1_winner and q1_a and q1_b:
        q1_loser = q1_b if q1_winner == q1_a else q1_a

    eliminator_winner = eliminator.get("winner_team_id") if eliminator.get("played") else None

    sources["q2"] = (
        ("Qualifier 1 loser", q1_loser),
        ("Eliminator winner", eliminator_winner),
    )

    q2 = by_slot.get("q2") or {}
    q2_winner = q2.get("winner_team_id") if q2.get("played") else None
    sources["final"] = (
        ("Qualifier 1 winner", q1_winner),
        ("Qualifier 2 winner", q2_winner),
    )

    resolved = []
    for slot, name, blurb in PLAYOFF_SLOTS:
        # Before the stage opens there is no row yet, but the bracket is still
        # shown - as empty boxes labelled with where each side will come from.
        match = by_slot.get(slot) or {
            "id": None,
            "slot": slot,
            "stage": STAGE_PLAYOFFS,
            "match_no": None,
            "round": None,
            "group_code": None,
            "winner_team_id": None,
            "coins": None,
            "red_to_winner": False,
            "played": False,
        }
        (label_a, team_a), (label_b, team_b) = sources[slot]
        resolved.append(
            {
                **match,
                "name": name,
                "blurb": blurb,
                "team_a_id": team_a,
                "team_b_id": team_b,
                "source_a": label_a,
                "source_b": label_b,
                "ready": bool(team_a and team_b),
                "live": bool(match.get("id")),
            }
        )
    return resolved


def resolved_loser(match: dict[str, Any]) -> str | None:
    """The beaten team of an already-resolved playoff tie."""
    winner = match.get("winner_team_id")
    if not match.get("played") or not winner:
        return None
    team_a, team_b = match.get("team_a_id"), match.get("team_b_id")
    if not team_a or not team_b:
        return None
    return team_b if winner == team_a else team_a


def podium(playoffs: list[dict[str, Any]]) -> dict[str, str | None]:
    """Who finished where, once the ties that decide it have been played.

    Third place is the Qualifier 2 loser: they were one win from the final.
    The Eliminator loser goes out in fourth.
    """
    by_slot = {p["slot"]: p for p in playoffs}
    final = by_slot.get("final", {})
    q2 = by_slot.get("q2", {})
    eliminator = by_slot.get("eliminator", {})
    return {
        "champion": final.get("winner_team_id") if final.get("played") else None,
        "runner_up": resolved_loser(final),
        "third_place": resolved_loser(q2),
        "eliminated": resolved_loser(eliminator),
    }


def downstream_slots(slot: str) -> list[str]:
    """Playoffs whose line-up depends on this one."""
    return {
        "q1": ["q2", "final"],
        "eliminator": ["q2", "final"],
        "q2": ["final"],
        "final": [],
    }.get(slot, [])
