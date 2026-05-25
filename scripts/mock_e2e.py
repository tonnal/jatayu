"""
End-to-end smoke test with MOCK data — spends zero credits, needs no API keys.

Proves the full chain: raw Coresignal-shaped dicts -> normalize -> firm classify
-> (mock) score with gates -> all four deliverables on disk. Real runs swap the
mock collect/score for the live Coresignal + Anthropic calls in pipeline.py.
"""

from __future__ import annotations

from pathlib import Path

from jatayu.config import MandateConfig
from jatayu.coresignal.credits import CreditLedger
from jatayu.scoring.profile import normalize_profile
from jatayu.scoring.scorer import ScoreResult, compute_fit
from jatayu import exporters

# Three archetypes: a bullseye boutique-AM compliance head, a disqualified
# bank-compliance VP, and a Big-4 advisory decoration candidate.
MOCK_RAW = [
    {
        "id": "1001",
        "full_name": "Wei Ling Tan",
        "job_title": "Head of Compliance",
        "location_country": "Singapore",
        "description": "Sole compliance officer at an independent SG asset manager; "
        "MAS CMS licensing, AI onboarding, VCC, open-architecture fund distribution.",
        "skills": ["Regulatory Compliance", "Asset Management", "AML"],
        "websites_professional_network": "https://linkedin.com/in/weilingtan",
        "experience": [
            {"title": "Head of Compliance", "company_name": "Meridian Capital Management",
             "company_industry": "Investment Management", "company_size_employees_count": 28,
             "date_from": "2018-01", "date_to": None, "duration_months": 89},
            {"title": "Compliance Manager", "company_name": "Aurora Asset Management",
             "company_industry": "Investment Management", "company_size_employees_count": 40,
             "date_from": "2013-01", "date_to": "2017-12", "duration_months": 60},
        ],
        "education": [{"title": "LLB", "major": "Law"}],
        "certifications": [{"name": "ICA Diploma in Compliance"}],
    },
    {
        "id": "1002",
        "full_name": "Rajesh Kumar",
        "job_title": "VP, Compliance",
        "location_country": "Singapore",
        "description": "Compliance VP within a large banking group.",
        "skills": ["Compliance", "Banking"],
        "websites_professional_network": "https://linkedin.com/in/rajeshkumar",
        "experience": [
            {"title": "VP, Compliance", "company_name": "DBS Bank",
             "company_industry": "Banking", "company_size_employees_count": 33000,
             "date_from": "2012-01", "date_to": None, "duration_months": 160},
        ],
        "education": [{"title": "MBA"}],
    },
    {
        "id": "1003",
        "full_name": "Michelle Goh",
        "job_title": "Compliance Manager, FS Advisory",
        "location_country": "Singapore",
        "description": "Financial services compliance advisory.",
        "skills": ["Advisory", "Compliance"],
        "websites_professional_network": "https://linkedin.com/in/michellegoh",
        "experience": [
            {"title": "Manager, FS Advisory", "company_name": "Ernst & Young",
             "company_industry": "Accounting", "company_size_employees_count": 8000,
             "date_from": "2016-01", "date_to": None, "duration_months": 113},
        ],
        "education": [{"title": "BAcc"}],
    },
]

# Mock LLM verdicts keyed by id (what the real Scorer would return).
MOCK_VERDICTS = {
    "1001": {
        "subs": {"am_regulatory_fit": 92, "ownership_scope": 90, "business_model_fit": 85,
                 "commercial_orientation": 75, "stability_progression": 85},
        "gates": {"am_side_experience": True, "singapore_based": True, "minimum_experience": True},
        "rationale": "12y compliance at two independent SG AMs; sole-officer scope inferred "
        "from <50-person firms; direct AI/open-architecture exposure. Strong direct fit.",
        "confidence": "high", "flags": "VCC familiarity inferred from firm model, not explicit.",
    },
    "1002": {
        "subs": {"am_regulatory_fit": 25, "ownership_scope": 20, "business_model_fit": 15,
                 "commercial_orientation": 40, "stability_progression": 80},
        "gates": {"am_side_experience": False, "singapore_based": True, "minimum_experience": True},
        "rationale": "Deep bank compliance but no asset-management seat; ran a slice of a large "
        "team, not a sole function. Wrong rulebook for this mandate.",
        "confidence": "high", "flags": "Fails AM-experience gate.",
    },
    "1003": {
        "subs": {"am_regulatory_fit": 30, "ownership_scope": 25, "business_model_fit": 20,
                 "commercial_orientation": 35, "stability_progression": 70},
        "gates": {"am_side_experience": False, "singapore_based": True, "minimum_experience": False},
        "rationale": "Big-4 advisory only; advises rather than owns a license. ~9y but no "
        "operational AM ownership.",
        "confidence": "medium", "flags": "Advisory-only decoration pattern.",
    },
}


def mock_score(cid: str, cfg) -> ScoreResult:
    v = MOCK_VERDICTS[cid]
    fit, ungated, dq, failed = compute_fit(cfg, v["subs"], v["gates"])
    return ScoreResult(
        coresignal_id=cid, fit_score=fit, ungated_fit=ungated, disqualified=dq,
        failed_gates=failed, sub_scores=v["subs"], rationale=v["rationale"],
        confidence=v["confidence"], concerns_or_flags=v["flags"],
    )


def main() -> None:
    cfg = MandateConfig.load("configs/mandate_a.yaml")
    ledger = CreditLedger(hard_cap=300)
    # Simulate the credit spend a real run would log.
    ledger.record(endpoint="search", query_or_id="<filter>", credit_cost=1,
                  profiles_returned=len(MOCK_RAW), stage="dev",
                  stage_purpose="filter validation v1", useful_yes_no="yes",
                  notes="firm-attribute filter; good tier mix")
    for r in MOCK_RAW:
        ledger.record(endpoint=f"collect/{r['id']}", query_or_id=r["id"], credit_cost=1,
                      profiles_returned=1, stage="production",
                      stage_purpose="production collect", useful_yes_no="yes", notes="")

    profiles = [normalize_profile(r, cfg.firm_taxonomy) for r in MOCK_RAW]
    pairs = [(p, mock_score(p.coresignal_id, cfg)) for p in profiles]

    out = Path("data/output")
    exporters.export_raw_pull(profiles, out / "raw_production_pull.csv")
    exporters.export_scoring_intermediate(cfg, pairs, out / "scoring_intermediate.csv")
    exporters.export_top_shortlist(cfg, pairs, out / "top_shortlist.xlsx")
    ledger.to_csv(out / "credit_log.csv")
    exporters.export_credit_log(ledger, out / "credit_log.xlsx")

    print("=== profiles (normalized) ===")
    for p in profiles:
        print(f"  {p.name:16s} {p.years_total_experience}y total / "
              f"{p.years_relevant_experience}y relevant | current: {p.current_company}")
    print("\n=== ranking ===")
    for p, r in sorted(pairs, key=lambda pr: pr[1].fit_score, reverse=True):
        tag = "DISQUALIFIED" if r.disqualified else f"fit={r.fit_score}"
        print(f"  {p.name:16s} {tag:16s} (ungated={r.ungated_fit}) {r.failed_gates}")
    print("\n" + ledger.summary())
    print("deliverables written to", out.resolve())


if __name__ == "__main__":
    main()
