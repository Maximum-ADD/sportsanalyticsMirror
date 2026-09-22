"""Tests for labeling.py.

The property this file exists to protect: a committed archetype name
follows the SHAPE of a cluster, never its number. K-Means renumbers its
clusters on every fit, so a names file keyed on cluster id would relabel
players wholesale on a re-run while looking perfectly healthy — every
player would still have an archetype and they would all be wrong.

test_names_follow_the_shape_not_the_cluster_number is the test that would
catch that regression; the rest guard the edges around it.
"""

import pytest

from labeling import (
    MAXIMUM_MATCH_DISTANCE,
    UNNAMED_ARCHETYPE,
    assign_archetype_names,
    format_labels_file,
    standardize_reference_centroid,
)

# A tiny three-feature space, so the arithmetic stays checkable by hand.
# Means of 0 and deviations of 1 mean the stored real-unit centroids and
# the standardized ones coincide, which keeps these tests about matching
# rather than about standardization.
IDENTITY_MEANS = [0.0, 0.0, 0.0]
IDENTITY_DEVIATIONS = [1.0, 1.0, 1.0]

BIG_SHAPE = [10.0, 0.0, 0.0]
GUARD_SHAPE = [0.0, 10.0, 0.0]
WING_SHAPE = [0.0, 0.0, 10.0]


def make_labels(*named_shapes) -> list[dict]:
    """Builds a committed-labels list from (name, centroid) pairs."""
    return [
        {"name": name, "reference_centroid": centroid} for name, centroid in named_shapes
    ]


class TestAssigningNames:
    def test_carries_a_name_across_a_centroid_that_barely_moved(self):
        # A new season nudges the centroid; the name should follow it.
        labels = make_labels(("Traditional big", BIG_SHAPE))
        nudged_big = [10.2, 0.1, -0.1]
        names = assign_archetype_names(
            [nudged_big], labels, IDENTITY_MEANS, IDENTITY_DEVIATIONS
        )
        assert names == {0: "Traditional big"}

    def test_names_follow_the_shape_not_the_cluster_number(self):
        # The regression this module exists to prevent. Same three groups,
        # emitted by the fit in the opposite order: each name must move
        # with its shape rather than stay on its old index.
        labels = make_labels(
            ("Traditional big", BIG_SHAPE),
            ("Pass-first guard", GUARD_SHAPE),
            ("Scoring wing", WING_SHAPE),
        )
        reshuffled_fit = [WING_SHAPE, GUARD_SHAPE, BIG_SHAPE]
        names = assign_archetype_names(
            reshuffled_fit, labels, IDENTITY_MEANS, IDENTITY_DEVIATIONS
        )
        assert names == {
            0: "Scoring wing",
            1: "Pass-first guard",
            2: "Traditional big",
        }

    def test_a_name_is_never_used_twice(self):
        # Two clusters near the same stored centroid. A greedy match could
        # hand both the same name; the assignment must be one-to-one.
        labels = make_labels(
            ("Traditional big", BIG_SHAPE),
            ("Stretch big", [9.0, 0.0, 1.0]),
        )
        two_similar_bigs = [[10.1, 0.0, 0.0], [9.1, 0.0, 1.0]]
        names = assign_archetype_names(
            two_similar_bigs, labels, IDENTITY_MEANS, IDENTITY_DEVIATIONS
        )
        assert sorted(names.values()) == ["Stretch big", "Traditional big"]

    def test_a_genuinely_new_group_is_left_unnamed(self):
        # Far from every stored centroid: this is a group that did not
        # exist before, not a moved version of an old one. Saying so is
        # better than stretching the nearest name to cover it.
        labels = make_labels(("Traditional big", BIG_SHAPE))
        far_away = [0.0, 0.0, BIG_SHAPE[0] + MAXIMUM_MATCH_DISTANCE + 5.0]
        names = assign_archetype_names(
            [far_away], labels, IDENTITY_MEANS, IDENTITY_DEVIATIONS
        )
        assert names == {0: UNNAMED_ARCHETYPE}

    def test_more_clusters_than_names_leaves_the_extras_unnamed(self):
        # Raising k without naming the new cluster. The extra must surface
        # as unnamed rather than stealing a name from a real match.
        labels = make_labels(("Traditional big", BIG_SHAPE))
        names = assign_archetype_names(
            [BIG_SHAPE, GUARD_SHAPE], labels, IDENTITY_MEANS, IDENTITY_DEVIATIONS
        )
        assert names[0] == "Traditional big"
        assert names[1] == UNNAMED_ARCHETYPE

    def test_no_committed_names_yet_leaves_everything_unnamed(self):
        # The first-ever fit, before anyone has written archetype_labels.py.
        names = assign_archetype_names(
            [BIG_SHAPE, GUARD_SHAPE], [], IDENTITY_MEANS, IDENTITY_DEVIATIONS
        )
        assert names == {0: UNNAMED_ARCHETYPE, 1: UNNAMED_ARCHETYPE}


class TestStandardizingAStoredCentroid:
    def test_converts_real_units_into_the_current_fits_z_scores(self):
        # Stored as 20 points and 78 inches; the current fit averages 15
        # points (sd 5) and 80 inches (sd 4).
        standardized = standardize_reference_centroid([20.0, 78.0], [15.0, 80.0], [5.0, 4.0])
        assert standardized == pytest.approx([1.0, -0.5])

    def test_a_column_with_no_variance_contributes_nothing(self):
        # Matches features.standardize_feature_matrix rather than dividing
        # by zero: a feature nobody differs on says nothing about matching.
        standardized = standardize_reference_centroid([20.0, 78.0], [15.0, 78.0], [5.0, 0.0])
        assert standardized == pytest.approx([1.0, 0.0])


class TestStarterLabelsFile:
    def make_cluster(self, cluster_id: int) -> dict:
        return {
            "cluster_id": cluster_id,
            "size": 30,
            "raw_centroid": [14.83, 7.31, 83.15],
            "representative_players": ["Neemias Queta", "Jakob Poeltl"],
        }

    def test_generates_an_importable_module_with_placeholder_names(self):
        source = format_labels_file([self.make_cluster(0), self.make_cluster(1)], "2025-26")
        namespace = {}
        exec(compile(source, "archetype_labels.py", "exec"), namespace)

        labels = namespace["ARCHETYPE_LABELS"]
        assert len(labels) == 2
        assert all("TODO" in label["name"] for label in labels)
        assert labels[0]["reference_centroid"] == pytest.approx([14.83, 7.31, 83.15])

    def test_records_the_season_and_k_it_came_from(self):
        # A centroid is meaningless without knowing what it describes.
        source = format_labels_file([self.make_cluster(0)], "2025-26")
        assert "2025-26" in source
        assert "k=1" in source

    def test_names_the_representative_players_so_the_clusters_are_recognisable(self):
        source = format_labels_file([self.make_cluster(0)], "2025-26")
        assert "Jakob Poeltl" in source
