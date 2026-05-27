"""
Prompt construction for the LLM judge.

The scorer's quality is almost entirely a function of how well the signal-map is
encoded here. Two principles drive the prompt:

  1. Score from observable PROXIES, not stated claims. Firm size implies sole-
     officer scope; client type implies AI-onboarding exposure; etc.
  2. Gates are independent and mandatory. Failing a hard gate is a 0, never an
     average. The model returns per-gate verdicts; the aggregate is computed in
     code (see scorer.py) so scoring stays transparent and overridable.
"""

from __future__ import annotations

from ..config import MandateConfig
from .profile import Profile

SYSTEM = """You are a senior executive-search researcher assessing candidate fit \
for a specific mandate. You think like a domain expert, not a keyword matcher:

- You read FIRM TYPE before job title. A "Head of Compliance" at a global bank is \
a different animal from a "Compliance Manager" at a 20-person boutique asset \
manager, even though the second title looks more junior.
- You INFER from observable proxies. Sole-officer scope is rarely stated; you \
infer it from firm headcount. Business-model exposure is rarely spelled out; you \
infer it from the employer's client type and franchise.
- You apply GATES as independent, mandatory thresholds. A candidate who fails a \
hard gate is a non-fit regardless of how strong they look elsewhere — you do not \
average a fatal flaw away.
- You are honest about uncertainty. When the profile is sparse and you are \
inferring, you say so and lower your confidence rather than inventing facts.

You must call the submit_assessment tool exactly once with your judgement."""


def build_user_prompt(profile: Profile, cfg: MandateConfig) -> str:
    lines: list[str] = []
    lines.append(f"# MANDATE: {cfg.mandate.name}\n")
    lines.append(cfg.mandate.description.strip())
    lines.append("\n# GATES (hard = disqualifying if failed)")
    for g in cfg.scoring.gates:
        lines.append(f"- [{g.id}] (hard={g.hard}) {g.description.strip()}")
    lines.append("\n# SUB-SCORES (score each 0-100; read the guidance carefully)")
    for s in cfg.scoring.sub_scores:
        lines.append(f"- [{s.id}] {s.label} (weight {s.weight}): {s.guidance.strip()}")

    lines.append("\n# CANDIDATE")
    lines.append(f"Name: {profile.name}")
    lines.append(f"Current title: {profile.current_title}")
    lines.append(f"Current company: {profile.current_company}")
    lines.append(f"Location: {profile.location_country or 'unknown'}")
    lines.append(
        f"Experience: ~{profile.years_total_experience}y total, "
        f"~{profile.years_relevant_experience}y in compliance/regulatory roles"
    )
    if profile.headline:
        lines.append(f"Headline/summary: {profile.headline}")
    # Real Coresignal lists can contain nulls/non-strings — coerce and drop blanks.
    skills = [str(s) for s in profile.skills[:25] if s]
    certs = [str(c) for c in profile.certifications[:15] if c]
    edus = [str(e) for e in profile.educations[:5] if e]
    if skills:
        lines.append(f"Skills: {', '.join(skills)}")
    if certs:
        lines.append(f"Certifications: {', '.join(certs)}")
    if edus:
        lines.append(f"Education: {'; '.join(edus)}")

    lines.append("\n## Career history (most relevant signal — read firm types):")
    for x in profile.experiences:
        size = f"{x.company_size} emp" if x.company_size is not None else "size n/a"
        period = f"{x.date_from or '?'}–{x.date_to or 'present'}"
        dur = f"{x.duration_months}mo" if x.duration_months is not None else "?"
        lines.append(
            f"- {x.title} @ {x.company_name} "
            f"[{x.firm.label} | tier={x.firm.tier.value}] "
            f"({x.company_industry or 'industry n/a'}, {size}; {period}, {dur})"
        )

    lines.append(
        "\nDATA-QUALITY NOTE: This profile may be sparse. If a dimension cannot be "
        "supported by the data above, infer cautiously from firm context and LOWER "
        "your confidence — do not fabricate specifics (named funds, AUM, VCC counts) "
        "that are not present."
    )
    return "\n".join(lines)


# Anthropic tool schema for structured, parseable output.
def assessment_tool(cfg: MandateConfig) -> dict:
    gate_ids = [g.id for g in cfg.scoring.gates]
    sub_ids = [s.id for s in cfg.scoring.sub_scores]
    return {
        "name": "submit_assessment",
        "description": "Submit the structured fit assessment for this candidate.",
        "input_schema": {
            "type": "object",
            "properties": {
                "gate_verdicts": {
                    "type": "array",
                    "description": "One verdict per gate.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string", "enum": gate_ids},
                            "passed": {"type": "boolean"},
                            "reason": {"type": "string"},
                        },
                        "required": ["id", "passed", "reason"],
                    },
                },
                "sub_scores": {
                    "type": "array",
                    "description": "One entry per sub-score, value 0-100.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string", "enum": sub_ids},
                            "score": {"type": "integer", "minimum": 0, "maximum": 100},
                            "reason": {"type": "string"},
                        },
                        "required": ["id", "score", "reason"],
                    },
                },
                "rationale": {
                    "type": "string",
                    "description": "Plain-English, 2-4 lines, as if briefing a search partner.",
                },
                "confidence": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                    "description": "low = inferring from sparse/indirect data.",
                },
                "confidence_reason": {"type": "string"},
                "concerns_or_flags": {
                    "type": "string",
                    "description": "Anything a reviewer should know that rank alone won't convey.",
                },
            },
            "required": [
                "gate_verdicts",
                "sub_scores",
                "rationale",
                "confidence",
                "concerns_or_flags",
            ],
        },
    }
