"""
Normalise a raw Coresignal Clean Employee record into a compact, scorer-ready
profile. We deliberately flatten only the fields that carry fit signal, attach a
firm classification to every experience entry, and compute experience durations
ourselves so the scorer (and the human reviewer) see consistent numbers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from ..config import FirmTaxonomy
from ..sourcing.firm_classifier import FirmClassification, classify_firm

# Titles we count toward "relevant" (compliance/regulatory) experience.
_RELEVANT_TITLE_TOKENS = (
    "compliance",
    "regulatory",
    "risk",
    "mlro",
    "aml",
    "legal and compliance",
)


@dataclass
class Experience:
    title: str
    company_name: str
    company_industry: str | None
    company_size: int | None
    date_from: str | None
    date_to: str | None
    duration_months: int | None
    is_current: bool
    firm: FirmClassification


@dataclass
class Profile:
    coresignal_id: str
    name: str
    current_title: str
    current_company: str
    linkedin_url: str
    location_country: str | None
    headline: str | None
    skills: list[str]
    experiences: list[Experience]
    educations: list[str]
    certifications: list[str]
    years_total_experience: float
    years_relevant_experience: float
    raw: dict = field(repr=False, default_factory=dict)


def _parse_year_month(value: str | None) -> tuple[int, int] | None:
    if not value:
        return None
    # Coresignal dates look like "2018-03" or "2018-03-01".
    parts = str(value).split("-")
    try:
        y = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 1
        return y, m
    except (ValueError, IndexError):
        return None


def _months_between(frm: str | None, to: str | None) -> int | None:
    a = _parse_year_month(frm)
    if a is None:
        return None
    b = _parse_year_month(to)
    if b is None:
        today = date.today()
        b = (today.year, today.month)
    return max(0, (b[0] - a[0]) * 12 + (b[1] - a[1]))


def _is_relevant_title(title: str) -> bool:
    low = (title or "").lower()
    return any(tok in low for tok in _RELEVANT_TITLE_TOKENS)


def normalize_profile(raw: dict, taxonomy: FirmTaxonomy) -> Profile:
    exp_raw = raw.get("experience") or raw.get("member_experience_collection") or []

    experiences: list[Experience] = []
    for e in exp_raw:
        company = e.get("company_name") or e.get("company") or ""
        industry = e.get("company_industry")
        size = e.get("company_size_employees_count")
        try:
            size = int(size) if size is not None else None
        except (ValueError, TypeError):
            size = None
        date_to = e.get("date_to") or e.get("active_experience") and None
        is_current = e.get("date_to") in (None, "", "present") or bool(
            e.get("active_experience")
        )
        dur = e.get("duration_months")
        if dur is None:
            dur = _months_between(e.get("date_from"), e.get("date_to"))
        experiences.append(
            Experience(
                title=e.get("title") or "",
                company_name=company,
                company_industry=industry,
                company_size=size,
                date_from=e.get("date_from"),
                date_to=e.get("date_to"),
                duration_months=dur,
                is_current=is_current,
                firm=classify_firm(
                    taxonomy,
                    company_name=company,
                    industry=industry,
                    employee_count=size,
                ),
            )
        )

    # Current role: prefer a flagged-current experience, else the top-level fields.
    current = next((x for x in experiences if x.is_current), None)
    current_title = (
        raw.get("job_title")
        or (current.title if current else "")
        or (experiences[0].title if experiences else "")
    )
    current_company = (
        (current.company_name if current else "")
        or (experiences[0].company_name if experiences else "")
    )

    # Experience durations (years), de-duplicated by simple summation of months.
    total_months = sum(x.duration_months or 0 for x in experiences)
    relevant_months = sum(
        (x.duration_months or 0) for x in experiences if _is_relevant_title(x.title)
    )

    return Profile(
        coresignal_id=str(raw.get("id") or raw.get("coresignal_id") or ""),
        name=raw.get("full_name") or raw.get("name") or "",
        current_title=current_title,
        current_company=current_company,
        linkedin_url=(
            raw.get("websites_professional_network")
            or raw.get("linkedin_url")
            or raw.get("url")
            or ""
        ),
        location_country=raw.get("location_country"),
        headline=raw.get("description") or raw.get("headline"),
        skills=raw.get("skills") or raw.get("member_skills") or [],
        experiences=experiences,
        educations=[
            (ed.get("title") or "") + (f" — {ed.get('major')}" if ed.get("major") else "")
            for ed in (raw.get("education") or [])
        ],
        certifications=[
            c.get("name") if isinstance(c, dict) else str(c)
            for c in (raw.get("certifications") or [])
        ],
        years_total_experience=round(total_months / 12, 1),
        years_relevant_experience=round(relevant_months / 12, 1),
        raw=raw,
    )
