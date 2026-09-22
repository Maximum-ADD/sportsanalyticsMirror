"""Fits the archetype model and prints what it found. Writes nothing, ever.

This exists because three decisions in the archetype design cannot be made
from a desk, only from the data:

  1. HOW MANY CLUSTERS. Silhouette scores narrow the range; the final pick
     is whichever k produces groups a basketball fan would recognise. This
     script prints both so the judgement call is informed rather than blind.
  2. WHETHER THE 2D MAP IS WORTH BUILDING. The planned "view clusters"
     screen plots players by their first two principal components. If those
     two components carry little of the variance, the plot is a fog with no
     visible groups, and a screen that shows the model failing is worse
     than no screen. The explained-variance figure printed here decides
     whether that page gets built, and it is much cheaper to learn now.
  3. WHAT THE CLUSTERS ARE CALLED. Clustering produces unlabeled groups; a
     human names them. That needs each centroid described in real units
     (not z-scores) next to the players sitting closest to it.

Run it against a fully ingested season. The connection is opened read-only,
so pointing DATABASE_URL at production to look at real data is safe by
construction — the server rejects writes rather than trusting this script
not to attempt one.

    python explore_fit.py --list-seasons
    python explore_fit.py [--season 2025-26] [--k 9] [--k-range 4 12]
    python explore_fit.py --k 9 --emit-labels archetype_labels.py

A fit covers a WHOLE season, every segment together — see player_seasons.py
for why the segments are not fitted separately.
"""

import argparse
import sys

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score

import db
from features import FEATURE_NAMES
from labeling import format_labels_file
from player_seasons import (
    EXCLUDED_INCOMPLETE_DATA,
    EXCLUDED_NOT_ENOUGH_MINUTES,
    build_season_feature_matrix,
    fetch_available_seasons,
    fetch_latest_season_with_box_scores,
    fetch_player_box_scores,
)

# Fixed so that two runs over the same data give the same answer. Every
# random choice in this service is seeded for the same reason the project
# seeds its other models: a cluster that moves between runs cannot carry a
# human-assigned name forward.
RANDOM_SEED = 42

# How many players to name per cluster when describing it. Enough to
# recognise a group, few enough to read.
REPRESENTATIVE_PLAYERS_PER_CLUSTER = 6

# Features whose centroid values are worth printing when naming a cluster.
# The full vector is 15 columns, which is more than can be read at a
# glance; these are the ones that actually distinguish playing styles.
NAMING_FEATURES = [
    "points_per_36",
    "assists_per_36",
    "defensive_rebounds_per_36",
    "steals_per_36",
    "blocks_per_36",
    "three_point_attempt_rate",
    "free_throw_rate",
    "usage_percentage",
    "height_inches",
]


def parse_arguments():
    """Reads the season and the range of k values to try from the command line."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--season",
        help="Season to fit, e.g. 2025-26. Defaults to the newest season with box scores.",
    )
    parser.add_argument(
        "--segment",
        choices=["REGULAR", "PLAYOFFS", "PLAY_IN", "FINALS"],
        help=(
            "Restrict to one segment. For diagnosing a season's data only "
            "- the model is fit on a whole season, since no single segment "
            "carries enough games to place centroids."
        ),
    )
    parser.add_argument(
        "--list-seasons",
        action="store_true",
        help="Print the seasons that have box scores, and exit.",
    )
    parser.add_argument(
        "--k",
        type=int,
        help="Describe this many clusters instead of the best-scoring k.",
    )
    parser.add_argument(
        "--emit-labels",
        metavar="PATH",
        help=(
            "Write a starter archetype_labels.py for the described k, with "
            "centroids filled in and names left as TODO. Refuses to "
            "overwrite an existing file, since that would discard names."
        ),
    )
    parser.add_argument(
        "--k-range",
        nargs=2,
        type=int,
        default=[4, 12],
        metavar=("LOW", "HIGH"),
        help="Inclusive range of cluster counts to score. Default: 4 12.",
    )
    return parser.parse_args()


def score_cluster_counts(standardized_matrix, k_low: int, k_high: int) -> list[dict]:
    """Fits K-Means for each k in the range and scores how well-separated
    the resulting clusters are.

    Silhouette score runs from -1 to 1 and answers "is each player closer to
    its own cluster than to the next one?". Around 0.5 is strong structure;
    around 0.25 means the groups are boundaries drawn through a continuum
    rather than genuinely separate populations. Basketball data usually
    scores low, because playing styles really are a continuum — a low score
    is information about the sport, not necessarily a broken model.

    Args:
        standardized_matrix: z-scored features, one row per player.
        k_low, k_high: inclusive range of cluster counts to try.

    Returns:
        One dict per k with its silhouette score and resulting cluster sizes.
    """
    feature_array = np.array(standardized_matrix)
    scores = []
    for cluster_count in range(k_low, k_high + 1):
        model = KMeans(n_clusters=cluster_count, random_state=RANDOM_SEED, n_init=10)
        labels = model.fit_predict(feature_array)
        scores.append(
            {
                "k": cluster_count,
                "silhouette": silhouette_score(feature_array, labels),
                "cluster_sizes": sorted(np.bincount(labels).tolist(), reverse=True),
            }
        )
    return scores


def describe_map_layout(standardized_matrix) -> dict:
    """Measures how much of the players' variation survives being flattened
    to the two dimensions the planned cluster map would plot.

    Args:
        standardized_matrix: z-scored features, one row per player.

    Returns:
        A dict with each component's share of variance, their combined
        share, and how many components would be needed to retain 80%.
    """
    feature_array = np.array(standardized_matrix)
    full_model = PCA(random_state=RANDOM_SEED).fit(feature_array)
    variance_ratios = full_model.explained_variance_ratio_
    cumulative = np.cumsum(variance_ratios)
    return {
        "first_two_components": variance_ratios[:2].tolist(),
        "first_two_combined": float(cumulative[1]),
        "components_for_80_percent": int(np.searchsorted(cumulative, 0.80) + 1),
    }


def describe_clusters(standardized_matrix, feature_matrix, players, cluster_count: int) -> list[dict]:
    """Fits one K-Means model and describes each cluster in terms a human
    can put a name to.

    Centroids are reported in REAL units rather than z-scores: "22.4 points
    per 36, 78.9 inches" can be recognised as a player type, where "+1.4
    standard deviations" cannot.

    Args:
        standardized_matrix: z-scored features the model is fit on.
        feature_matrix: the same players' raw features, for describing centroids.
        players: Player fields in matrix row order, for naming examples.
        cluster_count: the k to fit.

    Returns:
        One dict per cluster with its size, its centroid in real units, and
        the players sitting closest to that centroid.
    """
    feature_array = np.array(standardized_matrix)
    raw_array = np.array(feature_matrix)
    model = KMeans(n_clusters=cluster_count, random_state=RANDOM_SEED, n_init=10)
    labels = model.fit_predict(feature_array)

    clusters = []
    for cluster_id in range(cluster_count):
        member_indexes = np.flatnonzero(labels == cluster_id)
        distances = np.linalg.norm(
            feature_array[member_indexes] - model.cluster_centers_[cluster_id], axis=1
        )
        closest_first = member_indexes[np.argsort(distances)]
        representative_indexes = closest_first[:REPRESENTATIVE_PLAYERS_PER_CLUSTER]

        raw_centroid = raw_array[member_indexes].mean(axis=0)
        clusters.append(
            {
                "cluster_id": cluster_id,
                "size": len(member_indexes),
                "centroid_by_feature": {
                    name: float(raw_centroid[FEATURE_NAMES.index(name)])
                    for name in NAMING_FEATURES
                },
                # The full vector in real units, for --emit-labels: this is
                # what a committed archetype name is stored against.
                "raw_centroid": raw_centroid.tolist(),
                "representative_players": [
                    f"{players[index]['firstName']} {players[index]['lastName']}"
                    for index in representative_indexes
                ],
            }
        )
    return clusters


def print_report(
    season: str, season_type: str, season_features: dict, k_low: int, k_high: int, chosen_k=None
):
    """Prints the whole exploration: eligibility counts, how many clusters
    the data supports, whether the 2D map is viable, and what the clusters
    look like at the best-scoring k.
    """
    player_count = len(season_features["player_ids"])
    excluded = season_features["excluded_by_player_id"].values()
    too_few_minutes = sum(1 for reason in excluded if reason == EXCLUDED_NOT_ENOUGH_MINUTES)
    incomplete = sum(1 for reason in excluded if reason == EXCLUDED_INCOMPLETE_DATA)

    print(f"\nSeason {season} - {season_type}")
    print(f"  eligible players:            {player_count}")
    print(f"  excluded, not enough minutes {too_few_minutes}")
    print(f"  excluded, incomplete data    {incomplete}")

    if player_count <= k_high:
        print(
            f"\n  Only {player_count} eligible players. That is too few to cluster; "
            "point DATABASE_URL at a database with a fully ingested season."
        )
        return None

    print("\nHow many clusters does the data support?")
    print(f"  {'k':>3}  {'silhouette':>10}  cluster sizes")
    scores = score_cluster_counts(season_features["standardized_matrix"], k_low, k_high)
    for score in scores:
        sizes = ", ".join(str(size) for size in score["cluster_sizes"])
        print(f"  {score['k']:>3}  {score['silhouette']:>10.3f}  {sizes}")

    best = max(scores, key=lambda score: score["silhouette"])
    print(f"\n  Best silhouette at k={best['k']} ({best['silhouette']:.3f}).")
    print("  Treat this as a shortlist, not a verdict - pick the k whose")
    print("  clusters below read like real basketball roles.")

    layout = describe_map_layout(season_features["standardized_matrix"])
    first, second = layout["first_two_components"]
    print("\nIs the 2D cluster map worth building?")
    print(f"  PC1 explains {first:.1%}, PC2 {second:.1%}")
    print(f"  first two components together: {layout['first_two_combined']:.1%}")
    print(f"  components needed for 80% of variance: {layout['components_for_80_percent']}")

    describe_k = chosen_k or best["k"]
    print(f"\nClusters at k={describe_k}, centroids in real units:")
    clusters = describe_clusters(
        season_features["standardized_matrix"],
        season_features["feature_matrix"],
        season_features["players"],
        describe_k,
    )
    for cluster in clusters:
        print(f"\n  Cluster {cluster['cluster_id']} — {cluster['size']} players")
        measurements = "  ".join(
            f"{name}={value:.2f}" for name, value in cluster["centroid_by_feature"].items()
        )
        print(f"    {measurements}")
        print(f"    closest: {', '.join(cluster['representative_players'])}")

    return clusters


def print_available_seasons(seasons) -> None:
    """Prints the seasons that have box scores, and whether each can be fit.

    This is what a season picker in the UI would be built from. A season
    missing usagePercentage entirely cannot produce a single eligible
    player, so it is called out here rather than left to look like a
    modelling failure when the fit comes back empty.
    """
    print(f"\n  {'season':<9} {'games':>6} {'players':>8} {'rows':>7}  usage%")
    for season in seasons:
        stat_rows = season["stat_rows"]
        coverage = season["rows_with_usage"] / stat_rows if stat_rows else 0
        note = "" if coverage > 0 else "   <- no usage%, cannot be fit until backfilled"
        print(
            f"  {season['season']:<9} {season['game_count']:>6} "
            f"{season['player_count']:>8} {stat_rows:>7}  {coverage:>5.0%}{note}"
        )


def write_starter_labels_file(path: str, clusters, season: str) -> None:
    """Writes a starter archetype_labels.py for a human to fill in.

    Refuses to overwrite an existing file. Regenerating over a named file
    would throw away the one part of this service a machine cannot
    reproduce — the names someone chose — and it would do it silently, so
    the refusal is the feature.

    Args:
        path: where to write the module.
        clusters: the described clusters, carrying raw centroids.
        season: the season the fit came from, recorded in the file.
    """
    import os

    if os.path.exists(path):
        print(
            f"\n  {path} already exists; not overwriting it. Delete it first if "
            "you really mean to discard the names in it."
        )
        return

    with open(path, "w", encoding="utf-8") as labels_file:
        labels_file.write(format_labels_file(clusters, season))
    print(f"\n  Wrote {path}. Replace each \"TODO name cluster N\" with a real name.")


def main() -> None:
    # NBA rosters are full of diacritics — Jokic, Vucevic, Bogdanovic and
    # dozens more are stored with them — and a Windows console defaults to
    # a codepage that cannot encode those characters, so printing a roster
    # crashes mid-report. Ask stdout for UTF-8 and degrade rather than die
    # on a terminal that still cannot manage it.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    arguments = parse_arguments()
    print(f"Reading {db.describe_connection_target()} (read-only)")

    connection = db.get_connection(read_only=True)
    try:
        if arguments.list_seasons:
            print_available_seasons(fetch_available_seasons(connection))
            return
        season = arguments.season or fetch_latest_season_with_box_scores(connection)
        box_scores_by_player = fetch_player_box_scores(
            connection, season, arguments.segment
        )
    finally:
        connection.close()

    if arguments.segment:
        print(
            f"\n  Restricted to {arguments.segment}. This is a diagnostic view: the "
            "model is fit on a whole season, because no single segment carries "
            "enough games to place centroids."
        )

    season_features = build_season_feature_matrix(box_scores_by_player)
    clusters = print_report(
        season,
        arguments.segment or "whole season",
        season_features,
        arguments.k_range[0],
        arguments.k_range[1],
        arguments.k,
    )
    if arguments.emit_labels and clusters:
        write_starter_labels_file(arguments.emit_labels, clusters, season)


if __name__ == "__main__":
    main()
