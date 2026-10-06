"""Experiment definitions and deterministic variant assignment.

A person's variant is a pure function of (experiment key, user id): no assignment table,
the same person always sees the same variant on every device and request, and
different experiments split people independently of each other.
"""

import hashlib
from dataclasses import dataclass

BUCKETS = 10_000


@dataclass(frozen=True)
class Experiment:
    key: str
    description: str
    # Variant name -> share of traffic. Shares must add up to 1.
    variants: dict[str, float]
    active: bool = True

    def __post_init__(self) -> None:
        if abs(sum(self.variants.values()) - 1) > 1e-9:
            raise ValueError(f"{self.key}: variant shares must add up to 1")


EXPERIMENTS: dict[str, Experiment] = {
    exp.key: exp
    for exp in [
        Experiment(
            key="phone_autoformat",
            description=(
                "Viewing form: format the phone number as it's typed and show an example, "
                "for people whose number isn't pre-filled. See docs/experimentation.md."
            ),
            variants={"control": 0.5, "treatment": 0.5},
        ),
    ]
}


def bucket(experiment_key: str, subject_id: str) -> int:
    """A stable bucket in [0, BUCKETS) for this experiment and person."""
    digest = hashlib.sha256(f"{experiment_key}:{subject_id}".encode()).digest()
    return int.from_bytes(digest[:8], "big") % BUCKETS


def assign(experiment: Experiment, subject_id: str) -> str:
    point = bucket(experiment.key, subject_id) / BUCKETS
    cumulative = 0.0
    for variant, share in experiment.variants.items():
        cumulative += share
        if point < cumulative:
            return variant
    return next(reversed(experiment.variants))  # guards against float rounding


def assignments_for(subject_id: str) -> dict[str, str]:
    return {key: assign(exp, subject_id) for key, exp in EXPERIMENTS.items() if exp.active}
