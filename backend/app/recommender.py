"""Recommendation models: pure functions of behavior and the catalog.

The API (app/services/recommendations.py), the user simulator and the offline
evaluation all call this module, so the model that's evaluated is the one that ships.
See docs/recommender.md.
"""

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime

import numpy as np

# How much each kind of interaction says about interest.
WEIGHTS = {"view": 1.0, "favorite": 3.0, "request": 5.0}

# The rule's thresholds (unchanged from the original rule-based notifications).
RULE_MIN_VIEWS = 3
RULE_RECENT_VIEWS = 20
RULE_MIN_CONFIDENCE = 0.4

HYBRID_ALPHA = 0.5  # content weight in the hybrid; tuned offline (docs/case-study-recommender.md)


@dataclass(frozen=True)
class Listing:
    id: str
    type: str
    city: str
    price: int
    area: int
    bedrooms: int
    created_at: datetime


@dataclass(frozen=True)
class Interaction:
    user_id: str
    property_id: str
    kind: str  # "view" | "favorite" | "request"
    at: datetime


def city_of(address: str) -> str:
    """'12 Nile St, Maadi, Cairo' -> 'Cairo'."""
    return address.rsplit(",", 1)[-1].strip() if address else ""


class Recommender:
    """Learns from interactions, then ranks unseen listings for one person."""

    name = "base"
    min_history = 1  # interactions needed before it recommends anything

    def fit(self, interactions: list[Interaction], catalog: list[Listing]) -> "Recommender":
        self.catalog = catalog
        self.index = {listing.id: i for i, listing in enumerate(catalog)}
        return self

    def scores(self, history: list[Interaction]) -> np.ndarray:
        raise NotImplementedError

    def recommend(self, history: list[Interaction], exclude: set[str], k: int = 5) -> list[str]:
        """Top-k listing ids for a person with this history, never one in `exclude`."""
        if len(history) < self.min_history:
            return []
        scores = self.scores(history).astype(float)
        for listing_id in exclude:
            if listing_id in self.index:
                scores[self.index[listing_id]] = -np.inf
        # Ties broken by newest listing first, then id, so results are deterministic.
        order = sorted(
            range(len(self.catalog)),
            key=lambda i: (-scores[i], -self.catalog[i].created_at.timestamp(), self.catalog[i].id),
        )
        return [self.catalog[i].id for i in order if np.isfinite(scores[i])][:k]


def _weighted(history: list[Interaction]) -> dict[str, float]:
    weights: dict[str, float] = defaultdict(float)
    for interaction in history:
        weights[interaction.property_id] += WEIGHTS[interaction.kind]
    return weights


class Popularity(Recommender):
    """The listings with the most (weighted) engagement overall."""

    name = "popularity"
    min_history = 0

    def fit(self, interactions, catalog):
        super().fit(interactions, catalog)
        self.popularity = np.zeros(len(catalog))
        for interaction in interactions:
            if interaction.property_id in self.index:
                self.popularity[self.index[interaction.property_id]] += WEIGHTS[interaction.kind]
        return self

    def scores(self, history):
        return self.popularity


class RuleBased(Recommender):
    """The original rule: the person's most-viewed type among their recent views (if
    clear enough), newest listing first."""

    name = "rule_based"
    min_history = RULE_MIN_VIEWS

    def preferred_type(self, history: list[Interaction]) -> str | None:
        views = sorted((i for i in history if i.kind == "view"), key=lambda i: i.at)
        recent = [
            self.catalog[self.index[i.property_id]].type
            for i in views[-RULE_RECENT_VIEWS:]
            if i.property_id in self.index
        ]
        if len(recent) < RULE_MIN_VIEWS:
            return None
        counts = Counter(recent)
        favorite, count = min(counts.items(), key=lambda item: (-item[1], item[0]))
        return favorite if count / len(recent) >= RULE_MIN_CONFIDENCE else None

    def scores(self, history):
        preferred = self.preferred_type(history)
        scores = np.full(len(self.catalog), -np.inf)
        if preferred is None:
            return scores
        for i, listing in enumerate(self.catalog):
            if listing.type == preferred:
                scores[i] = listing.created_at.timestamp()  # newest first
        return scores


class ContentBased(Recommender):
    """Profile = weighted average of the features of listings the person engaged with;
    recommend the listings most similar to it (cosine similarity)."""

    name = "content_based"

    def fit(self, interactions, catalog):
        super().fit(interactions, catalog)
        types = sorted({listing.type for listing in catalog})
        cities = sorted({listing.city for listing in catalog})
        numeric = np.array(
            [
                [np.log(listing.price), np.log(listing.area), listing.bedrooms]
                for listing in catalog
            ],
            dtype=float,
        )
        numeric = (numeric - numeric.mean(axis=0)) / (numeric.std(axis=0) + 1e-9)
        one_hot = np.zeros((len(catalog), len(types) + len(cities)))
        for i, listing in enumerate(catalog):
            one_hot[i, types.index(listing.type)] = 1.0
            one_hot[i, len(types) + cities.index(listing.city)] = 1.0
        features = np.hstack([one_hot, 0.5 * numeric])
        norms = np.linalg.norm(features, axis=1, keepdims=True)
        self.features = features / np.where(norms == 0, 1, norms)
        return self

    def scores(self, history):
        profile = np.zeros(self.features.shape[1])
        for listing_id, weight in _weighted(history).items():
            if listing_id in self.index:
                profile += weight * self.features[self.index[listing_id]]
        norm = np.linalg.norm(profile)
        return self.features @ (profile / norm) if norm else np.zeros(len(self.catalog))


class ItemKNN(Recommender):
    """Collaborative filtering: listings are similar when the same people engage with
    both. Score = similarity to what this person engaged with, weighted by intent."""

    name = "item_knn"

    def fit(self, interactions, catalog):
        super().fit(interactions, catalog)
        users = {u: j for j, u in enumerate(sorted({i.user_id for i in interactions}))}
        matrix = np.zeros((len(catalog), max(len(users), 1)))
        for interaction in interactions:
            if interaction.property_id in self.index:
                matrix[self.index[interaction.property_id], users[interaction.user_id]] += WEIGHTS[
                    interaction.kind
                ]
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        normalized = matrix / np.where(norms == 0, 1, norms)
        self.similarity = normalized @ normalized.T
        np.fill_diagonal(self.similarity, 0.0)
        return self

    def scores(self, history):
        scores = np.zeros(len(self.catalog))
        for listing_id, weight in _weighted(history).items():
            if listing_id in self.index:
                scores += weight * self.similarity[self.index[listing_id]]
        return scores


class Hybrid(Recommender):
    """A blend of content-based and collaborative scores, each scaled to [0, 1]."""

    name = "hybrid"

    def __init__(self, alpha: float = HYBRID_ALPHA):
        self.alpha = alpha

    def fit(self, interactions, catalog):
        super().fit(interactions, catalog)
        self.content = ContentBased().fit(interactions, catalog)
        self.knn = ItemKNN().fit(interactions, catalog)
        return self

    @staticmethod
    def _scale(values: np.ndarray) -> np.ndarray:
        low, high = values.min(), values.max()
        return (values - low) / (high - low) if high > low else np.zeros_like(values)

    def scores(self, history):
        return self.alpha * self._scale(self.content.scores(history)) + (
            1 - self.alpha
        ) * self._scale(self.knn.scores(history))


MODELS: dict[str, type[Recommender]] = {
    model.name: model for model in (Popularity, RuleBased, ContentBased, ItemKNN, Hybrid)
}
