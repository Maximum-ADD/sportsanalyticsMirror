"""Fetches NBA moneyline odds from The Odds API and stores each upcoming
game's de-vigged, bookmaker-averaged home win probability as a pre-game
market snapshot (GameMarketOdds) — this project's second external API
integration, and a genuinely demanding baseline for GamePrediction's own
Elo-based homeWinProbability: a sportsbook's line reflects real money, not
just this project's own boxscore history, so "does the model beat the
market" is a far stronger question than "does it beat a coin flip." See
apps/predictor/README.md's "Accuracy" section for the same backtesting
mindset applied to the model side.

The Odds API's free tier (no card required — https://the-odds-api.com/)
only ever returns CURRENT/upcoming lines, never historical closing lines
(that's a paid tier). That constraint is embraced here rather than worked
around: this script only ever fetches odds for games that haven't been
played yet (Game.homeScore IS NULL) and simply has nothing to write once a
game is final, so GameMarketOdds always holds a genuine pre-game snapshot —
the same invariant GamePrediction's own homeWinProbability keeps on the
model side, for the same reason (see predict_games.py's module docstring).

Team matching: the API returns each side as a plain string like
"LA Clippers" or "Boston Celtics". City-form conventions occasionally
disagree with this schema's own Team.city (the Clippers are "LA Clippers"
here, not "Los Angeles Clippers" — confirmed against ESPN's own odds pages
using the same "LA Clippers" form), so matching anchors on the nickname —
the trailing word(s), e.g. "Clippers", "Trail Blazers" — read straight out
of the already-ingested Team table (teams.py) instead of a hardcoded
30-entry name map that would silently drift the moment either source's
marketing copy changes. See team_name_matches.

Game matching: an odds-API event is matched to an upcoming Game row by
(home team, away team, commence_time within GAME_MATCH_WINDOW of
gameDate) — a window rather than an exact-timestamp match because the two
sources don't guarantee identical tip-off precision, and team identity
alone isn't a unique key (the same two teams can play each other more than
once in a season).
"""

import os
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

from db import get_connection

load_dotenv()

ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4/sports/basketball_nba/odds"
MONEYLINE_MARKET = "h2h"
ODDS_REGION = "us"

# How close an odds-API event's commence_time must be to a candidate Game
# row's gameDate to count as the same game. Wide enough to absorb the two
# sources' independent tip-off-time precision; narrow enough that an NBA
# back-to-back (always >= 1 day apart) can't be matched to the wrong leg.
GAME_MATCH_WINDOW = timedelta(hours=12)

REQUEST_TIMEOUT_SECONDS = 15


def fetch_nba_moneyline_odds(api_key: str) -> list[dict]:
    """One HTTP call, every upcoming NBA game's moneyline odds from every US bookmaker the API covers.

    Raises requests.HTTPError on a non-2xx response (e.g. an invalid or
    quota-exhausted API key) rather than swallowing it — a caller with a
    bad key should see that immediately, not silently write zero rows and
    look like there just happened to be no games today.
    """
    response = requests.get(
        ODDS_API_BASE_URL,
        params={"apiKey": api_key, "regions": ODDS_REGION, "markets": MONEYLINE_MARKET, "oddsFormat": "american"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def american_odds_to_implied_probability(price: float) -> float:
    """Converts one American-odds price to the probability it implies on its own (still including the book's overround — see remove_vig)."""
    if price < 0:
        return -price / (-price + 100)
    return 100 / (price + 100)


def remove_vig(home_implied: float, away_implied: float) -> float:
    """Normalizes a moneyline pair to a fair home win probability.

    A bookmaker's two prices always imply more than 100% combined (the
    "vig"/overround — how a book guarantees itself a margin regardless of
    outcome), so home_implied + away_implied > 1 in practice. Dividing
    home's share by the total removes that margin proportionally — the
    standard de-vig method. Treating the raw implied probability as a real
    probability would systematically overstate BOTH teams' chances by the
    size of the book's own margin, which would make "model vs market"
    biased against the market by construction rather than a fair test.
    """
    return home_implied / (home_implied + away_implied)


def average_home_win_probability(event: dict) -> tuple[float, int] | None:
    """De-vigged home win probability averaged across every bookmaker with a usable two-sided moneyline for this event.

    Averaging across books (rather than picking one, e.g. the first or a
    named "sharp" book) for the same reason this project's Four Factors
    heuristic borrows literature-wide numbers instead of one source: a
    single book can be a temporary outlier (a line it hasn't moved yet, or
    one deliberately shaded to balance its own action), and this project
    has no principled way to pick a "best" book from the ones the free
    tier happens to return.

    Returns (probability, bookmaker_count), or None if no bookmaker in the
    response actually carried a two-sided h2h price for both teams in this
    event (e.g. a line pulled right after breaking injury news).
    """
    home_team = event["home_team"]
    away_team = event["away_team"]
    probabilities = []

    for bookmaker in event.get("bookmakers", []):
        market = next((m for m in bookmaker.get("markets", []) if m["key"] == MONEYLINE_MARKET), None)
        if market is None:
            continue
        outcomes = {outcome["name"]: outcome["price"] for outcome in market["outcomes"]}
        if home_team not in outcomes or away_team not in outcomes:
            continue
        home_implied = american_odds_to_implied_probability(outcomes[home_team])
        away_implied = american_odds_to_implied_probability(outcomes[away_team])
        probabilities.append(remove_vig(home_implied, away_implied))

    if not probabilities:
        return None
    return sum(probabilities) / len(probabilities), len(probabilities)


def team_name_matches(odds_api_team_name: str, team_nickname: str) -> bool:
    """True if odds_api_team_name (e.g. "LA Clippers") is that nickname's team.

    Matches on suffix rather than equality against a hardcoded full name —
    see module docstring: the odds API's city-form conventions don't
    always match this schema's own Team.city, but the nickname itself is
    always the trailing word(s) in both sources.
    """
    return odds_api_team_name.endswith(team_nickname)


def fetch_upcoming_games_for_matching(cursor) -> list[dict]:
    """Every not-yet-played game with its teams' nicknames, for match_event_to_game.

    Only upcoming games (homeScore IS NULL) — see module docstring on why
    a completed game's market snapshot is never touched again.
    """
    cursor.execute(
        """
        SELECT g."id" AS game_id, g."gameDate" AS game_date,
               home."name" AS home_nickname, away."name" AS away_nickname
        FROM "Game" g
        JOIN "Team" home ON home."id" = g."homeTeamId"
        JOIN "Team" away ON away."id" = g."awayTeamId"
        WHERE g."homeScore" IS NULL
        """
    )
    return cursor.fetchall()


def match_event_to_game(event: dict, upcoming_games: list[dict]) -> dict | None:
    """Matches one odds-API event to one of our upcoming Game rows, or None if no confident match exists."""
    commence_time = datetime.fromisoformat(event["commence_time"].replace("Z", "+00:00"))

    for game in upcoming_games:
        if not team_name_matches(event["home_team"], game["home_nickname"]):
            continue
        if not team_name_matches(event["away_team"], game["away_nickname"]):
            continue

        game_date = game["game_date"]
        if game_date.tzinfo is None:
            # psycopg2 returns a naive datetime for this schema's
            # timezone-less TIMESTAMP(3) columns; every one of them is
            # stored as UTC already (see schedule.py's gameDateUTC), so
            # attaching UTC here reconstructs what the value always meant
            # rather than changing it.
            game_date = game_date.replace(tzinfo=timezone.utc)

        if abs(commence_time - game_date) <= GAME_MATCH_WINDOW:
            return game

    return None


def upsert_market_odds(cursor, game_id: str, home_win_probability: float, bookmaker_count: int, fetched_at: datetime) -> None:
    """Upserts one GameMarketOdds row by gameId — refreshes the snapshot while a game is still upcoming."""
    cursor.execute(
        """
        INSERT INTO "GameMarketOdds" ("id", "gameId", "homeWinProbability", "bookmakerCount", "source", "fetchedAt")
        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s)
        ON CONFLICT ("gameId") DO UPDATE SET
            "homeWinProbability" = EXCLUDED."homeWinProbability",
            "bookmakerCount" = EXCLUDED."bookmakerCount",
            "fetchedAt" = EXCLUDED."fetchedAt"
        """,
        (game_id, home_win_probability, bookmaker_count, "the-odds-api", fetched_at),
    )


def main() -> None:
    api_key = os.environ.get("ODDS_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ODDS_API_KEY is not set. Sign up for a free key (no card required) at "
            "https://the-odds-api.com/ and add it to apps/ingestion/.env."
        )

    events = fetch_nba_moneyline_odds(api_key)
    fetched_at = datetime.now(timezone.utc)

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            upcoming_games = fetch_upcoming_games_for_matching(cursor)

            matched = 0
            for event in events:
                game = match_event_to_game(event, upcoming_games)
                if game is None:
                    continue
                result = average_home_win_probability(event)
                if result is None:
                    continue
                probability, bookmaker_count = result
                upsert_market_odds(cursor, game["game_id"], probability, bookmaker_count, fetched_at)
                matched += 1

        connection.commit()
        print(f"Wrote market odds for {matched}/{len(events)} games returned by the API.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
