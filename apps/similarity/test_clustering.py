"""Tests for clustering.py.

The property this file exists to protect: a player's strongest MEMBERSHIP
is always the cluster they were ASSIGNED to. The profile badge comes from
the assignment and the membership bar comes from the weights, so the moment
those two disagree the page contradicts itself — and it would do so for a
fifth of the league, which is exactly what a Gaussian mixture did here
before this approach replaced it (see the module docstring).

test_strongest_membership_is_always_the_assigned_cluster is that test.
"""

import numpy as np
import pytest

from clustering import (
    calculate_membership_weights,
    canonicalize_component_signs,
    fit_cluster_assignments,
    project_to_plot_coordinates,
    select_top_memberships,
)


def make_three_separated_groups(points_per_group: int = 12):
    """Three clearly separated blobs in two dimensions.

    Separated on purpose: these tests are about the mechanics around the
    clustering, so the clustering itself should never be the ambiguous part.
    """
    generator = np.random.default_rng(seed=1)
    centres = [(0.0, 0.0), (10.0, 0.0), (0.0, 10.0)]
    rows = []
    for centre_x, centre_y in centres:
        for _ in range(points_per_group):
            rows.append(
                [centre_x + generator.normal(0, 0.3), centre_y + generator.normal(0, 0.3)]
            )
    return rows


class TestClusterAssignment:
    def test_produces_the_requested_number_of_clusters(self):
        labels, centroids = fit_cluster_assignments(make_three_separated_groups(), 3)
        assert len(centroids) == 3
        assert set(labels) == {0, 1, 2}

    def test_is_deterministic_across_runs(self):
        # A cluster that moved between runs could not carry a
        # human-assigned name forward, which archetype_labels.py depends on.
        matrix = make_three_separated_groups()
        first_labels, _ = fit_cluster_assignments(matrix, 3)
        second_labels, _ = fit_cluster_assignments(matrix, 3)
        assert list(first_labels) == list(second_labels)

    def test_separated_groups_land_in_separate_clusters(self):
        labels, _ = fit_cluster_assignments(make_three_separated_groups(12), 3)
        # Each block of 12 built around one centre should share a label.
        for group_index in range(3):
            block = labels[group_index * 12 : (group_index + 1) * 12]
            assert len(set(block)) == 1


class TestMembershipWeights:
    def test_each_players_weights_sum_to_one(self):
        matrix = make_three_separated_groups()
        _, centroids = fit_cluster_assignments(matrix, 3)
        weights = calculate_membership_weights(matrix, centroids)
        assert weights.sum(axis=1) == pytest.approx(np.ones(len(matrix)))

    def test_strongest_membership_is_always_the_assigned_cluster(self):
        # The property the whole module is arranged around. Checked on
        # deliberately overlapping data, because well-separated points would
        # pass this by accident.
        generator = np.random.default_rng(seed=7)
        matrix = generator.normal(0, 1, size=(200, 6)).tolist()
        labels, centroids = fit_cluster_assignments(matrix, 5)
        weights = calculate_membership_weights(matrix, centroids)
        assert list(weights.argmax(axis=1)) == list(labels)

    def test_a_player_sitting_on_a_centroid_is_mostly_that_archetype(self):
        centroids = [[0.0, 0.0], [10.0, 0.0]]
        weights = calculate_membership_weights([[0.0, 0.0]], centroids)
        assert weights[0][0] > 0.99

    def test_a_player_between_two_centroids_is_split_between_them(self):
        # The tweener case soft membership exists for.
        centroids = [[0.0, 0.0], [4.0, 0.0]]
        weights = calculate_membership_weights([[2.0, 0.0]], centroids)
        assert weights[0][0] == pytest.approx(weights[0][1])

    def test_a_higher_temperature_spreads_a_player_wider(self):
        centroids = [[0.0, 0.0], [4.0, 0.0]]
        player = [[1.0, 0.0]]
        sharp = calculate_membership_weights(player, centroids, temperature=0.5)
        soft = calculate_membership_weights(player, centroids, temperature=2.0)
        assert soft[0].max() < sharp[0].max()


class TestSelectingTopMemberships:
    def test_keeps_at_most_the_maximum_and_orders_them_strongest_first(self):
        weights = np.array([0.05, 0.40, 0.30, 0.20, 0.05])
        selected = select_top_memberships(weights, maximum_stored=3, minimum_weight=0.10)
        assert [cluster_id for cluster_id, _ in selected] == [1, 2, 3]
        assert [round(weight, 2) for _, weight in selected] == [0.40, 0.30, 0.20]

    def test_drops_secondaries_under_the_floor(self):
        # A player who is overwhelmingly one archetype should show one
        # archetype, not one archetype and two rounding errors.
        weights = np.array([0.92, 0.05, 0.03])
        selected = select_top_memberships(weights, maximum_stored=3, minimum_weight=0.10)
        assert len(selected) == 1
        assert selected[0][0] == 0

    def test_the_strongest_survives_even_below_the_floor(self):
        # A genuine tweener spread across nine archetypes still has a
        # primary one; they are not a player without an archetype.
        weights = np.array([0.08, 0.07, 0.07])
        selected = select_top_memberships(weights, maximum_stored=3, minimum_weight=0.10)
        assert len(selected) == 1
        assert selected[0][0] == 0


class TestPlotCoordinates:
    def test_returns_two_coordinates_per_player(self):
        matrix = make_three_separated_groups()
        coordinates, variance_ratios = project_to_plot_coordinates(matrix)
        assert coordinates.shape == (len(matrix), 2)
        assert len(variance_ratios) == 2

    def test_a_component_whose_largest_loading_is_negative_gets_flipped(self):
        # PCA fixes each axis only up to sign, so the map would mirror-flip
        # between fits without this. The rule is arbitrary but must be fixed.
        signs = canonicalize_component_signs(np.array([[-0.9, 0.1], [0.2, 0.8]]))
        assert list(signs) == [-1.0, 1.0]

    def test_sign_canonicalisation_is_stable_under_a_mirrored_fit(self):
        # Same axes, opposite sign — as a re-fit may legitimately produce.
        components = np.array([[0.9, -0.1], [-0.2, 0.8]])
        first = canonicalize_component_signs(components)
        mirrored = canonicalize_component_signs(-components)
        assert list(first) == [-sign for sign in mirrored]
