"""
LLM search-strategy generator.

This is the heart of the "LLM proposes, human disposes" workflow: given a raw
mandate brief, an LLM produces a complete, structured sourcing strategy — the
signal map, the market-map tiers, the actual Coresignal FILTERS (industries, firm
size, titles, exclusions), and the scoring gates + weights. The output is the
editable working config; the human adds/subtracts; the engine then COMPILES it
into a real Coresignal query (with the hard-won mechanics — match_phrase, null-
tolerant size — living in the query builder, not here).

The prompt encodes the domain expertise AND the empirical lessons from live dev
pulls, so the model proposes good filters from the first pass:
  - firm attributes before titles
  - specific AM industries, NOT the "Financial Services" catch-all (token-noise)
  - a firm-size band as the boutique/sole-officer proxy
  - gates as independent thresholds; weighted sub-scores summing to 1
"""

from __future__ import annotations

import os

from .config import MandateConfig

SYSTEM = """You are a senior executive-search research lead who also thinks like a \
data engineer. Given a mandate brief, you design the SOURCING STRATEGY a junior \
researcher will execute against the Coresignal professional-data API. \
EVERYTHING you produce is derived from the SPECIFIC brief in front of you — \
industries, firm types, gates, sub-scores must reflect THIS mandate's actual \
domain (asset management, Big-4 advisory, single family office, fintech, biotech, \
whatever it is). Do not assume any default domain.

READ THE BRIEF CAREFULLY for positive vs negative descriptors. Briefs often say \
"what good looks like" AND "what weak looks like / what to avoid." Only the \
POSITIVE descriptors define the target domain. The NEGATIVE descriptors are \
exclusions or negative heuristics — never lift them into the target industries, \
title keywords, or gate domains.

You think like a domain expert, not a keyword matcher:
- SIGNAL LIVES IN FIRM ATTRIBUTES, NOT TITLES. Title-matching floods the pull with \
wrong fits. Lead the filter with firm industry and firm size; treat the job title \
as the last, weakest clause.
- BE SPECIFIC ABOUT INDUSTRY. Coresignal industry strings are exact. Choose the \
precise industry names that match THIS brief's domain (e.g. "Banking" for a bank \
mandate; "Accounting" or "Business Consulting and Services" for a Big-4 advisory \
mandate; "Investment Management" / "Capital Markets" for an asset-manager mandate; \
"Biotechnology Research" for a biotech mandate). Avoid broad catch-alls like \
"Financial Services" — they admit the wrong pool.
- USE FIRM SIZE AS A PROXY WHEN RELEVANT. A small employee-count band is how you \
infer boutique scale / sole-ownership scope when the brief implies it. Skip the \
size band if the brief doesn't care about firm scale.
- INFER FROM OBSERVABLE PROXIES. Map what the client really wants to know to the \
observable signal that stands in for it (the "signal map"), specific to this brief.
- GATES ARE INDEPENDENT THRESHOLDS. A candidate who fails a hard gate is a non-fit \
regardless of other strengths — don't average a fatal flaw away. Sub-score weights \
must sum to 1.0.
- NEVER EMIT AMBIGUOUS TITLE ABBREVIATIONS. Acronyms like "CCO", "CRO", "COO", \
"CSO", "CTO", "VP", "MD" have multiple common expansions across functions \
(e.g. "CCO" = Chief Compliance Officer OR Chief Commercial Officer; "CRO" = \
Chief Risk Officer OR Chief Revenue Officer). An abbreviation as a title keyword \
floods the pull with the wrong meaning. RULE: always emit the FULL PHRASE \
("Chief Compliance Officer"), never the bare acronym. When the target full \
phrase has a likely wrong-meaning expansion in adjacent functions, ALSO add \
that wrong expansion to exclude_title_keywords (e.g. for a compliance mandate, \
exclude "Chief Commercial Officer"). The same applies to other ambiguous \
short forms — when in doubt, exclude the wrong meaning.
- BE SPARING WITH HARD GATES, AND DERIVE THEM FROM THIS BRIEF'S MUST-HAVES. A hard \
gate is allowed ONLY for the few conditions that are (a) categorically \
disqualifying for THIS mandate AND (b) reliably observable on a profile. \
Typically: geography, the presence of the CORE DOMAIN EXPERIENCE the brief \
demands (e.g. "buy-side asset-management experience" for an AM mandate, "Big-4 \
audit/advisory experience" for a Big-4 mandate, "in-house biotech R&D" for a \
biotech mandate — the gate's domain keyword MUST come from THIS brief, never a \
template), and the seniority/experience band. Usually 2-3 hard gates. \
NEVER hard-gate any attribute that is rarely stated explicitly on a profile — \
specific product exposure, regulatory fluency, named-system familiarity, \
commercial posture, etc. Those are inferences, so they belong as weighted \
SUB-SCORES. Hard-gating them collapses the shortlist to near-zero.

Produce a complete, internally consistent strategy. Call submit_strategy once."""


def strategy_tool() -> dict:
    sub = {"type": "object", "properties": {
        "id": {"type": "string"}, "label": {"type": "string"},
        "weight": {"type": "number"}, "guidance": {"type": "string"}},
        "required": ["id", "label", "weight", "guidance"]}
    gate = {"type": "object", "properties": {
        "id": {"type": "string"}, "description": {"type": "string"},
        "hard": {"type": "boolean"}}, "required": ["id", "description", "hard"]}
    ce = {"type": "object", "properties": {
        "want": {"type": "string"}, "proxy": {"type": "string"},
        "signal": {"type": "string", "enum": ["high", "medium", "low", "negative"]}},
        "required": ["want", "proxy", "signal"]}
    return {
        "name": "submit_strategy",
        "description": "Submit the full sourcing strategy for this mandate.",
        "input_schema": {
            "type": "object",
            "properties": {
                "role_title": {"type": "string", "description": "Short mandate name."},
                "spec": {"type": "object", "properties": {
                    "must_haves": {"type": "array", "items": {"type": "string"}},
                    "nice_to_haves": {"type": "array", "items": {"type": "string"}}},
                    "required": ["must_haves", "nice_to_haves"]},
                "criteria_evidence": {"type": "array", "items": ce,
                    "description": "Signal map: want-to-know -> observable proxy."},
                "market_map": {"type": "object", "properties": {
                    "pool_estimate": {"type": "string"},
                    "core": {"type": "array", "items": {"type": "string"}},
                    "adjacent": {"type": "array", "items": {"type": "string"}},
                    "stretch": {"type": "array", "items": {"type": "string"}},
                    "excluded": {"type": "array", "items": {"type": "string"}}},
                    "required": ["pool_estimate", "core", "adjacent", "stretch", "excluded"]},
                "sourcing": {"type": "object", "properties": {
                    "location_countries": {"type": "array", "items": {"type": "string"}},
                    "min_years_total_experience": {"type": "integer"},
                    "industries_any": {"type": "array", "items": {"type": "string"},
                        "description": "Exact Coresignal industry strings; be specific, avoid 'Financial Services' catch-all."},
                    "employee_count_gte": {"type": "integer"},
                    "employee_count_lte": {"type": "integer"},
                    "title_keywords_any": {"type": "array", "items": {"type": "string"}},
                    "skills_any": {"type": "array", "items": {"type": "string"}},
                    "exclude_title_keywords": {"type": "array", "items": {"type": "string"}},
                    "exclude_company_keywords": {"type": "array", "items": {"type": "string"}}},
                    "required": ["location_countries", "industries_any", "title_keywords_any"]},
                "off_limits": {"type": "array", "items": {"type": "string"}},
                "negative_heuristics": {"type": "array", "items": {"type": "object", "properties": {
                    "id": {"type": "string"}, "label": {"type": "string"}},
                    "required": ["id", "label"]},
                    "description": "Decoration archetypes that look right but aren't."},
                "gates": {"type": "array", "items": gate,
                    "description": "Hard disqualifiers (threshold requirements)."},
                "sub_scores": {"type": "array", "items": sub,
                    "description": "Weighted differentiators; weights sum to 1.0."},
            },
            "required": ["role_title", "spec", "criteria_evidence", "market_map",
                         "sourcing", "gates", "sub_scores"],
        },
    }


def _user_prompt(brief: str) -> str:
    return (
        "Design the sourcing strategy for this mandate brief.\n\n"
        f"=== MANDATE BRIEF ===\n{brief.strip()}\n=== END ===\n\n"
        "Return: a position spec (must/nice), a signal map, a market map (firm types "
        "by tier + a pool-size estimate), the Coresignal filters (location, specific "
        "industries, an employee-count band for firm scale, title keywords applied last, "
        "skills, and exclusions), off-limits rules, decoration archetypes to screen, and "
        "scoring gates + weighted sub-scores (weights summing to 1.0). Be concrete and "
        "specific to THIS mandate's geography, regulator, and firm type."
    )


# Standard wrong-pool firm name keywords used to seed disqualifier classification
# when the model's market map doesn't name them explicitly.
_DEFAULT_DISQUALIFIERS = {
    "bank": ["Bank"], "big4_advisory": ["Ernst & Young", "KPMG", "Deloitte",
             "PwC", "PricewaterhouseCoopers"], "regulator": ["Monetary Authority"],
}


def _normalize_strategy(payload: dict) -> dict:
    """Coerce the LLM payload into the shape MandateConfig.model_validate expects."""
    s = payload["sourcing"]
    ec = {}
    if s.get("employee_count_gte") is not None:
        ec["gte"] = s["employee_count_gte"]
    if s.get("employee_count_lte") is not None:
        ec["lte"] = s["employee_count_lte"]

    sourcing = {
        "location_countries": s.get("location_countries", []),
        "min_years_total_experience": s.get("min_years_total_experience"),
        "company_filters": {
            "industries_any": s.get("industries_any", []),
            "employee_count": ec or None,
        },
        "title_keywords_any": s.get("title_keywords_any", []),
        "skills_any": s.get("skills_any", []),
        "exclusions": {
            "title_keywords_none": s.get("exclude_title_keywords", []),
            "company_keywords_none": s.get("exclude_company_keywords", []),
            "industries_none": [],
        },
    }
    mm = payload["market_map"]
    market_map = {"pool_estimate": mm.get("pool_estimate", ""),
                  "target_companies": {k: mm.get(k, []) for k in ("core", "adjacent", "stretch", "excluded")}}

    # normalize sub-score weights to sum to 1.0
    subs = payload["sub_scores"]
    total = sum(x.get("weight", 0) for x in subs) or 1.0
    for x in subs:
        x["weight"] = round(x.get("weight", 0) / total, 3)
    drift = round(1.0 - sum(x["weight"] for x in subs), 3)
    if subs:
        subs[0]["weight"] = round(subs[0]["weight"] + drift, 3)

    return {
        "mandate": {"id": "generated", "name": payload.get("role_title", "Generated mandate"),
                    "description": payload.get("_brief", "")},
        "sourcing": sourcing,
        "firm_taxonomy": _derive_taxonomy(sourcing, market_map),
        # Per-candidate scoring runs on Sonnet for speed across the whole pull;
        # the strategic GENERATION above uses Opus. (Cost is rounding error per the brief.)
        "scoring": {"model": "claude-sonnet-4-6",
                    "shortlist_threshold": 35,
                    "gates": payload["gates"], "sub_scores": subs},
        "spec": payload["spec"],
        "criteria_evidence": payload["criteria_evidence"],
        "market_map": market_map,
        "off_limits": payload.get("off_limits", []),
        "negative_heuristics": [{**h, "enabled": True} for h in payload.get("negative_heuristics", [])],
    }


def _derive_taxonomy(sourcing: dict, market_map: dict) -> dict:
    """Build a firm taxonomy from the market map + filters so classification works."""
    inds = sourcing["company_filters"]["industries_any"]
    lte = (sourcing["company_filters"].get("employee_count") or {}).get("lte", 250)
    tc = market_map["target_companies"]
    types: dict[str, dict] = {}
    # disqualifiers first (most specific) — from the model's excluded list + defaults
    for key, kws in _DEFAULT_DISQUALIFIERS.items():
        types[key] = {"label": key, "tier": "disqualified", "name_keywords_any": kws}
    if tc.get("excluded"):
        types["excluded_named"] = {"label": "Named excluded firms", "tier": "disqualified",
                                   "name_anchors": tc["excluded"]}
    types["core_named"] = {"label": "Core target firms", "tier": "core",
                           "name_anchors": tc.get("core", [])}
    types["core_attr"] = {"label": "Core by industry+scale", "tier": "core",
                          "industries_any": inds, "employee_count": {"lte": lte}}
    types["adjacent_named"] = {"label": "Adjacent firms", "tier": "adjacent",
                               "name_anchors": tc.get("adjacent", [])}
    types["large_attr"] = {"label": "Larger firm in target industry", "tier": "adjacent",
                           "industries_any": inds, "employee_count": {"gte": lte + 1}}
    if tc.get("stretch"):
        types["stretch_named"] = {"label": "Stretch firms", "tier": "weak",
                                  "name_anchors": tc["stretch"]}
    return {"types": types}


def generate_strategy(brief: str, *, api_key: str | None = None,
                      model: str | None = None) -> MandateConfig:
    """Call the LLM, validate, and return a ready-to-use MandateConfig."""
    import anthropic

    key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set — needed to generate the strategy.")
    client = anthropic.Anthropic(api_key=key)
    resp = client.messages.create(
        model=model or os.environ.get("JATAYU_SCORING_MODEL", "claude-opus-4-7"),
        max_tokens=8000, system=SYSTEM, tools=[strategy_tool()],
        tool_choice={"type": "tool", "name": "submit_strategy"},
        messages=[{"role": "user", "content": _user_prompt(brief)}],
    )
    payload = next((b.input for b in resp.content if getattr(b, "type", None) == "tool_use"), None)
    if payload is None:
        raise RuntimeError("Model did not return submit_strategy.")
    # Some models nest the whole object under a single "strategy" key — unwrap it.
    if "sourcing" not in payload and isinstance(payload.get("strategy"), dict):
        payload = payload["strategy"]
    payload["_brief"] = brief.strip()
    return MandateConfig.model_validate(_normalize_strategy(payload))
