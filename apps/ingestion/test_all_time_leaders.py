"""Tests for all_time_leaders — the parsing of AllTimeLeadersGrids and
CommonPlayerInfo rows, and the SQL each write sends."""

from datetime import datetime, timezone

from all_time_leaders import (
    delete_unlisted_players,
    parse_height_inches,
    parse_leader_rows,
    parse_weight_lbs,
    replace_leader_rows,
    split_player_name,
    to_leader_bio,
    upsert_leader_players,
)

FETCHED_AT = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)

POINTS_RESULT_SET = {
    "PTSLeaders": [
        {"PLAYER_ID": 2544, "PLAYER_NAME": "LeBron James", "PTS": 43440, "PTS_RANK": 1, "IS_ACTIVE_FLAG": "Y"},
        {"PLAYER_ID": 76003, "PLAYER_NAME": "Kareem Abdul-Jabbar", "PTS": 38387, "PTS_RANK": 2, "IS_ACTIVE_FLAG": "N"},
    ],
}

KAREEM_INFO_ROW = {
    "PERSON_ID": 76003,
    "FIRST_NAME": "Kareem",
    "LAST_NAME": "Abdul-Jabbar",
    "POSITION": "Center",
    "HEIGHT": "7-2",
    "WEIGHT": "225",
    "BIRTHDATE": "1947-04-16T00:00:00",
    "SCHOOL": "UCLA",
    "COUNTRY": "USA",
    "FROM_YEAR": 1969,
    "TO_YEAR": 1988,
    "SEASON_EXP": 20,
    "DRAFT_YEAR": "1969",
    "DRAFT_ROUND": "1",
    "DRAFT_NUMBER": "1",
    "GREATEST_75_FLAG": "Y",
}


class FakeCursor:
    """Records every statement it is sent; answers nothing."""

    def __init__(self):
        self.executed = []
        self.rowcount = 0

    def execute(self, sql, params=None):
        self.executed.append((sql, params))


class TestParseLeaderRows:
    def test_turns_each_place_into_one_row_with_the_stored_enum_values(self):
        rows = parse_leader_rows(POINTS_RESULT_SET, "REGULAR")

        assert rows[0] == {
            "category": "POINTS",
            "season_type": "REGULAR",
            "rank": 1,
            "value": 43440,
            "nba_player_id": 2544,
            "player_name": "LeBron James",
            "is_active": True,
        }
        assert rows[1]["is_active"] is False

    def test_ignores_the_categories_the_page_leaves_out(self):
        result_sets = {
            **POINTS_RESULT_SET,
            "FG_PCTLeaders": [{"PLAYER_ID": 1, "PLAYER_NAME": "A B", "FG_PCT": 0.7, "FG_PCT_RANK": 1, "IS_ACTIVE_FLAG": "Y"}],
            "TOVLeaders": [{"PLAYER_ID": 1, "PLAYER_NAME": "A B", "TOV": 5000, "TOV_RANK": 1, "IS_ACTIVE_FLAG": "Y"}],
        }

        categories = {row["category"] for row in parse_leader_rows(result_sets, "PLAYOFFS")}

        assert categories == {"POINTS"}

    def test_skips_a_missing_result_set_instead_of_failing(self):
        assert parse_leader_rows({}, "REGULAR") == []


class TestSplitPlayerName:
    def test_keeps_everything_after_the_first_word_as_the_last_name(self):
        assert split_player_name("Kareem Abdul-Jabbar") == ("Kareem", "Abdul-Jabbar")
        assert split_player_name("Jimmy Butler III") == ("Jimmy", "Butler III")

    def test_treats_a_one_word_name_as_a_last_name(self):
        assert split_player_name("Nene") == ("", "Nene")


class TestParseHeightAndWeight:
    def test_converts_feet_and_inches_to_inches(self):
        assert parse_height_inches("7-2") == 86
        assert parse_height_inches("6-0") == 72

    def test_returns_none_for_a_blank_or_malformed_height(self):
        assert parse_height_inches("") is None
        assert parse_height_inches(None) is None
        assert parse_height_inches("tall") is None

    def test_reads_weight_in_pounds_or_none(self):
        assert parse_weight_lbs("225") == 225
        assert parse_weight_lbs("") is None


class TestToLeaderBio:
    def test_maps_a_common_player_info_row_to_the_bio_columns(self):
        bio = to_leader_bio(KAREEM_INFO_ROW)

        assert bio == {
            "nba_player_id": 76003,
            "first_name": "Kareem",
            "last_name": "Abdul-Jabbar",
            "position": "Center",
            "height_inches": 86,
            "weight_lbs": 225,
            "birth_date": "1947-04-16",
            "school": "UCLA",
            "country": "USA",
            "from_year": 1969,
            "to_year": 1988,
            "season_exp": 20,
            "draft_year": 1969,
            "draft_round": 1,
            "draft_number": 1,
            "is_greatest_75": True,
        }

    def test_stores_blanks_and_undrafted_as_none(self):
        bio = to_leader_bio({**KAREEM_INFO_ROW, "SCHOOL": "", "POSITION": "", "DRAFT_YEAR": "Undrafted"})

        assert bio["school"] is None
        assert bio["position"] is None
        assert bio["draft_year"] is None


class TestWrites:
    def test_upserts_each_player_once_however_many_boards_they_are_on(self):
        cursor = FakeCursor()
        rows = parse_leader_rows(POINTS_RESULT_SET, "REGULAR") + parse_leader_rows(POINTS_RESULT_SET, "PLAYOFFS")

        player_count = upsert_leader_players(cursor, rows)

        assert player_count == 2
        assert len(cursor.executed) == 2
        sql, params = cursor.executed[1]
        assert "ON CONFLICT" in sql
        assert params == (76003, "Kareem", "Abdul-Jabbar", False)

    def test_replaces_every_leader_row_rather_than_appending(self):
        cursor = FakeCursor()
        rows = parse_leader_rows(POINTS_RESULT_SET, "REGULAR")

        replace_leader_rows(cursor, rows, FETCHED_AT)

        assert cursor.executed[0][0] == 'DELETE FROM "AllTimeLeader"'
        inserted = [params for _, params in cursor.executed[1:]]
        assert [params[1:] for params in inserted] == [
            ("POINTS", "REGULAR", 1, 43440, 2544, FETCHED_AT),
            ("POINTS", "REGULAR", 2, 38387, 76003, FETCHED_AT),
        ]
        assert len({params[0] for params in inserted}) == 2

    def test_deletes_only_players_left_on_no_leaderboard(self):
        cursor = FakeCursor()

        delete_unlisted_players(cursor)

        assert "NOT EXISTS" in cursor.executed[0][0]
