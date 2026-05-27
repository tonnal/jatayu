"""
Source real senior decision-makers from Coresignal for the Q2 outreach tool.

These are the people Aidentifi would want as CLIENTS — founders, COOs, CIOs, heads
of talent at Singapore financial firms. We pull a small set, map to the Recipient
schema, and curate 5 spanning richness (incl. >=2 deliberately sparse) so the
generator is tested on the hard low-information cases too. Saves recipients_live.yaml.
"""

from __future__ import annotations

import yaml
from dotenv import load_dotenv
load_dotenv()  # scripts/ is inside the repo, so .env is found walking up

from jatayu.coresignal.credits import CreditLedger
from jatayu.coresignal.client import CoresignalClient
from jatayu.outreach.enrich import assess
from jatayu.outreach.schema import Recipient, RecipientExperience

def _industry_should():
    return {"nested": {"path": "experience", "query": {"bool": {"should": [
        {"match_phrase": {"experience.company_industry": i}} for i in
        ["Investment Management", "Capital Markets", "Venture Capital & Private Equity", "Financial Services"]
    ], "minimum_should_match": 1}}}}

# Rich, genuine hiring decision-makers (founders / COOs / CIOs at AM/fintech/PE).
DECISION_MAKER_QUERY = {
    "query": {"bool": {
        "must": [
            {"match": {"location_country": "Singapore"}},
            {"query_string": {
                "query": ('"Chief Executive Officer" OR "Chief Operating Officer" OR "Founder" '
                          'OR "Co-Founder" OR "Managing Partner" OR "Chief Investment Officer"'),
                "default_field": "job_title"}},
            _industry_should(),
        ],
        "must_not": [
            {"query_string": {"query": '"Assistant" OR "Engineering" OR "Recruiter" OR "Intern" OR "Analyst"',
                              "default_field": "job_title"}},
        ],
    }},
}

# Deliberately sparse: family-office principals keep minimal LinkedIn presence —
# the exact low-information case the brief asks us to handle.
SPARSE_QUERY = {
    "query": {"bool": {"must": [
        {"match": {"location_country": "Singapore"}},
        {"query_string": {"query": '"Family Office" OR "Private Investor" OR "Investment Office"',
                          "default_field": "job_title"}},
    ]}},
}


def to_recipient(raw: dict) -> Recipient:
    exp = raw.get("experience") or []
    cur = exp[0] if exp else {}
    return Recipient(
        id=str(raw.get("id")),
        name=raw.get("full_name"),
        title=raw.get("job_title") or cur.get("title"),
        company=cur.get("company_name"),
        company_type=cur.get("company_industry"),
        location=raw.get("location_country"),
        linkedin_url=raw.get("websites_professional_network"),
        headline=raw.get("headline") or raw.get("generated_headline"),
        about=raw.get("description"),
        experience=[RecipientExperience(
            title=e.get("title"), company=e.get("company_name"),
            dates=f"{(e.get('date_from') or '?')}–{e.get('date_to') or 'present'}")
            for e in exp[:4]],
        source="coresignal",
    )


def main():
    led = CreditLedger(hard_cap=300)
    with CoresignalClient(led, stage="dev") as cs:
        dm_ids = cs.search(DECISION_MAKER_QUERY, purpose="Q2: decision-makers")
        dm_raw = cs.collect_many(dm_ids[:10], purpose="Q2: collect decision-makers")
        sp_ids = cs.search(SPARSE_QUERY, purpose="Q2: sparse family-office")
        sp_raw = cs.collect_many(sp_ids[:6], purpose="Q2: collect sparse")

    # 3 rich: distinct companies, genuine decision-makers, most data first.
    dms = sorted((to_recipient(r) for r in dm_raw), key=lambda x: assess(x).richness_score, reverse=True)
    rich, seen_co = [], set()
    for r in dms:
        co = (r.company or "").lower()
        if r.name and co and co not in seen_co:
            seen_co.add(co); rich.append(r)
        if len(rich) == 3:
            break
    # 2 sparse: the genuinely thinnest family-office profiles.
    sparse = sorted((to_recipient(r) for r in sp_raw), key=lambda x: assess(x).richness_score)[:2]

    chosen = rich + sparse
    out = {"recipients": [r.model_dump(exclude_none=False) for r in chosen]}
    with open("configs/recipients_live.yaml", "w") as f:
        yaml.safe_dump(out, f, sort_keys=False, allow_unicode=True)
    print(f"dm pool {len(dm_ids)} / sparse pool {len(sp_ids)}; chose {len(chosen)}")
    for r in chosen:
        print(f"  [{assess(r).tier.value:8s}] {r.name} — {r.title} @ {r.company}")
    print(led.summary())


if __name__ == "__main__":
    main()
