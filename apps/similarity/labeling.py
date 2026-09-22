"""Carries human-assigned archetype names across re-fits.

THE PROBLEM. K-Means numbers its clusters arbitrarily. Nothing in the
algorithm ties cluster 0 to any particular kind of player, and the
numbering changes whenever the fit changes — a new season's data, a tuned
eligibility floor, a different k. Fitting this project's own data three
times put the rim-running bigs in cluster 0 at k=6, cluster 6 at k=8 and
cluster 0 again at k=9. So a names file keyed on cluster id would silently
relabel half the league the first time anyone re-ran the model, and
nothing would look broken: every player would still have an archetype, and
they would all be wrong.

THE FIX. Store each name against the CENTROID it was assigned to — the
shape of the player at the middle of that group. On a re-fit, match each
new centroid to the nearest stored one and carry its name over. Cluster
numbering stops mattering, because the name follows the shape.

WHY THE STORED CENTROIDS ARE IN REAL UNITS. Matching happens in
standardized space, where distance is meaningful, but a z-score is
relative to whoever was in the pool when it was computed: the same player
scores differently once the eligibility floor moves or a season's rosters
turn over. Points per 36 and inches of height do not drift that way. So
the committed reference centroids are real units, and this module
standardizes them against the CURRENT fit before matching.

Names themselves live in archetype_labels.py, which is committed and
edited by hand — see assign_archetype_names below for the workflow.
"""

import numpy as np
from scipy.optimize import linear_sum_assignment

# A new centroid further than this from every stored one, measured in the
# standardized space, is treated as a group that did not exist before
# rather than as a moved version of an old one. Eight standardized
# dimensions of separation is a long way: in practice a cluster that
# merely shifts between seasons lands well inside it, while a genuinely
# new group (a k that split one archetype into two) lands outside.
MAXIMUM_MATCH_DISTANCE = 8.0

UNNAMED_ARCHETYPE = "Unnamed archetype"


def standardize_reference_centroid(reference_centroid, column_means, column_standard_deviations):
    """Converts a stored real-units centroid into the current fit's
    standardized space so it can be compared with a fresh centroid.

    Args:
        reference_centroid: a centroid in real units, in FEATURE_NAMES order.
        column_means: the current fit's per-column means.
        column_standard_deviations: the current fit's per-column deviations.

    Returns:
        The centroid as a list of z-scores. A column with zero variance in
        the current fit contributes 0.0, matching how
        features.standardize_feature_matrix treats it.
    """
    standardized = []
    for column_index, value in enumerate(reference_centroid):
        standard_deviation = column_standard_deviations[column_index]
        if standard_deviation == 0:
            standardized.append(0.0)
        else:
            standardized.append((value - column_means[column_index]) / standard_deviation)
    return standardized


def assign_archetype_names(
    cluster_centroids, labelled_archetypes, column_means, column_standard_deviations
):
    """Matches this fit's clusters to the committed archetype names.

    Matching is one-to-one and globally optimal rather than greedy: a
    greedy pass can hand the same name to two clusters, or spend a name on
    a mediocre match and leave a much better one unnamed. The Hungarian
    assignment minimises total distance across all pairs at once, so each
    name is used at most once and lands where it fits best overall.

    Args:
        cluster_centroids: this fit's centroids, in standardized space,
            indexed by cluster id.
        labelled_archetypes: the committed list from archetype_labels.py,
            each a dict with "name" and "reference_centroid" (real units).
        column_means: the current fit's per-column means.
        column_standard_deviations: the current fit's per-column deviations.

    Returns:
        A dict of cluster id -> name. A cluster with no acceptable match —
        because there are more clusters than committed names, or because
        it sits further than MAXIMUM_MATCH_DISTANCE from every one of them
        — maps to UNNAMED_ARCHETYPE. That is deliberately visible rather
        than silently approximated: it means a human needs to look at the
        fit and name something, which is exactly the situation where
        guessing does the most damage.
    """
    if not labelled_archetypes:
        return {cluster_id: UNNAMED_ARCHETYPE for cluster_id in range(len(cluster_centroids))}

    centroid_array = np.array(cluster_centroids)
    reference_array = np.array(
        [
            standardize_reference_centroid(
                archetype["reference_centroid"], column_means, column_standard_deviations
            )
            for archetype in labelled_archetypes
        ]
    )

    # Rows are this fit's clusters, columns are the committed names.
    distances = np.linalg.norm(
        centroid_array[:, np.newaxis, :] - reference_array[np.newaxis, :, :], axis=2
    )
    cluster_indexes, label_indexes = linear_sum_assignment(distances)

    name_by_cluster_id = {
        cluster_id: UNNAMED_ARCHETYPE for cluster_id in range(len(cluster_centroids))
    }
    for cluster_index, label_index in zip(cluster_indexes, label_indexes):
        if distances[cluster_index][label_index] <= MAXIMUM_MATCH_DISTANCE:
            name_by_cluster_id[int(cluster_index)] = labelled_archetypes[label_index]["name"]
    return name_by_cluster_id


def format_labels_file(clusters, season: str) -> str:
    """Renders a starter archetype_labels.py from a fit, with the centroids
    filled in and the names left for a human.

    This exists so that naming a fit is a matter of typing nine names, not
    of transcribing nine fifteen-element vectors by hand. The generated
    file is meant to be committed and then edited: replace each
    placeholder name, keep the centroid as generated.

    Args:
        clusters: one dict per cluster with "cluster_id", "size",
            "raw_centroid" (real units, FEATURE_NAMES order) and
            "representative_players".
        season: the season the fit came from, recorded in the file so a
            later reader knows what the centroids describe.

    Returns:
        The complete text of an archetype_labels.py module.
    """
    lines = [
        '"""Archetype names, assigned by hand and committed.',
        "",
        "Generated by explore_fit.py --emit-labels and then EDITED: the",
        "centroids come from the model, the names come from a person. See",
        "labeling.py for why the names are stored against centroids rather",
        "than against cluster numbers.",
        "",
        f"Reference fit: {season} regular season, k={len(clusters)}.",
        "",
        "Re-generating this file discards the names. To re-fit while keeping",
        "them, leave this file alone — labeling.assign_archetype_names matches",
        "the new clusters to these centroids.",
        '"""',
        "",
        "ARCHETYPE_LABELS = [",
    ]

    for cluster in clusters:
        representative = ", ".join(cluster["representative_players"][:4])
        centroid = ", ".join(f"{value:.4f}" for value in cluster["raw_centroid"])
        lines.extend(
            [
                "    {",
                f'        # {cluster["size"]} players. Closest: {representative}.',
                f'        "name": "TODO name cluster {cluster["cluster_id"]}",',
                f"        \"reference_centroid\": [{centroid}],",
                "    },",
            ]
        )

    lines.extend(["]", ""])
    return "\n".join(lines)
