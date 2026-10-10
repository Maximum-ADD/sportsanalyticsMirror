"""Selects which games a pull covers: a season, and optionally a date window
inside it.

Without this, ingest.py always pulled the same fixed slice — each team's
newest GAMES_PER_TEAM games plus the whole postseason — which is right for
"catch up on what just happened" and useless for "re-pull the week we got
wrong". The window is applied to the collected {nba_game_id: game_date} map
before any boxscore or play-by-play call is made, so narrowing it genuinely
narrows the run: those per-game calls are ~2 of every 3 calls in a full
pull, and a full pull is 35-45 minutes of throttled requests.

Dates are compared as ISO "YYYY-MM-DD" strings, which sort lexicographically
in date order, so no parsing is needed on the hot path. Values arriving from
the NBA API in other formats are normalised by normalise_game_date first.
"""

from dataclasses import dataclass
from datetime import datetime

ISO_DATE_FORMAT = "%Y-%m-%d"
# LeagueGameFinder returns "2025-10-15"; LeagueGameLog has been seen to
# return "OCT 15, 2025" on some endpoints. Both are accepted so a window
# filters the same way whichever call produced the rows.
NBA_DISPLAY_DATE_FORMAT = "%b %d, %Y"


def normalise_game_date(raw_game_date: str) -> str:
    """Converts an NBA API game date to ISO "YYYY-MM-DD".

    Accepts an already-ISO date (returned unchanged) or the abbreviated
    display form ("OCT 15, 2025"). Raises ValueError for anything else,
    rather than silently returning a string that would compare wrongly
    against a window boundary.
    """
    candidate = raw_game_date.strip()
    for date_format in (ISO_DATE_FORMAT, NBA_DISPLAY_DATE_FORMAT):
        try:
            return datetime.strptime(candidate, date_format).strftime(ISO_DATE_FORMAT)
        except ValueError:
            continue
    raise ValueError(f"Unrecognised game date format: {raw_game_date!r}")


def parse_iso_date(raw_date: str) -> str:
    """Validates a user-supplied "YYYY-MM-DD" date and returns it normalised.

    Used for the --from-date/--to-date arguments so a typo fails loudly at
    startup instead of silently selecting no games 40 minutes later.
    """
    return datetime.strptime(raw_date.strip(), ISO_DATE_FORMAT).strftime(ISO_DATE_FORMAT)


@dataclass(frozen=True)
class GameWindow:
    """An inclusive date window. Either bound may be None, meaning open.

    A window with both bounds None selects everything, which is what a pull
    with no date arguments uses — the previous behaviour, unchanged.
    """

    from_date: str | None = None
    to_date: str | None = None

    @property
    def is_open(self) -> bool:
        """True when the window constrains nothing, so callers can keep the
        cheaper "newest N games per team" fetch instead of a full-season one."""
        return self.from_date is None and self.to_date is None

    def contains(self, game_date: str) -> bool:
        """Whether an ISO game date falls inside the window, bounds included."""
        if self.from_date is not None and game_date < self.from_date:
            return False
        if self.to_date is not None and game_date > self.to_date:
            return False
        return True

    def describe(self) -> str:
        """Human-readable window, for the run's opening log line."""
        if self.is_open:
            return "all available games"
        if self.from_date is None:
            return f"games up to {self.to_date}"
        if self.to_date is None:
            return f"games from {self.from_date}"
        return f"games from {self.from_date} to {self.to_date}"


def build_game_window(from_date: str | None, to_date: str | None) -> GameWindow:
    """Builds a validated GameWindow from raw CLI/API date strings.

    Raises ValueError if either date is malformed, or if the window is
    inverted — an inverted window silently matches no games, which reads as
    "the pull found nothing" rather than "the request was wrong".
    """
    parsed_from = parse_iso_date(from_date) if from_date else None
    parsed_to = parse_iso_date(to_date) if to_date else None

    if parsed_from and parsed_to and parsed_from > parsed_to:
        raise ValueError(f"from-date {parsed_from} is after to-date {parsed_to}")

    return GameWindow(from_date=parsed_from, to_date=parsed_to)


def filter_games_by_window(
    game_date_by_nba_game_id: dict[str, str], window: GameWindow
) -> dict[str, str]:
    """Keeps only the games whose date falls inside the window.

    Dates are normalised on the way through, so the returned map is always
    ISO-formatted regardless of which NBA endpoint produced it.
    """
    if window.is_open:
        return {
            nba_game_id: normalise_game_date(game_date)
            for nba_game_id, game_date in game_date_by_nba_game_id.items()
        }

    selected: dict[str, str] = {}
    for nba_game_id, game_date in game_date_by_nba_game_id.items():
        normalised_date = normalise_game_date(game_date)
        if window.contains(normalised_date):
            selected[nba_game_id] = normalised_date
    return selected
