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
    """Nested clause: 'held a role at a firm of THIS industry AND THIS size'."""
    must: list[dict] = []

    if cf.industries_any:
        must.append(
            {
                "bool": {
                    "should": [
                        {"match": {"experience.company_industry": ind}}
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
            must.append({"range": {"experience.company_size_employees_count": rng}})

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

    # 3) Skills (optional corroboration).
    if sourcing.skills_any:
        must.append(
            {
                "bool": {
                    "should": [
                        {"match": {"skills": s}} for s in sourcing.skills_any
                    ],
                    "minimum_should_match": 1,
                }
            }
        )

    # 4) TITLE LAST — broad net; precision came from steps 2-3.
    if sourcing.title_keywords_any:
        must.append(
            {
                "query_string": {
                    "query": _quoted_or(sourcing.title_keywords_any),
                    "default_field": "job_title",
                }
            }
        )

    bool_query: dict = {"must": must}
    if must_not:
        bool_query["must_not"] = must_not

    return {"size": size, "query": {"bool": bool_query}}
