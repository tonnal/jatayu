"""
Config -> Elasticsearch DSL query builder.

The ordering here encodes the central domain insight: firm attributes
(industry + employee count, matched on the nested `experience` object) carry the
signal; the job title is the LAST and weakest filter. Exclusions render the
talent pool's negative space as `must_not`, cutting the dominant decoration
archetypes (banks, Big-4 advisory, IFA/retail, insurers) before we spend a
single collect credit on them.
"""

from __future__ import annotations

from ..config import CompanyFilter, Exclusions, SourcingConfig


def _quoted_or(keywords: list[str]) -> str:
    """`a OR b` query_string with phrases quoted so multi-word titles match."""
    return " OR ".join(f'"{k}"' for k in keywords)


def _experience_company_clause(cf: CompanyFilter) -> dict | None:
    """Nested clause pinned to the CURRENT employer: 'is currently at a firm of
    THIS industry AND THIS size'.

    The nested filter is constrained to the active experience so that a candidate
    whose CURRENT job is at a wrong-pool firm (payments, crypto, mining, bank) is
    excluded even if they once held a role at a target-industry firm. Without
    this pin, the nested match fired on any historical experience and flooded the
    pull with currently-wrong-pool profiles. Null-tolerant: profiles where
    active_experience is missing fall back to date_to being null/present.
    """
    must: list[dict] = []

    if cf.industries_any:
        must.append(
            {
                "bool": {
                    # match_phrase, NOT match: a plain `match` on company_industry
                    # token-bleeds ("Financial Services" would match "Food and
                    # Beverage Services" via the shared "Services" token). Phrase
                    # matching requires the exact industry string.
                    "should": [
                        {"match_phrase": {"experience.company_industry": ind}}
                        for ind in cf.industries_any
                    ],
                    "minimum_should_match": 1,
                }
            }
        )

    if cf.employee_count is not None:
        rng: dict[str, int] = {}
        if cf.employee_count.gte is not None:
            rng["gte"] = cf.employee_count.gte
        if cf.employee_count.lte is not None:
            rng["lte"] = cf.employee_count.lte
        if rng:
            # Recall-safe: keep firms whose size is in range OR is UNKNOWN.
            # company_size is null for many Coresignal profiles, so a bare range
            # would silently drop real candidates. This only excludes firms with a
            # KNOWN size outside the band; scoring still reads scale where present.
            must.append(
                {
                    "bool": {
                        "should": [
                            {"range": {"experience.company_size_employees_count": rng}},
                            {"bool": {"must_not": {"exists": {"field": "experience.company_size_employees_count"}}}},
                        ],
                        "minimum_should_match": 1,
                    }
                }
            )

    if cf.company_keywords_any:
        must.append(
            {
                "query_string": {
                    "query": _quoted_or(cf.company_keywords_any),
                    "default_field": "experience.company_name",
                }
            }
        )

    if not must:
        return None

    # Pin the nested match to the CURRENT employer so a past-only stint at a
    # target-industry firm doesn't qualify a candidate whose current job is at
    # a wrong-pool firm. Null-tolerant: also accept records where date_to is
    # missing (data-quality fallback for profiles lacking active_experience).
    must.insert(
        0,
        {
            "bool": {
                "should": [
                    {"term": {"experience.active_experience": True}},
                    {"bool": {"must_not": {"exists": {"field": "experience.date_to"}}}},
                ],
                "minimum_should_match": 1,
            }
        },
    )

    return {
        "nested": {
            "path": "experience",
            "query": {"bool": {"must": must}},
        }
    }


def _exclusion_clauses(ex: Exclusions) -> list[dict]:
    clauses: list[dict] = []

    if ex.title_keywords_none:
        clauses.append(
            {
                "query_string": {
                    "query": _quoted_or(ex.title_keywords_none),
                    "default_field": "job_title",
                }
            }
        )

    # Company-name / industry exclusions apply to ANY experience entry: if the
    # person has *ever* been at a bank/IFA/insurer we treat that as a wrong-pool
    # signal at filter time (the scorer can still rescue genuine edge cases).
    nested_should: list[dict] = []
    if ex.company_keywords_none:
        nested_should.append(
            {
                "query_string": {
                    "query": _quoted_or(ex.company_keywords_none),
                    "default_field": "experience.company_name",
                }
            }
        )
    for ind in ex.industries_none:
        nested_should.append({"match": {"experience.company_industry": ind}})

    if nested_should:
        clauses.append(
            {
                "nested": {
                    "path": "experience",
                    "query": {
                        "bool": {"should": nested_should, "minimum_should_match": 1}
                    },
                }
            }
        )

    return clauses


def build_search_query(sourcing: SourcingConfig, *, size: int = 100) -> dict:
    """Assemble the full ES DSL body. `size` caps IDs returned by one search."""
    must: list[dict] = []
    must_not: list[dict] = _exclusion_clauses(sourcing.exclusions)

    # 1) Location — current country (top-level field = current employer country).
    if sourcing.location_countries:
        must.append(
            {
                "bool": {
                    "should": [
                        {"match": {"location_country": c}}
                        for c in sourcing.location_countries
                    ],
                    "minimum_should_match": 1,
                }
            }
        )

    # 2) FIRM ATTRIBUTES FIRST — the precision lever.
    company_clause = _experience_company_clause(sourcing.company_filters)
    if company_clause:
        must.append(company_clause)

    # 3) TITLE — broad net; precision came from step 2 (firm attributes).
    if sourcing.title_keywords_any:
        must.append(
            {
                "query_string": {
                    "query": _quoted_or(sourcing.title_keywords_any),
                    "default_field": "job_title",
                }
            }
        )

    # 4) Skills — a BOOST, not a gate. Skills are self-reported and often absent
    #    on strong senior profiles, so requiring them would hurt recall. Placed in
    #    `should` (no minimum_should_match bump) so they rank, never filter.
    should: list[dict] = [
        {"match": {"skills": s}} for s in sourcing.skills_any
    ]

    bool_query: dict = {"must": must}
    if should:
        bool_query["should"] = should
    if must_not:
        bool_query["must_not"] = must_not

    # NOTE: Coresignal's es_dsl endpoint rejects a top-level `size` in the body
    # ("extra_forbidden"). One search returns a default page of IDs; we slice to
    # the desired count after the call (see pipeline). `size` is kept in the
    # signature for callers but intentionally not emitted into the request body.
    _ = size
    return {"query": {"bool": bool_query}}
