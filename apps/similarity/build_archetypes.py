"""Fits one season's archetype model and writes it to the database.

The only script here that writes. Everything it writes goes into the four
tables apps/similarity owns — Archetype, PlayerArchetype,
PlayerArchetypeMembership, PlayerSimilarity — and it touches nothing the
API or the ingestion pipeline maintains.

IT DOES NOT WRITE UNLESS ASKED. Without --apply it computes the whole model
and prints what it would do, which is the useful default for three reasons:
the development database holds too little data to fit anything meaningful,
the production database is where the real fit lives, and a fit whose
clusters have drifted needs a person to re-read them before its names are
trusted (see archetype_labels.py). A dry run against production is safe by
construction — the connection is opened read-only, so the server rejects
writes rather than relying on this script not to attempt one.

    python build_archetypes.py                      # dry run, newest season
    python build_archetypes.py --season 2025-26     # dry run, one season
    python build_archetypes.py --season 2025-26 --apply

Re-running for a season REPLACES that season's rows rather than adding to
them, in a single transaction. A half-written model is worse than no model:
players would keep archetypes from a fit whose centroids no longer exist.
"""

import argparse
import sys
import uuid

import clustering
import db
import similarity
from archetype_labels import ARCHETYPE_LABELS
from labeling import assign_archetype_names
from player_seasons import (
    build_season_feature_matrix,
    fetch_latest_season_with_box_scores,
    fetch_player_box_scores,
)

# How many archetypes to fit. Chosen for interpretability rather than by
# score: silhouette is nearly flat from k=4 to k=9 on this data, so the
# number is settled by which grouping reads like real basketball roles.
# Treat it as a tuned constant, the way four_factors.py treats
# MINIMUM_GAMES_FOR_REGRESSION.
ARCHETYPE_COUNT = 9

# The few archetypes shown per player, and the floor under which one is
# rounding noise rather than a real secondary style.
MAXIMUM_MEMBERSHIPS_PER_PLAYER = 3
MINIMUM_MEMBERSHIP_WEIGHT = 0.10

SIMILAR_PLAYERS_PER_PLAYER = 5

# An archetype describing three players is not an archetype. K-Means will
# happily split a dozen players into nine groups of one or two and report
# no error at all, so the floor has to be a ratio rather than merely "more
# players than clusters" — a near-empty development database otherwise
# produces a full, confident, meaningless model.
MINIMUM_PLAYERS_PER_ARCHETYPE = 10


def parse_arguments():
    """Reads the season, and whether to actually write, from the command line."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--season",
        help="Season to fit, e.g. 2025-26. Defaults to the newest with box scores.",
    )
    parser.add_argument(
        "--k",
        type=int,
        default=ARCHETYPE_COUNT,
        help=f"How many archetypes to fit. Default {ARCHETYPE_COUNT}.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually write. Without it the script computes and prints only.",
    )
    return parser.parse_args()


def build_model_version(cluster_count: int) -> str:
    """Names the model that produced a row, following GamePrediction.modelVersion.

    Lets a reader see whether a stored archetype came from the current model
    or from an older run nobody has recomputed.
    """
    return f"kmeans-gmm-k{cluster_count}"


def build_archetype_rows(season, cluster_count, labels, centroids, column_means, column_deviations):
    """Builds one Archetype row per cluster, named by matching this fit's
    centroids against the committed names.

    Returns:
        A list of dicts carrying a freshly generated id, the label, the
        cluster id, the centroid in REAL units, and the member count.
    """
    name_by_cluster_id = assign_archetype_names(
        centroids.tolist(), ARCHETYPE_LABELS, column_means, column_deviations
    )
    rows = []
    for cluster_id in range(cluster_count):
        # Stored in real units so the name can follow the shape across a
        # re-standardization — see labeling.py.
        real_centroid = [
            float(centroids[cluster_id][column] * column_deviations[column] + column_means[column])
            for column in range(len(column_means))
        ]
        rows.append(
            {
                "id": str(uuid.uuid4()),
                "season": season,
                "label": name_by_cluster_id[cluster_id],
                "clusterId": cluster_id,
                "referenceCentroid": real_centroid,
                "memberCount": int((labels == cluster_id).sum()),
            }
        )
    return rows


def build_player_rows(season, season_features, labels, centroids, membership_weights, plot_coordinates, archetype_rows):
    """Builds the PlayerArchetype and PlayerArchetypeMembership rows.

    Returns:
        (player_rows, membership_rows). Membership rows reference an
        archetype by id rather than by name, so renaming an archetype later
        touches one Archetype row and nothing here.
    """
    archetype_id_by_cluster = {row["clusterId"]: row["id"] for row in archetype_rows}
    player_rows = []
    membership_rows = []

    for player_index, player_id in enumerate(season_features["player_ids"]):
        player_archetype_id = str(uuid.uuid4())
        cluster_id = int(labels[player_index])
        standardized_row = season_features["standardized_matrix"][player_index]
        distance = float(
            sum(
                (standardized_row[column] - centroids[cluster_id][column]) ** 2
                for column in range(len(standardized_row))
            )
            ** 0.5
        )

        player_rows.append(
            {
                "id": player_archetype_id,
                "playerId": player_id,
                "season": season,
                "featureVector": standardized_row,
                "distanceToCentroid": distance,
                "plotX": float(plot_coordinates[player_index][0]),
                "plotY": float(plot_coordinates[player_index][1]),
            }
        )

        for rank, (member_cluster_id, weight) in enumerate(
            clustering.select_top_memberships(
                membership_weights[player_index],
                MAXIMUM_MEMBERSHIPS_PER_PLAYER,
                MINIMUM_MEMBERSHIP_WEIGHT,
            ),
            start=1,
        ):
            membership_rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "playerArchetypeId": player_archetype_id,
                    "archetypeId": archetype_id_by_cluster[member_cluster_id],
                    "rank": rank,
                    "weight": weight,
                }
            )

    return player_rows, membership_rows


def build_similarity_rows(season, season_features):
    """Builds the PlayerSimilarity rows — each player's nearest neighbours."""
    neighbours_by_player = similarity.find_similar_players(
        season_features["standardized_matrix"], SIMILAR_PLAYERS_PER_PLAYER
    )
    player_ids = season_features["player_ids"]
    rows = []
    for player_index, neighbours in enumerate(neighbours_by_player):
        for neighbour_index, rank, score in neighbours:
            rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "playerId": player_ids[player_index],
                    "similarPlayerId": player_ids[neighbour_index],
                    "season": season,
                    "rank": rank,
                    "similarityScore": score,
                }
            )
    return rows


def delete_season(cursor, season: str) -> None:
    """Removes a season's existing model rows so a re-run replaces rather
    than duplicates.

    PlayerArchetypeMembership is not deleted explicitly: it cascades from
    both PlayerArchetype and Archetype. Archetype is deleted last because
    memberships still reference it while they exist.
    """
    cursor.execute('DELETE FROM "PlayerSimilarity" WHERE season = %s', (season,))
    cursor.execute('DELETE FROM "PlayerArchetype" WHERE season = %s', (season,))
    cursor.execute('DELETE FROM "Archetype" WHERE season = %s', (season,))


def write_model(connection, season, archetype_rows, player_rows, membership_rows, similarity_rows, model_version):
    """Writes one season's model in a single transaction.

    Everything or nothing: a partially written model would leave players
    holding archetypes whose centroids had already been replaced.
    """
    import json

    with connection.cursor() as cursor:
        delete_season(cursor, season)

        for row in archetype_rows:
            cursor.execute(
                'INSERT INTO "Archetype" (id, season, label, "clusterId", '
                '"referenceCentroid", "memberCount", "modelVersion") '
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (
                    row["id"], row["season"], row["label"], row["clusterId"],
                    json.dumps(row["referenceCentroid"]), row["memberCount"], model_version,
                ),
            )

        for row in player_rows:
            cursor.execute(
                'INSERT INTO "PlayerArchetype" (id, "playerId", season, "featureVector", '
                '"distanceToCentroid", "plotX", "plotY", "modelVersion") '
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    row["id"], row["playerId"], row["season"],
                    json.dumps(row["featureVector"]), row["distanceToCentroid"],
                    row["plotX"], row["plotY"], model_version,
                ),
            )

        for row in membership_rows:
            cursor.execute(
                'INSERT INTO "PlayerArchetypeMembership" (id, "playerArchetypeId", '
                '"archetypeId", rank, weight) VALUES (%s, %s, %s, %s, %s)',
                (row["id"], row["playerArchetypeId"], row["archetypeId"], row["rank"], row["weight"]),
            )

        for row in similarity_rows:
            cursor.execute(
                'INSERT INTO "PlayerSimilarity" (id, "playerId", "similarPlayerId", '
                'season, rank, "similarityScore", "modelVersion") '
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (
                    row["id"], row["playerId"], row["similarPlayerId"], row["season"],
                    row["rank"], row["similarityScore"], model_version,
                ),
            )

    connection.commit()


def print_plan(season, season_features, archetype_rows, player_rows, membership_rows, similarity_rows, explained_variance):
    """Prints what the fit produced, whether or not it is about to be written."""
    print(f"\nSeason {season} - whole season")
    print(f"  eligible players:  {len(player_rows)}")
    print(f"  archetypes:        {len(archetype_rows)}")
    print(f"  memberships:       {len(membership_rows)}")
    print(f"  similarity rows:   {len(similarity_rows)}")
    print(
        f"  map variance:      PC1 {explained_variance[0]:.1%}, "
        f"PC2 {explained_variance[1]:.1%}"
    )

    print("\n  archetype                 members")
    for row in sorted(archetype_rows, key=lambda r: -r["memberCount"]):
        print(f"    {row['label']:<24} {row['memberCount']:>4}")

    memberships_per_player = len(membership_rows) / len(player_rows) if player_rows else 0
    print(f"\n  average archetypes shown per player: {memberships_per_player:.2f}")


def main() -> None:
    # NBA rosters carry diacritics that a Windows console codepage cannot
    # encode; without this, printing a roster crashes mid-report.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    arguments = parse_arguments()
    writing = arguments.apply
    print(f"Reading {db.describe_connection_target()}" + ("" if writing else " (read-only)"))

    connection = db.get_connection(read_only=not writing)
    try:
        season = arguments.season or fetch_latest_season_with_box_scores(connection)
        box_scores_by_player = fetch_player_box_scores(connection, season)
        season_features = build_season_feature_matrix(box_scores_by_player)

        eligible_count = len(season_features["player_ids"])
        minimum_eligible = arguments.k * MINIMUM_PLAYERS_PER_ARCHETYPE
        if eligible_count < minimum_eligible:
            raise RuntimeError(
                f"Only {eligible_count} eligible players in {season}. Fitting "
                f"{arguments.k} archetypes needs at least {minimum_eligible} "
                f"({MINIMUM_PLAYERS_PER_ARCHETYPE} per archetype) for the groups to "
                "mean anything. Point DATABASE_URL at a database with a fully "
                "ingested season, or lower --k."
            )

        labels, centroids = clustering.fit_cluster_assignments(
            season_features["standardized_matrix"], arguments.k
        )
        membership_weights = clustering.calculate_membership_weights(
            season_features["standardized_matrix"], centroids
        )
        plot_coordinates, explained_variance = clustering.project_to_plot_coordinates(
            season_features["standardized_matrix"]
        )

        archetype_rows = build_archetype_rows(
            season, arguments.k, labels, centroids,
            season_features["column_means"], season_features["column_standard_deviations"],
        )
        player_rows, membership_rows = build_player_rows(
            season, season_features, labels, centroids,
            membership_weights, plot_coordinates, archetype_rows,
        )
        similarity_rows = build_similarity_rows(season, season_features)

        print_plan(
            season, season_features, archetype_rows, player_rows,
            membership_rows, similarity_rows, explained_variance,
        )

        if not writing:
            print("\n  DRY RUN - nothing written. Re-run with --apply to write.")
            return

        write_model(
            connection, season, archetype_rows, player_rows,
            membership_rows, similarity_rows, build_model_version(arguments.k),
        )
        print(f"\n  Written to {db.describe_connection_target()}.")
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as refusal:
        # Not enough data to fit, or nothing ingested yet. These are
        # expected answers rather than failures, so they get a sentence and
        # a non-zero exit code instead of a stack trace.
        print(f"\n  {refusal}", file=sys.stderr)
        sys.exit(1)
