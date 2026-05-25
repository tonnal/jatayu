"""
Service layer between the FastAPI routes and the engine.

Holds a tiny in-memory run store (per mandate) so the UI can: run a dev pull,
run a production pull, score, inspect a candidate, and apply recruiter overrides
that recompute deterministically. Demo mode uses mock data + the heuristic
scorer; live mode (keys present) uses the real Coresignal client + LLM scorer.
"""

from __future__ import annotations

import os
from collections import Counter
from pathlib import Path

from jatayu.config import FitTier, MandateConfig
from jatayu.coresignal.credits import CreditLedger
from jatayu.scoring.profile import Profile, normalize_profile
from jatayu.scoring.scorer import ScoreResult, recompute_with_overrides
from jatayu.sourcing.query_builder import build_search_query
from jatayu import exporters

from . import demo_data
from .mock_scorer import mock_score

CONFIG_DIR = Path("configs")
_CONFIGS = {"mandate_a": "mandate_a.yaml", "mandate_b": "mandate_b.yaml"}

# per-mandate run state
_STORE: dict[str, dict] = {}


def _cfg(mid: str) -> MandateConfig:
    return MandateConfig.load(CONFIG_DIR / _CONFIGS[mid])


def _state(mid: str) -> dict:
    if mid not in _STORE:
        _STORE[mid] = {"ledger": CreditLedger(hard_cap=300), "pairs": {}, "profiles": []}
    return _STORE[mid]


def live_available() -> bool:
    return bool(os.environ.get("CORESIGNAL_API_KEY") and os.environ.get("ANTHROPIC_API_KEY"))


# --- serializers ----------------------------------------------------------- #


def profile_view(p: Profile) -> dict:
    cur = next((x for x in p.experiences if x.is_current),
               p.experiences[0] if p.experiences else None)
    return {
        "coresignal_id": p.coresignal_id,
        "name": p.name,
        "current_title": p.current_title,
        "current_company": p.current_company,
        "current_firm_type": cur.firm.type_key if cur else "",
        "current_firm_tier": cur.firm.tier.value if cur else "",
        "location_country": p.location_country,
        "years_total_experience": p.years_total_experience,
        "years_relevant_experience": p.years_relevant_experience,
        "linkedin_url": p.linkedin_url,
        "headline": p.headline,
        "skills": p.skills,
        "n_core_adjacent": sum(1 for x in p.experiences
                               if x.firm.tier in (FitTier.core, FitTier.adjacent)),
        "experiences": [
            {
                "title": x.title, "company": x.company_name,
                "industry": x.company_industry, "size": x.company_size,
                "firm_type": x.firm.type_key, "firm_label": x.firm.label,
                "tier": x.firm.tier.value, "is_current": x.is_current,
                "period": f"{x.date_from or '?'}–{x.date_to or 'present'}",
                "months": x.duration_months,
            }
            for x in p.experiences
        ],
    }


def score_view(cfg: MandateConfig, r: ScoreResult) -> dict:
    label = {s.id: s.label for s in cfg.scoring.sub_scores}
    weight = {s.id: s.weight for s in cfg.scoring.sub_scores}
    return {
        "fit_score": r.fit_score,
        "ungated_fit": r.ungated_fit,
        "disqualified": r.disqualified,
        "failed_gates": r.failed_gates,
        "confidence": r.confidence,
        "rationale": r.rationale,
        "concerns_or_flags": r.concerns_or_flags,
        "overridden": r.overridden,
        "override_note": r.override_note,
        "sub_scores": [
            {"id": sid, "label": label[sid], "weight": weight[sid],
             "value": r.sub_scores.get(sid),
             "reason": r.sub_score_reasons.get(sid, "")}
            for sid in [s.id for s in cfg.scoring.sub_scores]
        ],
        "gates": [
            {"id": g.id, "hard": g.hard, "passed": g.id not in r.failed_gates,
             "description": g.description.strip()}
            for g in cfg.scoring.gates
        ],
    }


# --- read endpoints -------------------------------------------------------- #


def list_mandates() -> list[dict]:
    out = []
    for mid in _CONFIGS:
        c = _cfg(mid)
        out.append({"id": mid, "name": c.mandate.name,
                    "description": c.mandate.description.strip(),
                    "executed": mid == "mandate_a"})
    return out


def mandate_detail(mid: str) -> dict:
    c = _cfg(mid)
    s = c.sourcing
    return {
        "id": mid, "name": c.mandate.name, "description": c.mandate.description.strip(),
        "sourcing": {
            "location_countries": s.location_countries,
            "industries_any": s.company_filters.industries_any,
            "employee_count": (s.company_filters.employee_count.model_dump()
                               if s.company_filters.employee_count else None),
            "title_keywords_any": s.title_keywords_any,
            "exclusions": s.exclusions.model_dump(),
            "min_years": s.min_years_total_experience,
        },
        "firm_taxonomy": [
            {"key": k, "label": ft.label, "tier": ft.tier.value}
            for k, ft in c.firm_taxonomy.types.items()
        ],
        "gates": [{"id": g.id, "hard": g.hard, "description": g.description.strip()}
                  for g in c.scoring.gates],
        "sub_scores": [{"id": s_.id, "label": s_.label, "weight": s_.weight,
                        "guidance": s_.guidance.strip()} for s_ in c.scoring.sub_scores],
        "query": build_search_query(s, size=50),
        "live_available": live_available(),
    }


def credit_state(mid: str) -> dict:
    led = _state(mid)["ledger"]
    return {"spent": led.total_spent, "cap": led.hard_cap, "remaining": led.remaining,
            "dev": led.spent_in_stage("dev"), "production": led.spent_in_stage("production"),
            "entries": [e.as_row() for e in led.entries]}


# --- workflow actions ------------------------------------------------------ #


def _tier_distribution(profiles: list[Profile]) -> dict:
    c = Counter()
    for p in profiles:
        cur = next((x for x in p.experiences if x.is_current),
                   p.experiences[0] if p.experiences else None)
        c[cur.firm.tier.value if cur else "none"] += 1
    return dict(c)


def run_dev(mid: str, sample: int = 10) -> dict:
    cfg = _cfg(mid)
    st = _state(mid)
    raw = demo_data.profiles_for(mid)
    st["ledger"].record(endpoint="search/es_dsl", query_or_id="<filter>", credit_cost=1,
                        profiles_returned=len(raw), stage="dev",
                        stage_purpose="filter validation", useful_yes_no="yes",
                        notes="demo")
    sample_raw = raw[:sample]
    profiles = [normalize_profile(r, cfg.firm_taxonomy) for r in sample_raw]
    for p in profiles:
        st["ledger"].record(endpoint=f"collect/{p.coresignal_id}", query_or_id=p.coresignal_id,
                            credit_cost=1, profiles_returned=1, stage="dev",
                            stage_purpose="inspect sample", useful_yes_no="yes", notes="demo")
    dist = _tier_distribution(profiles)
    core_adj = dist.get("core", 0) + dist.get("adjacent", 0)
    return {
        "n_ids": len(raw),
        "sampled": len(profiles),
        "tier_distribution": dist,
        "precision_estimate": round(core_adj / len(profiles), 3) if profiles else 0,
        "sample": [profile_view(p) for p in profiles],
    }


def run_production(mid: str, limit: int = 200) -> dict:
    cfg = _cfg(mid)
    st = _state(mid)
    raw = demo_data.profiles_for(mid)[:limit]
    st["ledger"].record(endpoint="search/es_dsl", query_or_id="<filter>", credit_cost=1,
                        profiles_returned=len(raw), stage="production",
                        stage_purpose="production search", useful_yes_no="yes", notes="demo")
    profiles = [normalize_profile(r, cfg.firm_taxonomy) for r in raw]
    for p in profiles:
        st["ledger"].record(endpoint=f"collect/{p.coresignal_id}", query_or_id=p.coresignal_id,
                            credit_cost=1, profiles_returned=1, stage="production",
                            stage_purpose="production collect", useful_yes_no="yes", notes="demo")
    st["profiles"] = profiles
    exporters.export_raw_pull(profiles, Path("data/output") / f"{mid}_raw_pull.csv")
    return {"count": len(profiles), "tier_distribution": _tier_distribution(profiles),
            "profiles": [profile_view(p) for p in profiles]}


def run_score(mid: str) -> dict:
    cfg = _cfg(mid)
    st = _state(mid)
    if not st["profiles"]:
        run_production(mid)
    pairs = []
    for p in st["profiles"]:
        r = mock_score(p, cfg)
        st["pairs"][p.coresignal_id] = (p, r)
        pairs.append((p, r))
    exporters.export_scoring_intermediate(cfg, pairs, Path("data/output") / f"{mid}_scoring.csv")
    return _ranked(mid)


def _ranked(mid: str) -> dict:
    cfg = _cfg(mid)
    st = _state(mid)
    pairs = list(st["pairs"].values())
    ranked = sorted(pairs, key=lambda pr: (not pr[1].disqualified, pr[1].fit_score),
                    reverse=True)
    out = []
    rank = 0
    for p, r in ranked:
        if not r.disqualified:
            rank += 1
        out.append({"rank": rank if not r.disqualified else None,
                    "profile": profile_view(p), "score": score_view(cfg, r)})
    return {"candidates": out,
            "shortlist_size": sum(1 for _, r in pairs if not r.disqualified)}


def apply_override(mid: str, cid: str, sub_overrides: dict, gate_overrides: dict,
                   note: str = "") -> dict:
    cfg = _cfg(mid)
    st = _state(mid)
    p, r = st["pairs"][cid]
    new = recompute_with_overrides(
        cfg, r,
        sub_score_overrides={k: int(v) for k, v in (sub_overrides or {}).items()},
        gate_overrides={k: bool(v) for k, v in (gate_overrides or {}).items()},
        note=note or "recruiter override",
    )
    st["pairs"][cid] = (p, new)
    return _ranked(mid)


def reset(mid: str) -> None:
    _STORE.pop(mid, None)
