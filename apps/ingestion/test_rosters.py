"""Tests for rosters.select_first_names_by_nba_id — the Player-table read
that gives the stats derivation full first names, which play-by-play itself
doesn't carry."""

from rosters import select_first_names_by_nba_id


class FakeCursor:
    """Records each query and answers it from `first_name_by_nba_id`, for
    the ids actually asked about.

    Rows are dicts because db.get_connection uses RealDictCursor.
    """

    def __init__(self, first_name_by_nba_id: dict[int, str]):
        self.first_name_by_nba_id = first_name_by_nba_id
        self.executed = []

    def execute(self, sql, params):
        self.executed.append((sql, params))

    def fetchall(self):
        requested_ids = self.executed[-1][1][0]
        return [
            {"nbaPlayerId": nba_id, "firstName": first_name}
            for nba_id, first_name in self.first_name_by_nba_id.items()
            if nba_id in requested_ids
        ]


class TestSelectFirstNamesByNbaId:
    def test_returns_each_known_players_first_name(self):
        cursor = FakeCursor({1631114: "Jalen", 1631119: "Jaylin"})

        assert select_first_names_by_nba_id(cursor, [1631114, 1631119, 999]) == {1631114: "Jalen", 1631119: "Jaylin"}

    def test_asks_once_per_player_and_ignores_team_and_missing_ids(self):
        cursor = FakeCursor({})

        # A game's raw personIds: repeats, team rows (0) and rows with none.
        select_first_names_by_nba_id(cursor, [1631114, 1631114, 0, None, 1631119])

        sql, params = cursor.executed[0]
        assert '"firstName"' in sql
        assert params[0] == [1631114, 1631119]

    def test_skips_the_query_when_there_are_no_players(self):
        cursor = FakeCursor({})

        assert select_first_names_by_nba_id(cursor, [0, None]) == {}
        assert cursor.executed == []
