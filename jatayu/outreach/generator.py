"""
Outreach generator (Q2).

Pipeline per recipient:  enrich -> generate (LLM, grounded) -> validate -> draft.

Two judgments make or break this tool, and both are enforced structurally rather
than hoped for in prose:

  1. No hallucination. The model must return every factual claim about the
     recipient WITH the source fact it rests on (or mark it an explicit inference).
     A validator then flags any claim that doesn't trace to a known fact. The model
     is told the exhaustive list of known facts and that nothing else may be
     asserted as fact.

  2. Graceful degradation. The richness tier (from enrich.py) sets the strategy:
     rich -> specific, personal, email; sparse -> short, archetype-level, explicitly
     light-touch, low confidence, human-review-required. The same code path handles
     a name-only recipient and a fully-fleshed one.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from .enrich import RecipientFeatures, RichnessTier, assess
from .schema import AidentifiProfile, Recipient

SYSTEM = """You are a partner at Aidentifi, an AI-native executive search firm. You \
write first-touch business-development notes to senior decision-makers — founders, \
COOs, CIOs, heads of talent — whom Aidentifi wants as clients. These people get \
dozens of generic pitches a week and ignore all of them. Yours earns a reply because \
it is specific, restrained, and obviously written by a human who did their homework.

THE SHAPE OF A GOOD NOTE (follow it, don't label it):
1. One sharp, TRUE observation about them or their firm — drawn from their actual
   history (a recent move, a long tenure building something, a firm at an inflection).
   Earn the next sentence; do not flatter.
2. The bridge: name the specific senior hire that situation tends to create — and why
   it's hard (passive, narrow pool, judgment-heavy). Show you understand their world.
3. Aidentifi's relevance in ONE concrete line: AI-native sourcing that maps the true
   pool and reaches people who aren't looking — not a generic "we do search."
4. A low-friction ask: a short, specific question or a 20-minute conversation. No
   "circle back", no "synergies", no calendar links.

VOICE: peer-to-peer, calm, economical. 80-130 words for a rich profile; under 55 for
a sparse one. Contractions are fine. A real human, not a brochure.

HARD RULES:
- GROUNDING: You get the COMPLETE list of known facts. State as FACT only what is on
  that list. Never invent employers, titles, AUM, deals, tenures, school, or numbers.
- INFERENCE: You may hedge an inference from role/firm archetype ("a firm at this
  stage usually…"), but mark it is_inference, never assert it as fact.
- SPARSE: When facts are thin, write SHORTER and lean on the role/firm archetype.
  Do not fake familiarity. A two-line honest note beats a fabricated personal one.
  Lower your confidence and say what you couldn't verify.

EXAMPLE (good, rich): "Hi Adeline — you've spent the last two years rebuilding Keppel
Straits' institutional setup after the strategic investment, which usually means the
next hard hire is a compliance lead who can own MAS end-to-end and partner the front
office — a tiny, passive pool. That's the kind of search we're built for: we map the
actual pool by firm type, not titles, and reach people who aren't looking. Worth 20
minutes to compare notes on the Singapore market?"
EXAMPLE (bad — never do this): "I hope this email finds you well! I came across your
impressive profile and would love to explore potential synergies and how our
best-in-class solutions can add value to your esteemed organization."

Call submit_outreach exactly once."""


@dataclass
class OutreachDraft:
    recipient_id: str
    recipient_name: str | None
    tier: str
    channel: str
    subject: str
    body: str
    relevance_thesis: str
    claims: list[dict]  # [{text, grounded_in, is_inference}]
    confidence: str
    uncertainty_flags: list[str]
    review_required: bool
    ungrounded_claims: list[str] = field(default_factory=list)  # validator output


def _tool_schema() -> dict:
    return {
        "name": "submit_outreach",
        "description": "Submit the outreach draft with grounded claims.",
        "input_schema": {
            "type": "object",
            "properties": {
                "channel": {"type": "string", "enum": ["email", "linkedin_note", "linkedin_inmail"]},
                "subject": {"type": "string", "description": "Empty for linkedin_note."},
                "body": {"type": "string"},
                "relevance_thesis": {
                    "type": "string",
                    "description": "1-2 sentences: why Aidentifi is relevant to this specific person/archetype.",
                },
                "claims": {
                    "type": "array",
                    "description": "Every factual statement about the recipient in the body.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "text": {"type": "string"},
                            "grounded_in": {
                                "type": "string",
                                "description": "The known fact this rests on, verbatim-ish, or '' if none.",
                            },
                            "is_inference": {"type": "boolean"},
                        },
                        "required": ["text", "grounded_in", "is_inference"],
                    },
                },
                "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                "uncertainty_flags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "What you were unsure about or had to infer.",
                },
            },
            "required": ["channel", "subject", "body", "relevance_thesis", "claims", "confidence", "uncertainty_flags"],
        },
    }


def _user_prompt(aid: AidentifiProfile, feats: RecipientFeatures) -> str:
    r = feats.recipient
    lines = [
        "# AIDENTIFI (sender)",
        f"One-liner: {aid.one_liner.strip()}",
        f"Positioning: {aid.positioning.strip()}",
        "Value props:",
        *[f"  - {v}" for v in aid.value_props],
        f"Register to match: {aid.voice.strip()}",
        f"Sign-off: {aid.sender_role}",
        "",
        f"# RECIPIENT (richness tier: {feats.tier.value}, score {feats.richness_score})",
        "KNOWN FACTS — the ONLY things you may assert as fact:",
        *([f"  - {f}" for f in feats.known_facts] or ["  - (only an identifier; essentially no facts)"]),
        "",
        "Strongest personalisation hooks (use the top one if any):",
        *([f"  - {h}" for h in feats.hooks] or ["  - (none — rely on generic archetype)"]),
        f"Notably missing: {', '.join(feats.missing) or 'nothing major'}",
        "",
        "Find the SINGLE most resonant TRUE hook in the facts above — a recent move, a "
        "long tenure building something, a firm at an inflection — and open with it. "
        "Then name the specific senior hire that situation tends to create and why it's "
        "hard to fill. Make every sentence earn its place.",
        "",
        _STRATEGY[feats.tier],
    ]
    return "\n".join(lines)


_STRATEGY = {
    RichnessTier.rich: (
        "STRATEGY: Rich profile. Channel = email. Open with one specific, true "
        "observation from their situation (prefer a recent signal). Tie one Aidentifi "
        "value prop directly to it. 90-140 words. Confident, specific."
    ),
    RichnessTier.moderate: (
        "STRATEGY: Moderate profile. Channel = email or linkedin_inmail. Personalise "
        "on what you have; if you infer, hedge it. 70-110 words."
    ),
    RichnessTier.sparse: (
        "STRATEGY: Sparse profile. Channel = linkedin_note (short). You have almost "
        "nothing — do NOT fake familiarity. Lead from the firm/role archetype, keep it "
        "to 2-3 sentences (<60 words), make the ask tiny, set confidence low, and list "
        "what you couldn't verify in uncertainty_flags."
    ),
}


def _validate(feats: RecipientFeatures, claims: list[dict]) -> list[str]:
    """Flag any non-inference claim whose grounding isn't backed by a known fact."""
    fact_blob = " ".join(feats.known_facts).lower()
    ungrounded: list[str] = []
    for c in claims:
        if c.get("is_inference"):
            continue
        g = (c.get("grounded_in") or "").strip().lower()
        if not g:
            ungrounded.append(c.get("text", ""))
            continue
        # token-overlap check: at least one substantive token of the grounding
        # must appear in the known facts.
        toks = [t for t in g.replace(":", " ").split() if len(t) > 3]
        if toks and not any(t in fact_blob for t in toks):
            ungrounded.append(c.get("text", ""))
    return [u for u in ungrounded if u]


class OutreachGenerator:
    def __init__(self, aidentifi: AidentifiProfile, *, model: str | None = None,
                 api_key: str | None = None) -> None:
        self.aid = aidentifi
        self.model = model or os.environ.get("JATAYU_SCORING_MODEL", "claude-opus-4-7")
        self._api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self._client = None

    def _anthropic(self):
        if self._client is None:
            import anthropic

            if not self._api_key:
                raise RuntimeError("ANTHROPIC_API_KEY not set.")
            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def generate(self, recipient: Recipient) -> OutreachDraft:
        feats = assess(recipient)
        client = self._anthropic()
        resp = client.messages.create(
            model=self.model,
            max_tokens=1200,
            system=SYSTEM,
            tools=[_tool_schema()],
            tool_choice={"type": "tool", "name": "submit_outreach"},
            messages=[{"role": "user", "content": _user_prompt(self.aid, feats)}],
        )
        payload = next(
            (b.input for b in resp.content if getattr(b, "type", None) == "tool_use"),
            None,
        )
        if payload is None:
            raise RuntimeError("Model did not return submit_outreach.")
        ungrounded = _validate(feats, payload.get("claims", []))
        return OutreachDraft(
            recipient_id=recipient.id,
            recipient_name=recipient.name,
            tier=feats.tier.value,
            channel=payload["channel"],
            subject=payload.get("subject", ""),
            body=payload["body"],
            relevance_thesis=payload.get("relevance_thesis", ""),
            claims=payload.get("claims", []),
            confidence=payload.get("confidence", "low"),
            uncertainty_flags=payload.get("uncertainty_flags", []),
            review_required=feats.review_required or bool(ungrounded),
            ungrounded_claims=ungrounded,
        )
