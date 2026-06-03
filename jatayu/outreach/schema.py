"""
Data model for the outreach generator (Q2).

Recipients are DATA, not code — they load from a YAML config. Sparse recipients
simply omit fields; the enricher derives a richness tier from what's present
(see enrich.py), so the system never needs to be told "this one is sparse".
"""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class RecipientExperience(BaseModel):
    title: str | None = None
    company: str | None = None
    dates: str | None = None
    note: str | None = None


class Recipient(BaseModel):
    id: str
    name: str | None = None
    # Everything below is optional; absence is the sparse signal.
    title: str | None = None
    company: str | None = None
    company_type: str | None = None  # e.g. "boutique asset manager", "single family office"
    location: str | None = None
    linkedin_url: str | None = None
    headline: str | None = None
    about: str | None = None
    experience: list[RecipientExperience] = Field(default_factory=list)
    recent_signals: list[str] = Field(default_factory=list)  # news, posts, funding, hires
    source: str | None = None  # provenance of the data: coresignal / linkedin / public
    notes: str | None = None

    def known_facts(self) -> list[str]:
        """Flat list of grounded facts the generator is allowed to reference.

        Anything NOT in here is off-limits for the model to assert as fact.
        """
        facts: list[str] = []
        if self.name:
            facts.append(f"name: {self.name}")
        if self.title:
            facts.append(f"title: {self.title}")
        if self.company:
            facts.append(f"company: {self.company}")
        if self.company_type:
            facts.append(f"company_type: {self.company_type}")
        if self.location:
            facts.append(f"location: {self.location}")
        if self.headline:
            facts.append(f"headline: {self.headline}")
        if self.about:
            facts.append(f"about: {self.about}")
        for e in self.experience:
            bits = [b for b in (e.title, e.company, e.dates, e.note) if b]
            if bits:
                facts.append("experience: " + " | ".join(bits))
        for s in self.recent_signals:
            facts.append(f"signal: {s}")
        return facts


class AidentifiProfile(BaseModel):
    """Working assumption about Aidentifi's positioning (per the brief)."""

    name: str = "Aidentifi"
    one_liner: str
    positioning: str
    value_props: list[str]
    proof_points: list[str] = Field(default_factory=list)
    target_clients: str = ""
    sender_name: str = ""
    sender_role: str = ""             # legacy; sender_firm_tag is preferred
    sender_firm_tag: str = ""         # short tag rendered below the first name (often the firm)
    voice: str = ""                   # how a senior partner writes (register/tone)


class OutreachConfig(BaseModel):
    aidentifi: AidentifiProfile
    recipients: list[Recipient]

    @classmethod
    def load(cls, aidentifi_path: str | Path, recipients_path: str | Path) -> "OutreachConfig":
        with open(aidentifi_path, encoding="utf-8") as fh:
            aid = yaml.safe_load(fh)
        with open(recipients_path, encoding="utf-8") as fh:
            recs = yaml.safe_load(fh)
        return cls(
            aidentifi=AidentifiProfile.model_validate(aid),
            recipients=[Recipient.model_validate(r) for r in recs["recipients"]],
        )
