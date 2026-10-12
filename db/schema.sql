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
  -- What the organiser enters at the board. The points and the PD are worked
  -- out from these three, never stored.
  winner_team_id uuid,                     -- null until the result is in
  coins          integer,                  -- coins the losing team left behind
  red_to_winner  boolean not null default false,  -- winner pocketed the queen
  played       boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Brings an existing database up to the current shape. Safe to re-run.
alter table carrom_matches add column if not exists winner_team_id uuid;
alter table carrom_matches add column if not exists coins integer;
alter table carrom_matches add column if not exists red_to_winner boolean not null default false;

create table if not exists carrom_draws (
  id           uuid primary key,
  tournament   text not null default 'nc-carrom-2026',
  seed         text not null,              -- replays the exact same group draw
  created_at   timestamptz not null default now()
);

-- Which stage the tournament is in. One row per tournament.
--   league     - the five groups, A to E
--   super_six  - two groups of six, Foxtrot and Golf
--   playoffs   - Qualifier 1, Eliminator, Qualifier 2, Final
--   done       - a champion has been crowned
create table if not exists carrom_stage (
  tournament      text primary key,
  stage           text not null default 'league',
  super_six_seed  text,
  updated_at      timestamptz not null default now()
);

create index if not exists carrom_teams_tournament_idx   on carrom_teams (tournament, entry_no);
create index if not exists carrom_matches_tournament_idx on carrom_matches (tournament, match_no);
create index if not exists carrom_draws_tournament_idx   on carrom_draws (tournament, created_at desc);

-- ---------------------------------------------------------------------
-- Brings an existing database up to the current shape. All additive and
-- safe to re-run - no league data is touched.
-- ---------------------------------------------------------------------

-- Where a team landed in the Super Six, once that draw has been made.
alter table carrom_teams add column if not exists super_group_code text;
alter table carrom_teams add column if not exists super_position integer;
alter table carrom_teams add column if not exists super_origin text;

-- Which stage a fixture belongs to, and which playoff it is.
alter table carrom_matches add column if not exists stage text not null default 'league';
alter table carrom_matches add column if not exists slot text;

-- Playoff fixtures exist before their teams are known, and have no group.
alter table carrom_matches alter column team_a_id drop not null;
alter table carrom_matches alter column team_b_id drop not null;
alter table carrom_matches alter column group_code drop not null;
