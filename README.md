# NC Carrom 2026 – Road to the Red

The **nCompass Carrom Tournament 2026**, from the group stage to the trophy.

The 25 teams and the league draw are **settled and frozen** — they were made on
paper lots in the room and are now read-only. What's left runs in three stages,
each frozen before the next opens:

```
League Stage  ->  Super Six  ->  Playoffs
 5 groups          2 groups       Q1 · Eliminator · Q2 · Final
 50 matches        30 matches     4 matches
```

## League Stage

| Group | Call sign | Teams |
| ----- | --------- | ----- |
| A | Alpha   | A1 – A5 |
| B | Bravo   | B1 – B5 |
| C | Charlie | C1 – C5 |
| D | Delta   | D1 – D5 |
| E | Echo    | E1 – E5 |

Each group is a round robin: every team plays the other four, so 10 matches per
group and **50 in all**.

## Super Six — two groups of six

Twelve teams go through: **all five group winners, all five runners-up, and the
best two third-placed teams** (on points, then PD).

They split so that a league group's top two are *never* drawn together again:

- Three of the five groups are drawn at random. Those three send their **winner
  to Foxtrot** and their **runner-up to Golf**.
- The other two do the reverse — **winner to Golf**, **runner-up to Foxtrot**.
- The **best** third-placed team goes to Golf; the **second best** to Foxtrot,
  which balances Foxtrot's extra group winner.

| Group | Call sign | Make-up |
| ----- | --------- | ------- |
| F | Foxtrot | 3 winners · 2 runners-up · 2nd best 3rd |
| G | Golf    | 2 winners · 3 runners-up · best 3rd |

Each group plays a full round robin — 15 matches apiece, 30 in total.

## Playoffs — the IPL run-in

The top two of each Super Six group qualify.

| Match | Who | What's at stake |
| ----- | --- | --------------- |
| **Qualifier 1** | The two group winners | Winner goes straight to the final |
| **Eliminator** | The two runners-up | Loser is out |
| **Qualifier 2** | Q1 loser v Eliminator winner | Winner takes the last final place |
| **Final** | Q1 winner v Q2 winner | The trophy |

Qualifier 2 and the Final show their line-up as "Qualifier 1 loser" and so on
until the earlier results decide them. Changing an earlier result automatically
clears everything downstream of it.

---

## How to run it

```powershell
cd "C:\Carrom NC\group Generator\nc-carrom-2026"
.\start.ps1
```

That installs anything missing, starts both services and opens the site. First
run takes a minute or two; after that it's a few seconds.

If PowerShell blocks the script:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

### Two terminals instead

```powershell
# Terminal 1 - the API
cd "C:\Carrom NC\group Generator\nc-carrom-2026\backend"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# Terminal 2 - the site
cd "C:\Carrom NC\group Generator\nc-carrom-2026\frontend"
npm run dev
```

Then open **http://localhost:5173**.

> Only one API can hold port 8000. If you see
> `only one usage of each socket address`, an older one is still running —
> close that window first.

---

## Signing in

There is **no sign-up**, no user table and no password reset — just two accounts
in `backend\.env`:

```ini
# the organiser: enters results, runs the draws, moves the stages on
AUTH_USERNAME=admin
AUTH_PASSWORD=carrom2026          # <- change this

# everyone else: sees every screen, changes nothing
VIEWER_USERNAME=viewer
VIEWER_PASSWORD=nccarrom          # <- and this

SESSION_SECRET=<long random string>
SESSION_HOURS=12
```

> **Both passwords are still the placeholders that were filled in for you.**
> Change them in `backend\.env` and restart the API.

| | Organiser | Viewer |
| --- | --- | --- |
| Tables, fixtures, Super Six, bracket, podium | yes | yes |
| Enter or clear a result | yes | **no** |
| Draw the Super Six, open the playoffs, roll back | yes | **no** |

A viewer's session is marked **view only** at the top right, every Save and
Clear button disappears, and the API answers **403** to anything that writes —
so the lock holds even if someone pokes at the API directly. The role is signed
into the token: editing it to say `admin` breaks the signature and gets a 401.

Leave `VIEWER_USERNAME` or `VIEWER_PASSWORD` blank to switch the viewer account
off entirely.

A correct sign-in returns a signed token the browser keeps in `localStorage`, so
a refresh doesn't sign you out mid-session. It lasts `SESSION_HOURS` (default 12)
and renews each time the app loads. **Sign out** is at the top right.

`SESSION_SECRET` signs those tokens. Leave it blank and a new one is generated on
every API start, which signs everyone out on every restart. A fresh one:

```powershell
cd backend; .\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```

Everything except `/api/health` and `/api/login` needs a valid token. Five wrong
passwords in a row locks that machine out for a minute.

Every screen refreshes itself every 15 seconds, so a projector or a viewer's
phone keeps up without anyone touching it. It pauses while the tab is hidden and
while a save is in flight.

Leaving `AUTH_USERNAME` or `AUTH_PASSWORD` blank switches sign-in **off** — the
API warns loudly on startup and the footer reads `sign-in off`.

---

## Running the tournament

The three tabs are the three stages. Each shows its standings and its fixtures,
and results go in the same way everywhere.

### Entering a result

Tap the team that won, type how many coins the losing team left on the board, and
flip **Red** on if the *winner* pocketed it. The `+8 / -8` previews as you type.

- **Points** — 2 for a win, 0 for a loss.
- **PD** — the coins the loser left, **plus 5 if the winner took the red**. The
  winner gains that figure, the loser drops the same.
- The red in the **loser's** hands counts for nobody.

| At the board | Enter | Result |
| ------------ | ----- | ------ |
| Winner took the red, 3 coins left | winner, `3`, Red **on** | `+8` / `-8` |
| **Loser** took the red, lost by 3 | winner, `3`, Red **off** | `+3` / `-3` |
| Red fell to the winner, 1 coin left | winner, `1`, Red **on** | `+6` / `-6` |

A group's PD column always sums to zero — a quick way to spot a mistyped result.
`Pts` decides the table, `PD` breaks ties, and the queen column counts the reds a
team won with.

The red is worth `QUEEN_POINTS = 5` in `backend/app/domain.py`, with a matching
constant in `frontend/src/constants.js`. Change both if your house rules differ.

### Moving between stages

Each stage has to be finished before the next opens, and once you move on, the
one behind is **frozen** — its results can no longer be edited and its tab shows
a frozen badge.

1. **League Stage** — play all 50. When they are in, the Super Six tab shows the
   third-place table and unlocks **Draw the Super Six**.
2. **Super Six** — the draw deals Foxtrot and Golf and builds 30 fixtures. Play
   them all, then **Freeze & open the playoffs**.
3. **Playoffs** — the bracket fills itself in as results land. Win the final and
   the champions are crowned on screen.

Both draws take an optional **seed**. Announce it to the room before you press
the button and anyone can reproduce the identical draw afterwards.

### If you advance by mistake

`POST /api/stage/rollback` steps back exactly one stage, throwing away that
stage's fixtures and results and leaving everything before it untouched:

```powershell
$h = @{ Authorization = "Bearer <your token>" }
Invoke-RestMethod http://127.0.0.1:8000/api/stage/rollback -Method Post -Headers $h
```

Rolling back from the Super Six to the league keeps all 25 teams and every league
result — only the Super Six draw and its matches go.

---

## The Neon database

`backend\.env` holds your connection string:

```ini
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-...-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

Four tables, created and migrated automatically on first start (or run
[`db/schema.sql`](db/schema.sql) in the Neon SQL Editor yourself — it is all
`IF NOT EXISTS` and safe to re-run):

| Table | Holds |
| ----- | ----- |
| `carrom_teams` | The 25 pairs, their league group, and their Super Six seat once drawn |
| `carrom_matches` | Every fixture, tagged with its `stage` and (for playoffs) its `slot`. `winner_team_id`, `coins` and `red_to_winner` are what you enter; points and PD are worked out from them, never stored |
| `carrom_draws` | The league draw seed |
| `carrom_stage` | Which stage the tournament is in, and the Super Six seed |

Check which store is live:

```powershell
(Invoke-RestMethod http://127.0.0.1:8000/api/health).storage   # -> postgres
```

It is in the site footer too. `backend\.env` is gitignored — don't commit it.

### Leftovers you can drop

Nothing reads these any more. They are from earlier versions of the app and hold
only sample data:

```sql
drop table carrom_matches_v1, carrom_teams_v1, carrom_players_v1;
alter table carrom_matches drop column points_a, drop column points_b;
```

---

## How it's put together

```
nc-carrom-2026/
├── start.ps1              one-command start
├── db/schema.sql          tables + migrations, applied on every start
├── backend/               FastAPI
│   ├── app/domain.py      standings, the Super Six draw, the bracket
│   ├── app/store.py       Neon / Supabase / local-JSON stores
│   ├── app/auth.py        sign-in, session tokens, lockout
│   ├── app/main.py        the API
│   └── .env.example
└── frontend/              React + Vite
    ├── src/App.jsx
    ├── src/auth.js        the stored session
    ├── src/styles.css     the whole look
    └── src/components/
        ├── StageRibbon.jsx    the road through the tournament
        ├── GroupsPanel.jsx    standings, any stage
        ├── FixturesPanel.jsx  fixtures and result entry, any stage
        ├── SuperSixPanel.jsx  qualification, the draw, the two groups
        ├── PlayoffsPanel.jsx  the bracket and the champions
        └── SignIn.jsx
```

**React -> FastAPI -> Neon.** The browser never talks to the database; the
connection string stays on the server. In development Vite proxies `/api` to port
8000, so there is one origin and no CORS to think about.

Every write endpoint returns the complete tournament state, so the UI never has
to guess what changed.

### API

| Method | Path | Auth | Does |
| ------ | ---- | ---- | ---- |
| `GET` | `/api/health` | public | Which store is live, and whether sign-in is on |
| `POST` | `/api/login` | public | Swap the credentials for a session token |
| `GET` | `/api/session` | token | Check a stored token and slide its expiry on |
| `GET` | `/api/state` | token | Every stage: teams, tables, fixtures, bracket |
| `POST` | `/api/stage/super-six` | organiser | Freeze the league and draw Foxtrot and Golf |
| `POST` | `/api/stage/playoffs` | organiser | Freeze the Super Six and set the bracket |
| `POST` | `/api/stage/rollback` | organiser | Step back one stage |
| `PATCH` | `/api/matches/{id}` | organiser | Save or clear a result |
| `PUT` | `/api/teams` | organiser | **409** — the team list is final |
| `POST`/`DELETE` | `/api/draw` | organiser | **409** — the league draw is final |

Send the token as `Authorization: Bearer <token>`. Rows marked *organiser*
answer **403** to a viewer's token; the four stage endpoints above are organiser
-only too.

Interactive docs while the API runs: **http://127.0.0.1:8000/docs**

### The draws

Both draws seed a `random.Random` from an announceable string, so either can be
replayed and checked afterwards. Fixtures use the circle method, which gives a
5-team group 5 rounds of 2 matches and a 6-team group 5 rounds of 3.

Playoff fixtures store no team ids at all — who is playing whom is worked out
from the Super Six tables and the results already entered, every time the state
is read. That is why a corrected Qualifier 1 result cleanly rewrites the rest of
the bracket instead of leaving a stale line-up behind.

---

## Notes

- **Editing a frozen stage** is refused with a 409. Roll back if a result really
  has to change.
- **Deploying it:** `npm run build` in `frontend\` and serve `dist/`. Set
  `VITE_API_URL` to the deployed API and add that origin to `CORS_ORIGINS` in
  `backend\.env`.
- Supabase is still supported as an alternative store — fill in `SUPABASE_URL` +
  `SUPABASE_SERVICE_KEY` instead of `DATABASE_URL` and `pip install supabase`.
