# Optimizer service

A small Python service, separate from the NestJS API, that:

1. **`predict.py`** — predicts each player's next-game DraftKings-style
   fantasy points from their own game log (recency-weighted average — see
   the module docstring for why it's this simple rather than a full
   regression, given current mock data volume), and derives a synthetic
   salary from that prediction.
2. **`optimize.py`** — solves a 5-player lineup under a salary cap and
   basic position constraints as a MILP (PuLP + the free CBC solver),
   maximizing total predicted points.

Both write straight into the same Postgres database Prisma/NestJS manages
(`PlayerPrediction`, `Lineup`, `LineupSlot` tables) — this mirrors the
architecture already planned for real `nba_api` data ingestion (see the
root `PROJECT_OVERVIEW.md`), just realized here first. NestJS only ever
*reads* these tables via `GET /v1/optimizer/lineup`.

## Setup

```bash
cd apps/optimizer
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # point DATABASE_URL at your Postgres instance
```

## Run

```bash
python predict.py    # writes a PlayerPrediction row per player
python optimize.py   # reads the latest predictions, writes a Lineup
```

Run `predict.py` again any time the underlying game data changes (e.g.
after reseeding), then `optimize.py` to get a fresh lineup from it.
