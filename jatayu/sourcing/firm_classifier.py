"""
Firm classifier.

"Read firm names, not job titles." This maps an employer (name + industry +
employee count) onto a firm type defined in the mandate config, and through it
to a fit tier (core / adjacent / weak / disqualified). The classifier is used in
two places:

  - lightweight precision audit of the raw pull (how many profiles sit at
    core/adjacent firms vs disqualified ones), and
  - as a structured input handed to the LLM scorer so it reasons about firm type
    explicitly rather than re-deriving it from the title.

Matching rules (first matching type in config order wins):
  - A name_anchor or name_keyword match is a STRONG signal and matches outright.
  - Otherwise, a type matches only if every attribute constraint it specifies
    (industry, employee_count) is satisfied. A type with no constraints at all
    never matches by attributes (it can only match by name).
"""

from __future__ import annotations

from dataclasses import dataclass

from ..config import FirmTaxonomy, FirmType, FitTier, IntRange


@dataclass
class FirmClassification:
    type_key: str
    label: str
    tier: FitTier
    matched_on: str  # "name" | "attributes" | "fallback"


_UNKNOWN = FirmClassification(
    type_key="unknown",
    label="Unclassified firm",
    tier=FitTier.weak,
    matched_on="fallback",
)


def _name_hit(name: str, ft: FirmType) -> bool:
    low = name.lower()
    for anchor in ft.name_anchors:
        if anchor.lower() in low:
            return True
    for kw in ft.name_keywords_any:
        if kw.lower() in low:
            return True
    return False


def _industry_hit(industry: str | None, ft: FirmType) -> bool:
    if not ft.industries_any:
        return True  # no constraint specified
    if not industry:
        return False
    low = industry.lower()
    return any(ind.lower() in low or low in ind.lower() for ind in ft.industries_any)


def _size_hit(count: int | None, rng: IntRange | None) -> bool:
    if rng is None:
        return True  # no constraint specified
    if count is None:
        return False
    if rng.gte is not None and count < rng.gte:
        return False
    if rng.lte is not None and count > rng.lte:
        return False
    return True


def classify_firm(
    taxonomy: FirmTaxonomy,
    *,
    company_name: str | None,
    industry: str | None = None,
    employee_count: int | None = None,
) -> FirmClassification:
    name = company_name or ""

    for key, ft in taxonomy.types.items():
        # Strong path: explicit name match.
        if name and _name_hit(name, ft):
            return FirmClassification(key, ft.label, ft.tier, "name")

    for key, ft in taxonomy.types.items():
        # Attribute path: only if the type actually constrains on attributes.
        constrains = bool(ft.industries_any) or ft.employee_count is not None
        if not constrains:
            continue
        if _industry_hit(industry, ft) and _size_hit(employee_count, ft.employee_count):
            return FirmClassification(key, ft.label, ft.tier, "attributes")

    return _UNKNOWN
