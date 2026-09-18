"""Tests for feed_translation.py.

Every row below is copied from a real 2025-26 PlayByPlayV3 response
(fetched 2026-09-18), trimmed to the fields that matter. The translation
exists because the feed's real shape differed from what the pipeline was
written against, so the fixtures are real rows, not what the feed was
assumed to send.
"""

from derive_player_game_stats import aggregate_player_game_stats
from event_validation import validate_raw_event
from feed_translation import TEAM_ACTION_PERSON_ID, translate_game_actions

NUGGETS = 1610612743
TIMBERWOLVES = 1610612750
DIVINCENZO, MCDANIELS, GORDON, EDWARDS, BRAUN, JOKIC, REID, WARE = 1628978, 1630183, 203932, 1630162, 1631128, 203999, 1629675, 1642276


def row(action_number: int, action_type: str, description: str, **fields) -> dict:
    return {"actionNumber": action_number, "actionType": action_type, "subType": "", "description": description, **fields}


def translate_one(action: dict) -> dict:
    return translate_game_actions([action])[0]


class TestShotsAndFreeThrows:
    def test_made_three_becomes_3pt_and_keeps_its_result(self):
        made = row(20, "Made Shot", "DiVincenzo 26' 3PT Pullup Jump Shot (3 PTS) (Gobert 1 AST)",
                   personId=DIVINCENZO, teamId=TIMBERWOLVES, shotResult="Made", shotValue=3)
        translated = translate_one(made)
        assert (translated["actionType"], translated["shotResult"]) == ("3pt", "Made")

    def test_missed_two_becomes_2pt(self):
        missed = row(21, "Missed Shot", "MISS McDaniels 12' Jump Shot", personId=MCDANIELS, teamId=TIMBERWOLVES, shotResult="Missed", shotValue=2)
        assert translate_one(missed)["actionType"] == "2pt"

    def test_free_throw_result_comes_from_the_description(self):
        # The feed leaves shotResult empty on every free throw.
        made = row(30, "Free Throw", "Gordon Free Throw 1 of 2 (1 PTS)", personId=GORDON, teamId=NUGGETS, shotResult="")
        missed = row(31, "Free Throw", "MISS Edwards Free Throw 1 of 1", personId=EDWARDS, teamId=TIMBERWOLVES, shotResult="")
        made_translated, missed_translated = translate_game_actions([made, missed])
        assert (made_translated["actionType"], made_translated["shotResult"]) == ("freethrow", "Made")
        assert missed_translated["shotResult"] == "Missed"


class TestRebounds:
    def test_kind_comes_from_which_tally_count_rose(self):
        defensive = row(8, "Rebound", "Braun REBOUND (Off:0 Def:1)", personId=BRAUN, teamId=NUGGETS, subType="Unknown")
        offensive = row(10, "Rebound", "Gordon REBOUND (Off:1 Def:0)", personId=GORDON, teamId=NUGGETS, subType="Unknown")
        assert [a["subType"] for a in translate_game_actions([defensive, offensive])] == ["defensive", "offensive"]

    def test_a_rebound_logged_late_is_still_classified(self):
        # Ware's rows from game 0052500111: #277 happened at 6:42, before
        # #261 (6:07), but was logged after #264. By actionNumber its tally
        # goes backwards; by tally total it is his 4th rebound, a defensive one.
        ware_rows = [
            row(237, "Rebound", "Ware REBOUND (Off:0 Def:3)", personId=WARE, teamId=NUGGETS),
            row(261, "Rebound", "Ware REBOUND (Off:1 Def:4)", personId=WARE, teamId=NUGGETS),
            row(264, "Rebound", "Ware REBOUND (Off:1 Def:5)", personId=WARE, teamId=NUGGETS),
            row(277, "Rebound", "Ware REBOUND (Off:0 Def:4)", personId=WARE, teamId=NUGGETS),
        ]
        kinds = [a["subType"] for a in translate_game_actions(ware_rows)]
        assert kinds == ["defensive", "offensive", "defensive", "defensive"]

    def test_team_rebound_becomes_team_attributed(self):
        # The feed puts the team's id in personId and 0 in teamId.
        team = row(20, "Rebound", "NUGGETS Rebound", personId=NUGGETS, teamId=0)
        player = row(21, "Rebound", "Braun REBOUND (Off:0 Def:1)", personId=BRAUN, teamId=NUGGETS)
        translated = translate_game_actions([team, player])[0]
        assert (translated["personId"], translated["teamId"], translated["subType"]) == (TEAM_ACTION_PERSON_ID, NUGGETS, None)


class TestBlocksAndSteals:
    def test_block_is_folded_into_the_missed_shot_it_shares_a_number_with(self):
        missed = row(9, "Missed Shot", "MISS Gordon 6' Driving Layup", personId=GORDON, teamId=NUGGETS, shotResult="Missed", shotValue=2)
        block = row(9, "", "Edwards BLOCK (1 BLK)", personId=EDWARDS, teamId=TIMBERWOLVES)
        translated = translate_game_actions([missed, block])
        assert len(translated) == 1
        assert translated[0]["description"] == "MISS Gordon 6' Driving Layup (Edwards 1 BLK)"

    def test_steal_is_folded_into_the_turnover_it_shares_a_number_with(self):
        turnover = row(77, "Turnover", "Jokic Bad Pass Turnover (P2.T2)", personId=JOKIC, teamId=NUGGETS)
        steal = row(77, "", "Reid STEAL (1 STL)", personId=REID, teamId=TIMBERWOLVES)
        translated = translate_game_actions([turnover, steal])
        assert [a["description"] for a in translated] == ["Jokic Bad Pass Turnover (P2.T2) (Reid 1 STL)"]

    def test_credit_keeps_the_name_as_nba_wrote_it(self):
        # "St. Curry", not the bare surname — the derivers use the prefix to
        # tell teammates who share a surname apart.
        turnover = row(50, "Turnover", "Tatum Lost Ball Turnover (P1.T1)", personId=1628369, teamId=1610612738)
        steal = row(50, "", "St. Curry STEAL (1 STL)", personId=201939, teamId=1610612744)
        assert translate_game_actions([turnover, steal])[0]["description"].endswith("(St. Curry 1 STL)")

    def test_a_credit_row_with_no_partner_is_kept_for_validation_to_reject(self):
        orphan = row(12, "", "Edwards BLOCK (1 BLK)", personId=EDWARDS, teamId=TIMBERWOLVES)
        translated = translate_game_actions([orphan])
        assert translated[0]["actionType"] == ""


class TestNonPlayers:
    def test_instant_replay_carries_a_referee_not_a_player(self):
        replay = row(44, "Instant Replay", "Instant Replay1st Period (3:48 PM EST)", personId=42, playerName="Williams", teamId=0)
        assert translate_one(replay)["personId"] is None

    def test_a_coach_technical_is_not_checked_as_a_player(self):
        # Sometimes named, sometimes not; never on a team.
        unnamed = row(165, "Foul", "David Adelman Foul:T.FOUL (Z.Zarba)", personId=203600, playerName="", teamId=0)
        named = row(443, "Foul", "Douglas Christie Foul:T.FOUL (L.Wood)", personId=57, playerName="Christie", teamId=0)
        assert [a["personId"] for a in translate_game_actions([unnamed, named])] == [None, None]


class TestGeneralBehaviour:
    def test_an_unknown_feed_type_passes_through_for_validation_to_name(self):
        assert translate_one(row(5, "Brand New Thing", "?", personId=GORDON, teamId=NUGGETS))["actionType"] == "Brand New Thing"

    def test_the_input_rows_are_not_modified(self):
        missed = row(9, "Missed Shot", "MISS Gordon 6' Driving Layup", personId=GORDON, teamId=NUGGETS, shotResult="Missed", shotValue=2)
        block = row(9, "", "Edwards BLOCK (1 BLK)", personId=EDWARDS, teamId=TIMBERWOLVES)
        translate_game_actions([missed, block])
        assert missed["actionType"] == "Missed Shot"
        assert missed["description"] == "MISS Gordon 6' Driving Layup"


def test_real_rows_translate_validate_and_aggregate_end_to_end():
    """A slice of game 0042500161, through the same three steps ingestion
    runs. Before translation, every row here but the period marker was
    rejected."""
    rows = [
        row(1, "period", "Start of 1st Period", personId=0, teamId=0, subType="start", period=1),
        row(7, "Missed Shot", "MISS Gordon 6' Driving Layup", personId=GORDON, playerName="Gordon", playerNameI="A. Gordon", teamId=NUGGETS, shotResult="Missed", shotValue=2),
        row(7, "", "Edwards BLOCK (1 BLK)", personId=EDWARDS, playerName="Edwards", playerNameI="A. Edwards", teamId=TIMBERWOLVES),
        row(8, "Rebound", "Braun REBOUND (Off:0 Def:1)", personId=BRAUN, playerName="Braun", playerNameI="C. Braun", teamId=NUGGETS),
        row(9, "Made Shot", "Edwards 25' 3PT Jump Shot (3 PTS)", personId=EDWARDS, playerName="Edwards", playerNameI="A. Edwards", teamId=TIMBERWOLVES, shotResult="Made", shotValue=3),
        row(10, "Free Throw", "MISS Gordon Free Throw 1 of 2", personId=GORDON, playerName="Gordon", playerNameI="A. Gordon", teamId=NUGGETS, shotResult=""),
        row(11, "Rebound", "NUGGETS Rebound", personId=NUGGETS, teamId=0),
    ]
    for action in rows:
        action.setdefault("gameId", "0042500161")
        action.setdefault("period", 1)
        action.setdefault("clock", "PT11M00.00S")

    accepted, previous = [], None
    for action in translate_game_actions(rows):
        result = validate_raw_event(action, previous_sequence=previous, known_player_ids={GORDON, EDWARDS, BRAUN})
        assert result.accepted, (action["description"], result.reasons)
        previous = action["actionNumber"]
        accepted.append(action)

    stats = aggregate_player_game_stats(accepted)

    assert len(accepted) == 6  # the block row became part of the missed shot
    assert stats[EDWARDS]["blocks"] == 1
    assert stats[EDWARDS]["points"] == 3
    assert stats[GORDON]["field_goals_attempted"] == 1
    assert stats[GORDON]["free_throws_attempted"] == 1
    assert stats[GORDON]["free_throws_made"] == 0
    assert stats[BRAUN]["defensive_rebounds"] == 1
