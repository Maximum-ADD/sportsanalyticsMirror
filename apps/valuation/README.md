# Valuation service

A small Python service, separate from the NestJS API, that prices every
self-reported **Become Pro** season against the published NBA rookie salary
scale.

It writes `ProspectValuation` rows straight into the same Postgres database
Prisma/NestJS manages — the same arrangement `apps/predictor` and
`apps/optimizer` have. **NestJS only ever reads that table.**

```bash
cd apps/valuation
python -m venv .venv && . .venv/Scripts/activate   # or bin/activate on POSIX
pip install -r requirements.txt
cp .env.example .env                                # point DATABASE_URL at Postgres
python value_prospects.py
pytest                                              # unit tests, no database needed
```

## What the model actually claims

This is the part worth reading before trusting a figure.

There is **no salary, contract or market-value data anywhere in this project**,
and `nba_api` exposes none. So "what is this player worth" cannot be answered
directly. What *can* be answered is "what would this player sign for entering
the league", because the NBA rookie scale is small, fixed and public.

The model therefore predicts a **draft slot**, and the slot is looked up in
`rookie_scale.py`. The slot is what was computed; the dollars are its published
consequence. That is why the API prints the scale year next to every figure and
the frontend leads with the slot rather than the money.

### The inversion, stated plainly

The model is **not** trained on "amateur season → draft slot". No such dataset
exists here — nothing in this database pairs a college or high-school season
with what happened to that player in the draft.

What this database does have is every NBA player's **rookie production**
(`PlayerGameStat`) alongside the pick they were taken at (`Player.draftNumber`).
So `draft_slot_model.py` fits draft slot against rookie production among players
who were actually drafted, and then inverts it: a prospect's level-adjusted line
is scored on the same production index, and the slot whose typical rookie year
it most resembles is the slot they project to.

Real limitations of that, none of which the UI hides:

- It answers *"which pick's rookie year does this line most resemble"*, not
  *"where would this player be drafted"* — which also turns on age, size,
  athleticism, position scarcity and scouting this database has none of.
- It is fitted on players who *were* drafted, so it says little that is
  reliable about lines far below the weakest rookie season in the data.
- Rookie minutes are partly a *consequence* of draft position: high picks play
  more because they were high picks. The model cannot fully remove that.

Every run prints its own in-sample MAE (in picks) and rank correlation, and the
model version is stored on every row it writes.

### The level factor

`level_factors.py` discounts production for where it was played. It is the most
consequential assumption in the feature and the least empirically grounded, so
it is never folded silently into the dollars: every valuation row stores both
the factor and a one-sentence basis, and the API prints both.

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
Every coefficient is inspectable in the row it writes. No language model is
involved in producing any figure this feature displays.

## Files

| File | What it does |
| --- | --- |
| `rookie_scale.py` | The published first-year scale, by pick. The only real money in the feature. |
| `level_factors.py` | Competition-level multipliers, each with its stated basis. |
| `draft_slot_model.py` | Fits and inverts production → draft slot; intervals and drivers. |
| `value_prospects.py` | The entry point: reads seasons, writes `ProspectValuation`. |
| `test_valuation.py` | Unit tests over literals — no database. |

## Maintenance

The NBA publishes a new rookie scale each summer. When it does:

1. Update `FIRST_ROUND_SCALE` and `ROOKIE_SCALE_YEAR` in `rookie_scale.py`.
2. Update the three anchor figures in
   `apps/api/src/become-pro/rookie-scale-reference.ts` to match.

Nothing in the system will warn you that the scale has gone stale — which is
exactly why every stored valuation records the year it was priced against.

`MINIMUM_GAMES_REQUIRED` in `value_prospects.py` must stay equal to the same
constant in `apps/api/src/become-pro/prospect-ranking.ts`; a test asserts it.
If they drift, a prospect could be ranked by the API without ever being given a
figure by this service.
