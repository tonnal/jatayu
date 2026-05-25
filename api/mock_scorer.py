"""
Heuristic mock scorer for demo mode.

Turns a normalized Profile into a ScoreResult WITHOUT an LLM, by reading firm
tiers, tenure, and keyword signals — then runs the result through the engine's
real compute_fit() so gates and weighted aggregation behave exactly as in
production. Live mode swaps this for scoring.scorer.Scorer (the LLM judge).
"""

from __future__ import annotations

from jatayu.config import FitTier, MandateConfig
from jatayu.scoring.profile import Profile
from jatayu.scoring.scorer import ScoreResult, compute_fit

_TIER_BASE = {FitTier.core: 90, FitTier.adjacent: 70, FitTier.weak: 40, FitTier.disqualified: 15}


def _kw(profile: Profile, words: list[str]) -> int:
    blob = " ".join([profile.headline or "", " ".join(profile.skills)]).lower()
    return sum(1 for w in words if w.lower() in blob)


def mock_score(profile: Profile, cfg: MandateConfig) -> ScoreResult:
    # Sole-officer scope only reads core/adjacent (boutique) firms.
    am_exps = [e for e in profile.experiences
               if e.firm.tier in (FitTier.core, FitTier.adjacent)]
    # AM-side experience for the GATE is broader: any asset-management firm,
    # including large/bank-owned AM arms (tier 'weak') — that's still AM, just
    # the wrong scale. The gate fails only for truly wrong-pool firms
    # (bank/Big-4/regulator/IFA = disqualified) or unclassifiable employers.
    am_side_exps = [e for e in profile.experiences
                    if e.firm.tier != FitTier.disqualified and e.firm.type_key != "unknown"]
    best_tier = max((e.firm.tier for e in profile.experiences),
                    key=lambda t: _TIER_BASE[t], default=FitTier.weak)

    # --- gates ---
    has_am = bool(am_side_exps)
    sg = (profile.location_country or "").lower().startswith("sing")
    enough_years = max(profile.years_relevant_experience, profile.years_total_experience) >= 8
    gate_verdicts = {
        "am_side_experience": has_am,
        "singapore_based": sg,
        "minimum_experience": enough_years,
    }

    # --- sub-scores ---
    am_fit = _TIER_BASE[best_tier]
    if profile.years_relevant_experience >= 8:
        am_fit = min(100, am_fit + 5)

    am_sizes = [e.company_size for e in am_exps if e.company_size]
    min_size = min(am_sizes) if am_sizes else None
    if min_size is None:
        ownership = 30
    elif min_size <= 30:
        ownership = 90
    elif min_size <= 80:
        ownership = 72
    elif min_size <= 250:
        ownership = 58
    else:
        ownership = 32

    biz = 45 + 18 * _kw(profile, ["vcc", "open-architecture", "accredited",
                                   "private credit", "private equity", "distribution"])
    commercial = 50 + 15 * _kw(profile, ["front office", "product", "growth",
                                          "distribution", "business"])
    # tenure stability: long current tenure good; brand-new short stints lower
    cur = next((e for e in profile.experiences if e.is_current), None)
    cur_months = cur.duration_months if cur and cur.duration_months else 0
    stability = 60 + min(30, cur_months // 12 * 6)

    subs = {
        "am_regulatory_fit": int(min(100, am_fit)),
        "ownership_scope": int(min(100, ownership)),
        "business_model_fit": int(min(100, biz)),
        "commercial_orientation": int(min(100, commercial)),
        "stability_progression": int(min(100, stability)),
    }
    # keep only ids the config actually defines
    subs = {s.id: subs.get(s.id, 50) for s in cfg.scoring.sub_scores}

    fit, ungated, dq, failed = compute_fit(cfg, subs, gate_verdicts)

    rationale, flags = _narrate(profile, am_exps, min_size, dq, failed)
    confidence = "high" if profile.years_total_experience and len(profile.experiences) >= 2 else "medium"

    return ScoreResult(
        coresignal_id=profile.coresignal_id, fit_score=fit, ungated_fit=ungated,
        disqualified=dq, failed_gates=failed, sub_scores=subs,
        gate_reasons={k: ("pass" if v else "fail") for k, v in gate_verdicts.items()},
        rationale=rationale, confidence=confidence, concerns_or_flags=flags,
    )


def _narrate(profile, am_exps, min_size, dq, failed) -> tuple[str, str]:
    if dq:
        reason = {
            "am_side_experience": "no asset-management compliance seat (wrong pool)",
            "singapore_based": "not Singapore-based",
            "minimum_experience": "below the ~8y experience threshold",
        }
        why = "; ".join(reason.get(g, g) for g in failed)
        return (f"Disqualified: {why}. Strong-looking on paper but fails a hard gate.",
                f"Fails gate(s): {', '.join(failed)}.")
    scope = ("sole/near-sole compliance scope inferred from a <30-person firm"
             if min_size and min_size <= 30 else
             "near-sole scope at a small AM" if min_size and min_size <= 80 else
             "function within a larger team")
    firms = ", ".join(e.company_name for e in am_exps[:2])
    return (f"~{profile.years_relevant_experience:.0f}y compliance at independent SG "
            f"AMs ({firms}); {scope}. Direct-fit profile for the mandate.",
            "VCC/AI-onboarding exposure inferred from firm model, not explicit." )
