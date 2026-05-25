"""
Mandate configuration schema.

Everything that varies between mandates lives in a YAML config validated by these
models. The engine code never hard-codes a mandate. Swapping mandate_a.yaml for
mandate_b.yaml changes the entire behaviour of sourcing, filtering, and scoring
with zero code changes — that property is the architecture, not a side effect.

Three blocks:
  sourcing      -> how we build the Coresignal ES DSL query (filter precision)
  firm_taxonomy -> how we classify an employer into a firm type + fit tier
  scoring       -> gates (hard disqualifiers) + weighted sub-scores (ranking)
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path

import yaml
from pydantic import BaseModel, Field, model_validator


# --------------------------------------------------------------------------- #
# Sourcing — the filter. Firm attributes are first-class; title is deliberately
# last, because title-matching is what floods the pull with wrong fits.
# --------------------------------------------------------------------------- #


class IntRange(BaseModel):
    """An inclusive range, mapped to an Elasticsearch `range` query."""

    gte: int | None = None
    lte: int | None = None


class CompanyFilter(BaseModel):
    """Filters applied against the nested `experience.*` company attributes.

    These are the precision lever. `industries_any` + `employee_count` together
    say "this person held a role at a financial firm of boutique scale" — a far
    stronger signal than any job title.
    """

    industries_any: list[str] = Field(default_factory=list)
    employee_count: IntRange | None = None
    company_keywords_any: list[str] = Field(default_factory=list)


class Exclusions(BaseModel):
    """The negative space of the talent pool — rendered as ES DSL `must_not`."""

    title_keywords_none: list[str] = Field(default_factory=list)
    company_keywords_none: list[str] = Field(default_factory=list)
    industries_none: list[str] = Field(default_factory=list)


class DevConfig(BaseModel):
    sample_size: int = 10  # profiles to collect during filter validation
    max_credits: int = 50


class ProductionConfig(BaseModel):
    collect_limit: int = 200  # ceiling on profiles collected in the prod pull
    max_credits: int = 250


class SourcingConfig(BaseModel):
    location_countries: list[str] = Field(default_factory=list)
    min_years_total_experience: int | None = None
    company_filters: CompanyFilter = Field(default_factory=CompanyFilter)
    title_keywords_any: list[str] = Field(default_factory=list)
    skills_any: list[str] = Field(default_factory=list)
    exclusions: Exclusions = Field(default_factory=Exclusions)
    dev: DevConfig = Field(default_factory=DevConfig)
    production: ProductionConfig = Field(default_factory=ProductionConfig)


# --------------------------------------------------------------------------- #
# Firm taxonomy — classify each employer, because "what firm" beats "what title".
# --------------------------------------------------------------------------- #


class FitTier(str, Enum):
    core = "core"  # the bullseye of the talent pool
    adjacent = "adjacent"  # plausible, needs screening
    weak = "weak"  # superficially similar, usually wrong
    disqualified = "disqualified"  # hard wrong-fit; trips a gate


class FirmType(BaseModel):
    label: str
    tier: FitTier
    # Classification signals (any-match). Name anchors are well-known firms used
    # ONLY to calibrate the classifier — we never source candidates from them.
    industries_any: list[str] = Field(default_factory=list)
    employee_count: IntRange | None = None
    name_anchors: list[str] = Field(default_factory=list)
    name_keywords_any: list[str] = Field(default_factory=list)


class FirmTaxonomy(BaseModel):
    # Order matters: classification tries each type top-to-bottom and takes the
    # first match, so put the most specific / most disqualifying types first.
    types: dict[str, FirmType]

    @model_validator(mode="after")
    def _non_empty(self) -> "FirmTaxonomy":
        if not self.types:
            raise ValueError("firm_taxonomy.types must not be empty")
        return self


# --------------------------------------------------------------------------- #
# Scoring — gates then weighted sub-scores. Gates encode the "what weak looks
# like" instinct: failing one means 0 fit regardless of the rest.
# --------------------------------------------------------------------------- #


class Gate(BaseModel):
    id: str
    description: str  # plain-English condition handed to the LLM judge
    # If the candidate fails this gate, do we hard-zero them or just flag?
    hard: bool = True


class SubScore(BaseModel):
    id: str
    label: str  # human label used in the Excel header
    weight: float  # 0..1; weights across sub-scores should sum to 1
    guidance: str  # signal-map instruction for the LLM (what proxy to read)


class ScoringConfig(BaseModel):
    model: str = "claude-opus-4-7"
    gates: list[Gate] = Field(default_factory=list)
    sub_scores: list[SubScore]
    # Below this fit_score (0-100) a candidate won't make the ranked shortlist.
    shortlist_threshold: float = 0.0

    @model_validator(mode="after")
    def _weights_sane(self) -> "ScoringConfig":
        if not self.sub_scores:
            raise ValueError("scoring.sub_scores must not be empty")
        total = sum(s.weight for s in self.sub_scores)
        if abs(total - 1.0) > 0.01:
            raise ValueError(
                f"sub_score weights must sum to 1.0, got {total:.3f}. "
                "Adjust weights in the config."
            )
        ids = [s.id for s in self.sub_scores]
        if len(ids) != len(set(ids)):
            raise ValueError("sub_score ids must be unique")
        return self


# --------------------------------------------------------------------------- #
# Top-level mandate
# --------------------------------------------------------------------------- #


class MandateMeta(BaseModel):
    id: str
    name: str
    description: str


# --------------------------------------------------------------------------- #
# Optional domain content for the operator workflow (Brief / Market Map /
# Targeting). All optional so existing configs still validate; the engine does
# not depend on these — they drive the human-facing, editable workflow stages.
# --------------------------------------------------------------------------- #


class Spec(BaseModel):
    """Structured position spec: the must-haves vs nice-to-haves a searcher signs off."""

    must_haves: list[str] = Field(default_factory=list)
    nice_to_haves: list[str] = Field(default_factory=list)


class CriteriaEvidence(BaseModel):
    """The 'signal map' — what you want to know vs the observable proxy for it."""

    want: str
    proxy: str
    signal: str = "medium"  # high | medium | low | negative


class MarketMap(BaseModel):
    """Target-company landscape, tagged by tier. Anchors are study-only."""

    pool_estimate: str = ""
    target_companies: dict[str, list[str]] = Field(default_factory=dict)  # tier -> firms


class NegativeHeuristic(BaseModel):
    """A 'what weak looks like' decoration archetype, toggleable by the operator."""

    id: str
    label: str
    enabled: bool = True


class MandateConfig(BaseModel):
    mandate: MandateMeta
    sourcing: SourcingConfig
    firm_taxonomy: FirmTaxonomy
    scoring: ScoringConfig
    # optional workflow content
    spec: Spec = Field(default_factory=Spec)
    criteria_evidence: list[CriteriaEvidence] = Field(default_factory=list)
    market_map: MarketMap = Field(default_factory=MarketMap)
    off_limits: list[str] = Field(default_factory=list)
    negative_heuristics: list[NegativeHeuristic] = Field(default_factory=list)

    @classmethod
    def load(cls, path: str | Path) -> "MandateConfig":
        path = Path(path)
        with path.open("r", encoding="utf-8") as fh:
            raw = yaml.safe_load(fh)
        return cls.model_validate(raw)

    # Convenience accessors used across the engine -------------------------- #

    def core_and_adjacent_firm_types(self) -> list[str]:
        return [
            key
            for key, ft in self.firm_taxonomy.types.items()
            if ft.tier in (FitTier.core, FitTier.adjacent)
        ]

    def disqualifying_firm_types(self) -> list[str]:
        return [
            key
            for key, ft in self.firm_taxonomy.types.items()
            if ft.tier == FitTier.disqualified
        ]
