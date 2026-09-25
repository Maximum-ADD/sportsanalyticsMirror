"""Tests for similarity.py.

Two properties matter more than the arithmetic:

  1. A player is never their own most similar player. Their distance to
     themselves is zero, so the naive version returns every player as their
     own perfect match — a bug that looks like working code.
  2. Neighbours come back genuinely nearest-first. The list is ranked in the
     UI, so an ordering error is invisible rather than obvious.
"""

import pytest

from similarity import (
    calculate_decay_scale,
    calculate_pairwise_distances,
    calculate_similarity_score,
    find_similar_players,
)

# Four players on a line, so every distance is readable by eye:
# A at 0, B at 1, C at 2, D at 10.
PLAYERS_ON_A_LINE = [[0.0], [1.0], [2.0], [10.0]]
PLAYER_A, PLAYER_B, PLAYER_C, PLAYER_D = 0, 1, 2, 3


class TestDistances:
    def test_measures_the_distance_between_every_pair(self):
        distances = calculate_pairwise_distances(PLAYERS_ON_A_LINE)
        assert distances.shape == (4, 4)
        assert distances[PLAYER_A][PLAYER_C] == pytest.approx(2.0)
        assert distances[PLAYER_A][PLAYER_D] == pytest.approx(10.0)

    def test_a_player_is_no_distance_from_themselves(self):
        distances = calculate_pairwise_distances(PLAYERS_ON_A_LINE)
        for player in range(4):
            assert distances[player][player] == pytest.approx(0.0)

    def test_the_decay_scale_ignores_the_zero_diagonal(self):
        # Including it would drag the scale toward zero and compress every
        # score against the top of the range.
        scale = calculate_decay_scale(calculate_pairwise_distances(PLAYERS_ON_A_LINE))
        assert scale > 0

    def test_a_single_player_has_no_scale(self):
        assert calculate_decay_scale(calculate_pairwise_distances([[1.0]])) == 0.0


class TestSimilarityScore:
    def test_identical_players_score_the_maximum(self):
        assert calculate_similarity_score(0.0, decay_scale=3.0) == pytest.approx(100.0)

    def test_further_apart_scores_lower(self):
        near = calculate_similarity_score(1.0, decay_scale=3.0)
        far = calculate_similarity_score(5.0, decay_scale=3.0)
        assert near > far

    def test_the_score_never_reaches_zero(self):
        # No two players are infinitely dissimilar, and a 0 would read as
        # "nothing in common", which is never what the data says.
        assert calculate_similarity_score(1000.0, decay_scale=3.0) > 0

    def test_a_degenerate_fit_does_not_divide_by_zero(self):
        # Every player identical: everyone is maximally similar, which is true.
        assert calculate_similarity_score(0.0, decay_scale=0.0) == pytest.approx(100.0)


class TestFindingSimilarPlayers:
    def test_a_player_is_never_their_own_neighbour(self):
        for player_index, neighbours in enumerate(find_similar_players(PLAYERS_ON_A_LINE, 3)):
            assert player_index not in [neighbour for neighbour, _, _ in neighbours]

    def test_neighbours_come_back_nearest_first(self):
        # A at 0 should see B (1 away), then C (2 away), then D (10 away).
        neighbours = find_similar_players(PLAYERS_ON_A_LINE, 3)[PLAYER_A]
        assert [neighbour for neighbour, _, _ in neighbours] == [PLAYER_B, PLAYER_C, PLAYER_D]

    def test_ranks_start_at_one_and_count_up(self):
        neighbours = find_similar_players(PLAYERS_ON_A_LINE, 3)[PLAYER_A]
        assert [rank for _, rank, _ in neighbours] == [1, 2, 3]

    def test_scores_fall_as_rank_rises(self):
        scores = [score for _, _, score in find_similar_players(PLAYERS_ON_A_LINE, 3)[PLAYER_A]]
        assert scores == sorted(scores, reverse=True)

    def test_returns_the_requested_number_of_neighbours(self):
        for neighbours in find_similar_players(PLAYERS_ON_A_LINE, 2):
            assert len(neighbours) == 2

    def test_asking_for_more_neighbours_than_exist_returns_what_there_is(self):
        # Excluding self, three players can offer at most two neighbours.
        for neighbours in find_similar_players([[0.0], [1.0], [2.0]], 5):
            assert len(neighbours) == 2

    def test_an_isolated_player_still_gets_neighbours_just_weaker_ones(self):
        # D sits far from everyone. They still have a most-similar player —
        # the score is what says how little that means.
        neighbours = find_similar_players(PLAYERS_ON_A_LINE, 1)[PLAYER_D]
        assert len(neighbours) == 1
        assert neighbours[0][0] == PLAYER_C
        closest_pair_score = find_similar_players(PLAYERS_ON_A_LINE, 1)[PLAYER_A][0][2]
        assert neighbours[0][2] < closest_pair_score
