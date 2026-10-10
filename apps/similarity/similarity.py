"""Finds each player's most stylistically similar players.

Independent of the clustering on purpose. Nearest neighbours in the
standardized feature space answer "who plays like this player" directly,
without first having to agree on how many groups the league divides into
or what to call them. That makes this the more robust half of the feature:
it stays useful exactly where the cluster boundaries are most debatable,
which — at a silhouette around 0.14 — is most places.

SIMILAR IN STYLE, NEVER IN QUALITY. Two players can sit on top of each
other here and be far apart in ability: the feature set measures shot
diet, playmaking load, size and rebounding, not whether any of it goes in
more often than it should. Nothing built on this should rank players.
"""

import numpy as np

# Distance is unbounded and means nothing to a reader, so it is converted to
# a 0-100 score for display. The conversion decays exponentially against the
# average distance between players in this fit, which keeps the scale
# meaningful across seasons: a score of 100 is an identical player and the
# mid-range lands on players who are genuinely comparable, rather than on
# whatever the single most extreme outlier that season happened to be. A
# max-distance normalisation would hand that outlier control of the scale.
SIMILARITY_SCORE_CEILING = 100.0


def calculate_similarity_score(distance: float, decay_scale: float) -> float:
    """Converts a distance into a 0-100 similarity score.

    Args:
        distance: Euclidean distance between two players in standardized space.
        decay_scale: the distance at which similarity falls to 1/e of its
            maximum, normally the mean pairwise distance for this fit.

    Returns:
        A score in (0, 100]. Identical players score 100; the score falls
        smoothly and never reaches 0, because no two players are infinitely
        dissimilar and pretending otherwise would misread the scale.
    """
    if decay_scale <= 0:
        # Every player identical, which happens only on a degenerate fit.
        # Everyone is then maximally similar to everyone, which is true.
        return SIMILARITY_SCORE_CEILING
    return float(SIMILARITY_SCORE_CEILING * np.exp(-distance / decay_scale))


def calculate_pairwise_distances(standardized_matrix):
    """Computes the full player-to-player distance matrix.

    A dense matrix is the right tool at this size: a few hundred eligible
    players is tens of thousands of cells, which is nothing, and having all
    of them makes the decay scale below a property of the whole fit rather
    than of whichever neighbours happened to be queried.

    Args:
        standardized_matrix: z-scored features, one row per player.

    Returns:
        A (players, players) array of Euclidean distances.
    """
    feature_array = np.array(standardized_matrix)
    differences = feature_array[:, np.newaxis, :] - feature_array[np.newaxis, :, :]
    return np.linalg.norm(differences, axis=2)


def calculate_decay_scale(distance_matrix) -> float:
    """Returns the mean distance between two distinct players in this fit.

    Used as the scale for calculate_similarity_score so that scores mean
    the same thing from one season to the next even if the league's spread
    changes.
    """
    player_count = len(distance_matrix)
    if player_count < 2:
        return 0.0
    off_diagonal = ~np.eye(player_count, dtype=bool)
    return float(distance_matrix[off_diagonal].mean())


def find_similar_players(standardized_matrix, neighbour_count: int):
    """Finds each player's nearest neighbours, strongest first.

    A player is never their own neighbour: their distance to themselves is
    zero, so without excluding the diagonal every player's top match would
    be themselves at a perfect score.

    Args:
        standardized_matrix: z-scored features, one row per player.
        neighbour_count: how many neighbours to keep per player.

    Returns:
        A list, one entry per player in matrix row order, of lists of
        (neighbour_index, rank, similarity_score). `rank` starts at 1.
        Fewer than neighbour_count entries come back when the fit holds
        fewer players than that.
    """
    distance_matrix = calculate_pairwise_distances(standardized_matrix)
    decay_scale = calculate_decay_scale(distance_matrix)
    player_count = len(distance_matrix)

    neighbours_by_player = []
    for player_index in range(player_count):
        distances = distance_matrix[player_index].copy()
        # Excluded rather than skipped after sorting, so the neighbour count
        # is honoured exactly instead of coming back one short.
        distances[player_index] = np.inf
        nearest_first = np.argsort(distances)[: min(neighbour_count, player_count - 1)]
        neighbours_by_player.append(
            [
                (
                    int(neighbour_index),
                    rank_index + 1,
                    calculate_similarity_score(
                        float(distances[neighbour_index]), decay_scale
                    ),
                )
                for rank_index, neighbour_index in enumerate(nearest_first)
            ]
        )
    return neighbours_by_player
