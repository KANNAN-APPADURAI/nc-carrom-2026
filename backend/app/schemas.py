"""Request and response models."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


def _clean_name(value: Any) -> str:
    return " ".join(str(value).split())[:60]


class LoginPayload(BaseModel):
    username: str = Field(max_length=120)
    password: str = Field(max_length=200)


class Session(BaseModel):
    token: str
    username: str
    role: str = "admin"
    expires_at: int


class TeamInput(BaseModel):
    """One finished pair, as drawn on the paper lots."""

    player1: str = Field(max_length=80)
    player2: str = Field(max_length=80)

    @field_validator("player1", "player2")
    @classmethod
    def clean(cls, value: str) -> str:
        name = _clean_name(value)
        if not name:
            raise ValueError("Both partners need a name")
        return name


class TeamsPayload(BaseModel):
    teams: list[TeamInput] = Field(default_factory=list, max_length=60)


class DrawPayload(BaseModel):
    seed: str | None = Field(default=None, max_length=24)

    @field_validator("seed")
    @classmethod
    def clean(cls, seed: str | None) -> str | None:
        if seed is None:
            return None
        return seed.strip().upper() or None


class SuperSixPayload(DrawPayload):
    """Same shape as the league draw: an optional announceable seed."""


class ResultPayload(BaseModel):
    """What the organiser saw at the board.

    ``winner_team_id`` of None clears the result. ``coins`` has no cap worth
    hitting - the bound only stops a stray keypress becoming a four-figure PD.
    """

    winner_team_id: str | None = None
    coins: int | None = Field(default=None, ge=0, le=9999)
    red_to_winner: bool = False


class Team(BaseModel):
    id: str
    entry_no: int
    player1_name: str
    player2_name: str
    group_code: str | None = None
    position: int | None = None
    code: str | None = None
    super_group_code: str | None = None
    super_position: int | None = None
    super_origin: str | None = None


class Match(BaseModel):
    id: str
    match_no: int
    group_code: str
    round: int
    team_a_id: str
    team_b_id: str
    winner_team_id: str | None = None
    coins: int | None = None
    red_to_winner: bool = False
    played: bool = False


class DrawInfo(BaseModel):
    seed: str
    created_at: str


class TournamentState(BaseModel):
    title: str
    subtitle: str
    storage: str
    role: str
    can_edit: bool
    stage: str
    stage_label: str
    stages: list[dict[str, Any]]
    teams: list[Team]
    league: dict[str, Any]
    super_six: dict[str, Any]
    playoffs: dict[str, Any]
    draw: DrawInfo | None = None
    stats: dict[str, int]
