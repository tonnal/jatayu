"""
Pipeline orchestration: mandate brief (config) -> ranked shortlist.

Stages mirror the executive-search funnel and the credit-discipline workflow:

  validate_filter  -> cheap: 1 search + a tiny collected sample; inspect firm-tier
                      precision before committing the production budget.
  production_pull  -> 1 search + collect up to N profiles -> raw pull (filter audit)
  score            -> LLM gates + weighted sub-scores -> scoring intermediate
  shortlist        -> rank, drop disqualified, cut top-10 Excel

Each stage records its credit spend through the shared ledger.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from .config import MandateConfig
from .coresignal.client import CoresignalClient
from .coresignal.credits import CreditLedger
from .scoring.profile import Profile, normalize_profile
from .scoring.scorer import ScoreResult, Scorer
from .sourcing.query_builder import build_search_query
from . import exporters


@dataclass
class DevReport:
    query: dict
    n_ids: int
    sample: list[Profile]
    tier_distribution: dict[str, int]
    precision_estimate: float  # share of sample at core/adjacent firms

    def render(self) -> str:
        lines = [
            f"search returned {self.n_ids} ids; sampled {len(self.sample)} profiles",
            "firm-tier distribution (current company):",
        ]
        for tier, n in self.tier_distribution.items():
            lines.append(f"  {tier:13s} {n}")
        lines.append(f"core+adjacent precision (sample): {self.precision_estimate:.0%}")
        return "\n".join(lines)


@dataclass
class JatayuRun:
    cfg: MandateConfig
    ledger: CreditLedger
    api_key: str | None = None
    anthropic_key: str | None = None
    out_dir: Path = field(default_factory=lambda: Path("data/output"))

    def __post_init__(self) -> None:
        self.out_dir = Path(self.out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)

    # -- stage 1: cheap filter validation ---------------------------------- #

    def validate_filter(self, *, sample_size: int | None = None,
                         purpose: str = "filter validation") -> DevReport:
        n = sample_size or self.cfg.sourcing.dev.sample_size
        query = build_search_query(self.cfg.sourcing, size=max(n, 50))
        with CoresignalClient(self.ledger, api_key=self.api_key, stage="dev") as cs:
            ids = cs.search(query, purpose=purpose)
            sample_ids = ids[:n]
            raw = cs.collect_many(
                sample_ids, purpose=f"{purpose}: inspect sample"
            )
        profiles = [normalize_profile(r, self.cfg.firm_taxonomy) for r in raw]
        tiers = Counter()
        for p in profiles:
            cur = next((x for x in p.experiences if x.is_current),
                       p.experiences[0] if p.experiences else None)
            tiers[cur.firm.tier.value if cur else "none"] += 1
        core_adj = tiers.get("core", 0) + tiers.get("adjacent", 0)
        precision = core_adj / len(profiles) if profiles else 0.0
        return DevReport(
            query=query,
            n_ids=len(ids),
            sample=profiles,
            tier_distribution=dict(tiers),
            precision_estimate=precision,
        )

    # -- stage 2: production pull (raw pull deliverable) ------------------- #

    def production_pull(self, *, limit: int | None = None,
                        purpose: str = "production pull") -> list[Profile]:
        n = limit or self.cfg.sourcing.production.collect_limit
        query = build_search_query(self.cfg.sourcing, size=n)
        with CoresignalClient(self.ledger, api_key=self.api_key, stage="production") as cs:
            ids = cs.search(query, purpose=f"{purpose}: search")
            raw = cs.collect_many(ids[:n], purpose=f"{purpose}: collect")
        profiles = [normalize_profile(r, self.cfg.firm_taxonomy) for r in raw]
        exporters.export_raw_pull(profiles, self.out_dir / "raw_production_pull.csv")
        return profiles

    # -- stage 3: scoring (scoring intermediate deliverable) -------------- #

    def score(self, profiles: list[Profile]) -> list[tuple[Profile, ScoreResult]]:
        scorer = Scorer(self.cfg, api_key=self.anthropic_key)
        pairs = [(p, scorer.score(p)) for p in profiles]
        exporters.export_scoring_intermediate(
            self.cfg, pairs, self.out_dir / "scoring_intermediate.csv"
        )
        return pairs

    # -- stage 4: shortlist (top-10 Excel deliverable) -------------------- #

    def shortlist(self, pairs: list[tuple[Profile, ScoreResult]],
                  *, top_n: int = 10) -> Path:
        return exporters.export_top_shortlist(
            self.cfg, pairs, self.out_dir / "top_shortlist.xlsx", top_n=top_n
        )

    def write_credit_log(self) -> Path:
        self.ledger.to_csv(self.out_dir / "credit_log.csv")
        return exporters.export_credit_log(self.ledger, self.out_dir / "credit_log.xlsx")
