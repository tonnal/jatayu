"""
Enrichment / richness assessment.

The core architectural move for sparse-profile handling: we never hardcode "this
recipient is sparse". We derive a richness SCORE from which fields are actually
present, bucket it into a tier, and the tier drives the generation strategy
(how much to personalise, which register, whether a human must review). This is
what lets the same pipeline degrade gracefully from a rich profile to a name-only
one without special-casing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from .schema import Recipient


class RichnessTier(str, Enum):
    rich = "rich"  # enough to ground a specific, personalised angle
    moderate = "moderate"  # some signal; personalise carefully
    sparse = "sparse"  # almost no signal; lean on role/firm archetype, flag it


# Field -> signal weight. About-sections and recent activity carry the most.
_WEIGHTS = {
    "about": 3.0,
    "headline": 1.5,
    "title": 1.0,
    "company": 1.0,
    "company_type": 1.0,
    "location": 0.5,
}
_EXPERIENCE_EACH = 1.0
_SIGNAL_EACH = 1.5


@dataclass
class RecipientFeatures:
    recipient: Recipient
    richness_score: float
    tier: RichnessTier
    known_facts: list[str]
    hooks: list[str] = field(default_factory=list)  # strongest personalisation angles
    missing: list[str] = field(default_factory=list)  # notable absent fields

    @property
    def review_required(self) -> bool:
        # Sparse outputs always get a human gate; rich ones can flow.
        return self.tier != RichnessTier.rich


def assess(recipient: Recipient) -> RecipientFeatures:
    score = 0.0
    for f, w in _WEIGHTS.items():
        if getattr(recipient, f, None):
            score += w
    score += min(len(recipient.experience), 3) * _EXPERIENCE_EACH
    score += min(len(recipient.recent_signals), 2) * _SIGNAL_EACH

    if score >= 7.0:
        tier = RichnessTier.rich
    elif score >= 2.5:
        tier = RichnessTier.moderate
    else:
        tier = RichnessTier.sparse

    # Hooks, strongest first: recent activity > about > role@firm.
    hooks: list[str] = []
    hooks.extend(recipient.recent_signals)
    if recipient.about:
        hooks.append(f"stated focus: {recipient.about.strip()}")
    if recipient.title and recipient.company:
        hooks.append(f"{recipient.title} at {recipient.company}")
    elif recipient.company:
        hooks.append(f"affiliated with {recipient.company}")
    if recipient.company_type:
        hooks.append(f"firm archetype: {recipient.company_type}")

    missing = [
        f for f in ("title", "company", "headline", "about", "location")
        if not getattr(recipient, f, None)
    ]

    return RecipientFeatures(
        recipient=recipient,
        richness_score=round(score, 1),
        tier=tier,
        known_facts=recipient.known_facts(),
        hooks=hooks,
        missing=missing,
    )
