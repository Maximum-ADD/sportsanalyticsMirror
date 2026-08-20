"""One-time generator: fetches real bio data for exactly the 12 players in
seed.ts's MOCK_PLAYERS, and prints paste-ready TypeScript literals.

This is NOT meant to run as part of any regular pipeline - it's a one-off
tool to bake real bio values into seed.ts as static data, so every
teammate gets real bios via `npm run prisma:seed` with zero network
dependency at setup time. Re-run this manually only if MOCK_PLAYERS ever
changes, or if bio data needs refreshing before the real full-league
ingestion replaces this approach next sprint.

Run from apps/ingestion:
    python generate_seed_bios.py
"""

from player_bios import fetch_player_bio

# Mirrors seed.ts's MOCK_PLAYERS list (id, name) - kept here only for
# readable output, not written back anywhere.
SEED_PLAYERS = [
    (2544, "LeBron James"),
    (203076, "Anthony Davis"),
    (1630559, "Austin Reaves"),
    (1628369, "Jayson Tatum"),
    (1627759, "Jaylen Brown"),
    (1629632, "Derrick White"),
    (201939, "Stephen Curry"),
    (203110, "Draymond Green"),
    (1626172, "Buddy Hield"),
    (203507, "Giannis Antetokounmpo"),
    (203081, "Damian Lillard"),
    (203114, "Khris Middleton"),
]


def format_ts_value(value) -> str:
    """Formats a Python value as a TypeScript literal for pasting into seed.ts."""
    if value is None:
        return "null"
    if isinstance(value, str):
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return str(value)


def main() -> None:
    mismatches = []
    for nba_player_id, display_name in SEED_PLAYERS:
        bio = fetch_player_bio(nba_player_id)
        fetched_name = f"{bio['first_name']} {bio['last_name']}"

        if fetched_name.strip().lower() != display_name.strip().lower():
            mismatches.append((nba_player_id, display_name, fetched_name))
            print(f"  //  MISMATCH — expected {display_name!r}, "
                  f"nbaPlayerId {nba_player_id} actually resolves to {fetched_name!r}. "
                  f"Not printing this block — fix the id in seed.ts first.")
            print()
            continue

        print(f"  // {display_name}")
        print(f"  birthDate: {format_ts_value(bio['birth_date'])},")
        print(f"  school: {format_ts_value(bio['school'])},")
        print(f"  country: {format_ts_value(bio['country'])},")
        print(f"  lastAffiliation: {format_ts_value(bio['last_affiliation'])},")
        print(f"  seasonExp: {format_ts_value(bio['season_exp'])},")
        print(f"  rosterStatus: {format_ts_value(bio['roster_status'])},")
        print(f"  draftYear: {format_ts_value(bio['draft_year'])},")
        print(f"  draftRound: {format_ts_value(bio['draft_round'])},")
        print(f"  draftNumber: {format_ts_value(bio['draft_number'])},")
        print()

    if mismatches:
        print(f"\n{len(mismatches)} id/name mismatch(es) found — fix these in "
              f"seed.ts's MOCK_PLAYERS before re-running this script:")
        for nba_player_id, expected, actual in mismatches:
            print(f"  nbaPlayerId {nba_player_id}: expected {expected!r}, got {actual!r}")


if __name__ == "__main__":
    main()