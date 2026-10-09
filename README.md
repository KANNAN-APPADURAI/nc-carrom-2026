# NC Carrom 2026 – Team Selection!

Group draw and group stage for the **nCompass Carrom Tournament 2026**.

**Partners are paired in the room, on paper lots.** A name comes out of the hat,
that player walks up and draws their partner. You type the finished pair into the
site. Once all 25 teams are in, the app draws the only thing left to chance:
**which group each team lands in**.

| Group | Call sign | Teams |
| ----- | --------- | ----- |
| A | Alpha   | A1 – A5 |
| B | Bravo   | B1 – B5 |
| C | Charlie | C1 – C5 |
| D | Delta   | D1 – D5 |
| E | Echo    | E1 – E5 |

Each group is a round robin: every team plays the other four, so 10 matches per
group and **50 group matches** in all.

---

## How to run it

```powershell
cd "C:\Carrom NC\group Generator\nc-carrom-2026"
.\start.ps1
```

That installs anything missing, starts both services and opens the site. First run
takes a minute or two; after that it's a few seconds.

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

## On the day

### 1. Teams — type the lots in as they come out

The **Teams** tab is the entry screen. The big card at the top takes the two names
from the lot just drawn:

```
 Lot      [ First name out of the hat ]  &  [ Partner they drew ]     [ Add team ]
 07
```

Type the first name, <kbd>Tab</kbd>, type the partner, <kbd>Enter</kbd>. It drops
into the list below and the cursor jumps back, ready for the next lot. The badge
counts up, so it always shows which lot you're on.

- **Every team is saved to Neon the moment you add it.** No save button to forget,
  nothing lost if the laptop sleeps or the browser reloads mid-ceremony. The tag
  next to the toolbar shows *Saving… / Saved automatically*.
- **Fix a typo** by clicking straight into any name in the list.
- **Remove a team** with the × on its row.
- **A name entered twice** turns the row red and blocks the save — add an initial
  to tell two Ravis apart.
- **Paste a list** if the pairs were recorded on paper first: one team per line,
  `Kannan & Ravi` (or a comma, a tab, or `and`). This replaces the whole list.
- **Fill sample teams** loads 25 fake pairs if you want to rehearse the evening.

### 2. The Draw — deal the groups

Press **Draw the groups**. The board spins, then the five groups fill column by
column, a team at a time, and finish with a burst of coin confetti.

*Optional:* open **Use a fixed seed** first and type something like `NCOMPASS26`.
Announce it to the room before you press the button, and anyone can reproduce the
identical groups afterwards — proof that nothing was rigged. Leave it blank and a
random seed is generated and shown on the result strip.

**Redraw** throws the groups away and deals again from the same teams. It asks
first. Your entered pairs are never touched by a redraw.

### 3. Groups — the standings

Five colour-coded tables. Win = 2 points; ties split by board difference, then
boards won. The top 2 of each group are highlighted as qualifying. Built to be
readable from across a room if you put it on a projector.

### 4. Fixtures — enter results

Pick a group, then for each match set the boards each team won (best of 3) and
save. Standings update immediately. Click a saved score to correct it, or
**Clear** to undo it.

To change the scoring, edit `backend/app/domain.py` — `WIN_POINTS` and the sort
in `compute_standings`.

> Changing the team list **after** the groups are drawn clears the groups,
> fixtures and results, because the draw no longer describes the teams. The site
> warns you and makes you press **Save teams & clear the draw** on purpose — the
> autosave switches itself off once a draw exists.

---

## The Neon database

`backend\.env` holds your connection string:

```ini
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-...-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

Three tables, created automatically on first start (or run
[`db/schema.sql`](db/schema.sql) in the Neon SQL Editor yourself):

| Table | Holds |
| ----- | ----- |
| `carrom_teams` | The pairs you type in. `group_code` / `position` / `code` stay empty until the draw fills them |
| `carrom_matches` | The 50 group fixtures and their scores |
| `carrom_draws` | The seed, so any draw can be replayed |

Check which store is live:

```powershell
(Invoke-RestMethod http://127.0.0.1:8000/api/health).storage   # -> postgres
```

It's in the site footer too. `backend\.env` is gitignored — don't commit it.

### About the `*_v1` tables

The first version of this app paired players itself, so its tables had a different
shape. Rather than dropping them, they were renamed and left in place:

`carrom_players_v1` (50 rows) · `carrom_teams_v1` (25) · `carrom_matches_v1` (50)

That's all sample data from trying the site out. Nothing reads them any more, so
drop them whenever you like:

```sql
drop table carrom_matches_v1, carrom_teams_v1, carrom_players_v1;
```

---

## How it's put together

```
nc-carrom-2026/
├── start.ps1              one-command start
├── db/schema.sql          Postgres tables (auto-applied on first run)
├── backend/               FastAPI
│   ├── app/domain.py      group draw, round robin, standings
│   ├── app/store.py       Neon / Supabase / local-JSON stores
│   ├── app/main.py        the API
│   └── .env.example
└── frontend/              React + Vite
    ├── src/App.jsx
    ├── src/styles.css     the whole look
    └── src/components/
        ├── TeamsPanel.jsx     entering the lots
        ├── DrawPanel.jsx      the group draw + reveal
        ├── GroupsPanel.jsx    standings
        └── FixturesPanel.jsx  results
```

**React → FastAPI → Neon.** The browser never talks to the database; the
connection string stays on the server. In development Vite proxies `/api` to port
8000, so there's one origin and no CORS to think about.

Every write endpoint returns the complete tournament state, so the UI never has to
guess what changed.

### API

| Method | Path | Does |
| ------ | ---- | ---- |
| `GET` | `/api/health` | Which store is live |
| `GET` | `/api/state` | Teams, groups, fixtures, standings |
| `PUT` | `/api/teams` | Save the team list (clears any existing draw) |
| `POST` | `/api/draw` | Draw the groups, optional `{"seed": "..."}` |
| `DELETE` | `/api/draw` | Undo the draw, keep the teams |
| `PATCH` | `/api/matches/{id}` | Save or clear a result |

Interactive docs while the API runs: **http://127.0.0.1:8000/docs**

### The draw

`run_group_draw` seeds a `random.Random`, shuffles the entered teams, then deals
them round-robin into A–E so the groups stay even. Teams keep the ids they were
entered with — the draw only fills in group, position and code, which is why
clearing a draw leaves your pairs intact. Fixtures use the circle method, giving a
5-team group exactly 5 rounds of 2 matches with one team resting each round.

---

## Notes

- **Not exactly 25 teams?** Anything from 10 up works; the groups just end up
  uneven (24 teams → 5/5/5/5/4).
- **Deploying it:** `npm run build` in `frontend\` and serve `dist/`. Set
  `VITE_API_URL` to the deployed API and add that origin to `CORS_ORIGINS` in
  `backend\.env`.
- Supabase is still supported — fill in `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
  instead of `DATABASE_URL` and `pip install supabase==2.11.0`.
