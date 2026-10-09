-- ===========================================================
-- NC Carrom 2026 - database schema (plain Postgres)
--
-- The API runs this automatically on first start, so you do not
-- have to do anything. To create the tables by hand instead,
-- paste this into the Neon SQL Editor (or psql).
--
-- Partners are drawn on paper lots in the room; the finished pairs
-- are typed in here. The only thing the app draws is which group
-- each team lands in, so group_code / position / code stay empty
-- until the group draw runs.
-- ===========================================================

create table if not exists carrom_teams (
  id           uuid primary key,
  tournament   text not null default 'nc-carrom-2026',
  entry_no     integer not null,           -- the order the lots came out
  player1_name text not null,
  player2_name text not null,
  group_code   text,                       -- A | B | C | D | E (set by the draw)
  position     integer,                    -- 1 .. 5 within the group
  code         text,                       -- A1 .. E5
  created_at   timestamptz not null default now()
);

create table if not exists carrom_matches (
  id           uuid primary key,
  tournament   text not null default 'nc-carrom-2026',
  match_no     integer not null,
  group_code   text not null,
  round        integer not null,
  team_a_id    uuid not null,
  team_b_id    uuid not null,
  boards_a     integer,
  boards_b     integer,
  played       boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists carrom_draws (
  id           uuid primary key,
  tournament   text not null default 'nc-carrom-2026',
  seed         text not null,              -- replays the exact same group draw
  created_at   timestamptz not null default now()
);

create index if not exists carrom_teams_tournament_idx   on carrom_teams (tournament, entry_no);
create index if not exists carrom_matches_tournament_idx on carrom_matches (tournament, match_no);
create index if not exists carrom_draws_tournament_idx   on carrom_draws (tournament, created_at desc);
