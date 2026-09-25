"""Fits the archetype model: hard cluster assignment, soft membership, and
the 2D coordinates the cluster map is drawn from.

K-MEANS gives each player one cluster: what an archetype row is keyed on,
and what colours a point on the map. Membership weights then say how
strongly that player belongs to EVERY cluster, which is what the top-few
display needs.

Soft membership is not a nicety here. These clusters score around 0.14 on
silhouette, meaning they are boundaries drawn through a continuum rather
than separate populations, so a single hard label overclaims for any player
near an edge — and most players are near an edge.

WHY NOT A GAUSSIAN MIXTURE. The obvious choice is a GMM, and it was tried
first. It fails here twice, both times measured rather than assumed:

  1. It saturates. Over 15 standardized features the likelihood ratio
     between components is enormous, so the posteriors collapse to a hard
     label: the median top weight came out at 0.999, and only 11% of
     players had any second archetype above 10%. That is a one-hot vector
     wearing the costume of a distribution.
  2. Reducing dimensions first fixes the saturation and breaks something
     worse. Fitting the mixture over 3-5 principal components gives usable
     spreads, but its strongest component then DISAGREES with the player's
     K-Means cluster for 18-24% of players. The profile badge and the
     membership bar would contradict each other for one player in five.

So membership is computed directly from distance to the same centroids the
clusters come from, normalised across clusters. It agrees with the hard
label by construction — the nearest centroid is always the strongest
membership — and it claims exactly what it is: a blend, not a probability.
"""

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA

# Fixed so two runs over the same data give the same answer. A cluster that
# moved between runs could not carry a human-assigned name forward, which
# is the whole premise of archetype_labels.py.
RANDOM_SEED = 42

# How many restarts K-Means takes before keeping the best. The default of 1
# is too few to trust on data this overlapping.
KMEANS_RESTARTS = 10

# How sharply membership falls off with distance from a centroid. Larger
# spreads a player across more archetypes, smaller concentrates them on
# their nearest.
#
# A tuned constant, like four_factors.py's MINIMUM_GAMES_FOR_REGRESSION and
# like k itself: there is no value derivable from first principles, so it
# is set from what it produces on a real season. At 1.0 the median player's
# strongest archetype carries 0.43 and they show about three archetypes,
# which is the intended display. At 0.75 the strongest carries 0.54 and
# they show about two and a half — a firmer primary label, fewer
# secondaries. Both are defensible; this one shows more of the blend, which
# a silhouette of 0.14 says is the truthful picture.
MEMBERSHIP_TEMPERATURE = 1.0


def fit_cluster_assignments(standardized_matrix, cluster_count: int):
    """Fits K-Means and returns each player's cluster plus the centroids.

    Args:
        standardized_matrix: z-scored features, one row per player.
        cluster_count: how many archetypes to fit.

    Returns:
        (labels, centroids) where labels[i] is player i's cluster id and
        centroids[cluster_id] is that cluster's centre in the same
        standardized space.
    """
    model = KMeans(
        n_clusters=cluster_count, random_state=RANDOM_SEED, n_init=KMEANS_RESTARTS
    )
    labels = model.fit_predict(np.array(standardized_matrix))
    return labels, model.cluster_centers_


def calculate_membership_weights(
    standardized_matrix, cluster_centroids, temperature: float = MEMBERSHIP_TEMPERATURE
):
    """Returns how strongly each player belongs to each cluster.

    Each weight decays exponentially with the player's distance from that
    cluster's centroid, and the weights are then normalised to sum to 1
    across clusters. Column i means "cluster i" — the same cluster
    fit_cluster_assignments produced and a human named — so a player's
    strongest membership is always the cluster they were assigned to. The
    badge and the membership bar cannot disagree.

    Args:
        standardized_matrix: z-scored features, one row per player.
        cluster_centroids: the K-Means centroids, in the same space.
        temperature: how sharply weight falls off with distance.

    Returns:
        An array of shape (players, clusters) whose rows sum to 1.

    Note:
        These are NOT probabilities and nothing should present them as a
        confidence. They say how close a player sits to each archetype's
        centre relative to the others — an ordering with a sense of
        proportion, best rendered as a bar rather than to two decimals.
    """
    feature_array = np.array(standardized_matrix)
    centroid_array = np.array(cluster_centroids)
    distances = np.linalg.norm(
        feature_array[:, np.newaxis, :] - centroid_array[np.newaxis, :, :], axis=2
    )
    # Subtracting each row's minimum before exponentiating is a no-op after
    # normalisation, and keeps exp() away from underflow for a player far
    # from every centroid.
    shifted = distances - distances.min(axis=1, keepdims=True)
    weights = np.exp(-shifted / temperature)
    return weights / weights.sum(axis=1, keepdims=True)


def select_top_memberships(membership_weights, maximum_stored: int, minimum_weight: float):
    """Picks the few archetypes worth showing for one player.

    Args:
        membership_weights: one player's weight against each cluster.
        maximum_stored: how many to keep at most.
        minimum_weight: drop anything at or below this, so that a player who
            is overwhelmingly one archetype shows one archetype rather than
            one archetype and two rounding errors.

    Returns:
        A list of (cluster_id, weight) ordered strongest first. The
        strongest is ALWAYS included even if it falls under the floor —
        every eligible player has a primary archetype, and a player whose
        best weight is 0.08 is a genuine tweener, not a player with no
        archetype at all.
    """
    ordered_cluster_ids = np.argsort(membership_weights)[::-1][:maximum_stored]
    selected = []
    for rank_index, cluster_id in enumerate(ordered_cluster_ids):
        weight = float(membership_weights[cluster_id])
        if rank_index > 0 and weight <= minimum_weight:
            continue
        selected.append((int(cluster_id), weight))
    return selected


def canonicalize_component_signs(components):
    """Forces a deterministic sign on each principal component.

    PCA determines each component only up to sign: a component and its
    negation describe the same axis, and which one comes back can change
    between fits. Left alone, the cluster map would mirror-flip on a re-fit
    and appear to have reshuffled when nothing moved — the same family of
    problem as K-Means renumbering its clusters.

    The rule is arbitrary but fixed: make the largest-magnitude loading on
    each component positive.

    Args:
        components: the PCA components array, shape (components, features).

    Returns:
        A sign multiplier per component, either 1.0 or -1.0.
    """
    signs = []
    for component in components:
        dominant_loading = component[np.argmax(np.abs(component))]
        signs.append(-1.0 if dominant_loading < 0 else 1.0)
    return np.array(signs)


def project_to_plot_coordinates(standardized_matrix):
    """Projects players onto the two axes the cluster map is drawn on.

    Computed here and stored, never in the browser: the projection has to
    agree with the stored cluster assignments, and recomputing it per
    request would be both wasteful and a second place for it to drift.

    Args:
        standardized_matrix: z-scored features, one row per player.

    Returns:
        (coordinates, explained_variance_ratios) where coordinates has
        shape (players, 2), sign-canonicalised so re-fits do not mirror.
    """
    feature_array = np.array(standardized_matrix)
    model = PCA(n_components=2, random_state=RANDOM_SEED)
    coordinates = model.fit_transform(feature_array)
    signs = canonicalize_component_signs(model.components_)
    return coordinates * signs, model.explained_variance_ratio_
