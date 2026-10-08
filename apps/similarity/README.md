# apps/similarity

Player archetypes and similar players. It clusters one season's players by
their box-score rates (production per 36 minutes, shot mix as shares of
their own attempts, usage and height) into playing styles, names each
cluster, and finds every player's closest matches. There is no shot-location
or tracking data, so the styles describe offensive role, rebounding and
shot-blocking rather than perimeter defence (see `features.py`). The API serves the result at `GET /v1/archetypes` and
`GET /v1/players/:id/archetype`, and the player profile shows it.

The full write-up (features, how k was chosen, the style map, limitations)
is on the docs site's
[Player Archetypes](https://sports-analytics-innovation-platform.github.io/Innovation-Documentation-Website/player-archetypes/)
page.

## Setup

```bash
cd apps/similarity
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Set `DATABASE_URL` in a `.env` file here, in the same form as
`apps/valuation/.env.example` (no `?schema=public`: psycopg2 rejects it).

## Scripts

| Script | What it does | Writes? |
|---|---|---|
| `explore_fit.py` | Fits the model for a season and prints the clusters, silhouette scores and explained variance, to choose k and name the clusters | Never |
| `build_archetypes.py` | Fits a season and writes `Archetype`, `PlayerArchetype`, `PlayerArchetypeMembership` and `PlayerSimilarity` | Only with `--apply`; replaces that season's rows in one transaction |
| `copy_season_to_scratch.py` | Copies one season into a local scratch database, so `build_archetypes.py --apply` can be tried at real scale | Only to the scratch database |

```bash
python explore_fit.py --list-seasons
python explore_fit.py --season 2025-26 --k 9
python build_archetypes.py --season 2025-26           # dry run
python build_archetypes.py --season 2025-26 --apply   # write
```

The read-only scripts open their connection read-only, so pointing them at
production is safe: the server rejects any write. Each script's docstring
covers its options.

## Tests

```bash
pytest
```

The tests cover the features, clustering, labelling, similarity and the
scratch copy. They use in-memory data and need no database.
