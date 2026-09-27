# Valuation service

A small Python job, separate from the NestJS API, that **trains** the model
behind **Become Pro**: a signed-in user logs their own games, and the app prices
the season against the published NBA rookie salary scale and shows which real
NBA rookies it most resembles.

The work is split in two:

| Where | What | When |
| --- | --- | --- |
| `apps/valuation` (this job) | Fits the model on real NBA rookie seasons and writes one `ProspectValuationModel` row: coefficients, rookie scale, level factors, interval widths and the comparable rookies. | On demand, or on a schedule after new NBA games are ingested. |
| `apps/api` (`src/become-pro/`) | Applies the newest model to a user's season and stores a `ProspectValuation` row. | Every time the user adds, edits or removes a game or changes the season's details — and on the next read after a new model is trained. |

The API applies the model rather than this job because a figure has to change
the moment a user logs a game, and only the always-on API can do that. Every
parameter the API needs is shipped inside the model bundle, so it is defined
once, here.

```bash
cd apps/valuation
python -m venv .venv && . .venv/Scripts/activate   # or bin/activate on POSIX
pip install -r requirements.txt
cp .env.example .env                                # point DATABASE_URL at Postgres
python train_valuation_model.py
pytest                                              # unit tests, no database needed
```

`db.py` reads **only** `apps/valuation/.env` (or a `DATABASE_URL` already set in
the environment). It never walks up to the repository's root `.env`, which
points at production.

Until the first model is trained, a season with ten or more games shows
"the valuation model has not been trained yet" rather than a figure.

## Become Pro is private

A user's seasons, games and valuations are visible only to that user. There
is no leaderboard, no public profile and no comparison between users — only
between a user and real NBA players. That is why nothing a user logs is
verified: a self-reported figure only ever reaches the person who reported it.

## What the model actually claims

Read this before trusting a figure.

There is **no salary, contract or market-value data anywhere in this project**,
and `nba_api` exposes none. So "what is this player worth" cannot be answered
directly. What *can* be answered is "what would this player sign for entering
the league", because the NBA rookie scale is small, fixed and public.

The model therefore predicts a **draft slot**, and the slot is looked up in
`rookie_scale.py`. The slot is what was computed; the dollars are its published
consequence. That is why the page prints the scale year next to every figure and
leads with the pick rather than the money.

### The inversion, stated plainly

The model is **not** trained on "amateur season → draft slot". No such dataset
exists here — nothing in this database pairs a college or high-school season
with what happened to that player in the draft.

What this database does have is NBA players' **rookie production**
(`PlayerGameStat`) alongside the pick they were taken at (`Player.draftNumber`).
So `draft_slot_model.py` fits draft slot against rookie production among players
who were actually drafted. The API then scores a user's level-adjusted line on
the same production index and reports the slot whose rookie year it most
resembles.

The training rows are exactly:

- players with a `draftYear` and `draftNumber`,
- in their **rookie regular season**, derived from `draftYear` (a 2023 draftee's
  rookie season is 2023-24) — never "the earliest season on record", which for
  a veteran is some prime season years into their career,
- from **published** games only (no ingestion batch pending review, running,
  failed or rejected — the same rule the API applies to every public figure),
- with at least 20 games, because a five-game rookie year says more about
  injury than about draft position.

The same rows become the comparable players, so every NBA player shown beside
a user's season is a real rookie whose real line helped train the model.

Real limitations of all this, none of which the page hides:

- It answers *"which pick's rookie year does this line most resemble"*, not
  *"where would this player be drafted"* — which also turns on age, size,
  athleticism, position scarcity and scouting this database has none of.
- It is fitted on players who *were* drafted, so it says little that is
  reliable about lines far below the weakest rookie season in the data.
- Rookie minutes are partly a *consequence* of draft position: high picks play
  more because they were high picks. The model cannot fully remove that.
- The training set is only as large as the seasons ingested. Each season adds
  one draft class (roughly 35–50 usable rookies).
- Ingestion only keeps players on a current roster, so draftees who have since
  left the league are missing from older classes. Those tend to be the weaker
  rookie seasons, which leans the fit towards players who stuck — the older
  the class, the stronger the lean.

Every run prints its in-sample MAE (in picks) and rank correlation, and stores
both on the model row. The model version is stored on every valuation.

### The level factor

`level_factors.py` discounts production for where it was played. It is the most
consequential assumption in the feature and the least empirically grounded, so
it is never folded silently into the dollars: every valuation stores both the
factor and a one-sentence basis, and the page prints both — and plots the
level-adjusted line, labelled as such, when comparing against NBA rookies.

The factors are a **coarse ordering of competition strength**, anchored on NCAA
Division I at 1.0 by construction (almost every drafted player comes from it).
They are **not fitted** — there is no dataset here pairing amateur seasons with
NBA outcomes, and a regression over data that does not exist would be worse
than an honest ordering. If that dataset ever arrives, this module is the thing
to replace.

Volume is discounted; **rates are not**. Shooting 58% against weaker opposition
still means the shots went in.

## No LLM anywhere in this path

The valuation is ordinary least squares over four features, fitted with numpy.
Every coefficient is inspectable in the model row. No language model is involved
in producing any figure this feature displays.

## Files

| File | What it does |
| --- | --- |
| `train_valuation_model.py` | The entry point: reads real rookie seasons, fits, writes `ProspectValuationModel`. |
| `draft_slot_model.py` | The fit itself, plus the slot bounds and interval widths shipped to the API. |
| `rookie_scale.py` | The published first-year scale, by pick. The only real money in the feature. |
| `level_factors.py` | Competition-level multipliers, each with its stated basis. |
| `test_valuation.py` | Unit tests over literals — no database. |

The applying side lives in `apps/api/src/become-pro/`: `valuation-model.ts`
(slot, value, interval, comparables, drivers) and
`prospect-valuation.service.ts` (when a season is re-valued).

## Maintenance

The NBA publishes a new rookie scale each summer. When it does, update
`FIRST_ROUND_SCALE` and `ROOKIE_SCALE_YEAR` in `rookie_scale.py` and re-run
`python train_valuation_model.py`. The API picks up the new model on its next
read and re-values every season that was priced by an older one.

Nothing will warn you that the scale has gone stale — which is exactly why
every stored valuation records the year it was priced against.

`MINIMUM_GAMES_REQUIRED` in `train_valuation_model.py` must stay equal to the
same constant in `apps/api/src/become-pro/valuation-state.ts`; a test pins the
value here, and the API also checks the floor carried in the bundle.
