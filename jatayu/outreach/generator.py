"""
Outreach generator (Q2).

Per recipient:  enrich -> generate (LLM, grounded) -> validate -> anti-cliché retry -> draft.

Four judgments are enforced structurally rather than hoped for in prose:

  1. No hallucination. The model returns every factual claim about the recipient
     paired with the source fact it rests on (or marks it an explicit inference).
     A validator flags any fact-claim that doesn't trace to a known fact.

  2. Graceful degradation. The richness tier (from enrich.py) sets the strategy:
     rich -> specific, personal, ~80-130 words email;
     sparse -> short, archetype-level, low confidence, human-review-required.
     Same code path handles a name-only recipient and a fully-fleshed one.

  3. Anti-formula. The same template applied to five different recipients
     produces five emails that sound identical and obviously templated. We
     keep an explicit ban-list of clichés the first prompt tends to land on
     ("AI-native", "maps the true pool", "Worth 20 minutes", "compare notes",
     "judgment-heavy", ...) and re-prompt the model to rewrite any draft that
     uses them. Up to two retries.

  4. Variation across the batch. The prompt commits the model to a single
     "shape" per draft (observation / market-take / question / direct-context)
     and we vary that shape by recipient index, so five recipients don't all
     get the same skeleton.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

from .enrich import RecipientFeatures, RichnessTier, assess
from .schema import AidentifiProfile, Recipient

# Phrases that, in this domain, mark an email as "AI-written BD template".
# If a draft contains any of these (case-insensitive substring or regex),
# we ask the model to rewrite. These are not stylistic preferences — they are
# the exact phrases that showed up in EVERY draft of the v1 prompt and that
# Aidentifi reviewers will read as a tell.
_BANNED_PATTERNS = [
    re.compile(r"\bAI[-\s]?native\b", re.I),
    re.compile(r"map(s|ped|ping)? the (actual|real|true) (pool|market|landscape)", re.I),
    re.compile(r"by firm[\s-]*type,? not titles?", re.I),
    re.compile(r"not (by )?titles?\b(?!\s*$)", re.I),
    re.compile(r"people who aren'?t looking", re.I),
    re.compile(r"reach(es)? (the )?passive(?: pool| candidates)?", re.I),
    re.compile(r"\bpassive(?:-| )pool\b", re.I),
    re.compile(r"the kind of (search|mandate)s? (we|aidentifi) (are|is) built for", re.I),
    re.compile(r"that'?s (the kind of|what|where|exactly) (search|mandate|work|aidentifi)", re.I),
    re.compile(r"worth (a (quick )?)?20[-\s]?minutes?\b", re.I),
    re.compile(r"\bquick 20\b", re.I),
    re.compile(r"\bcompare notes\b", re.I),
    re.compile(r"\bjudg(e?)ment[-\s]?heavy\b", re.I),
    re.compile(r"\bnarrow,?\s+passive\b", re.I),
    re.compile(r"\bbest[-\s]?in[-\s]?class\b", re.I),
    re.compile(r"\bsynerg(y|ies)\b", re.I),
    re.compile(r"\bcircle back\b", re.I),
    re.compile(r"\brolodex\b", re.I),
    re.compile(r"\bvalue[-\s]?add\b", re.I),
    re.compile(r"hope (this )?(email |note )?finds you well", re.I),
    re.compile(r"\bI came across your\b", re.I),
    re.compile(r"impressive (profile|background|track record)", re.I),
    re.compile(r"explore (potential )?(synerg|opportunit)", re.I),
]


def _find_banned(text: str) -> list[str]:
    hits: list[str] = []
    for pat in _BANNED_PATTERNS:
        m = pat.search(text or "")
        if m:
            hits.append(m.group(0))
    return hits


SYSTEM = """You are writing AS a senior partner at Aidentifi — a small AI-native \
executive-search boutique placing senior, judgment-led roles in Asia financial services. \
You're sending a first-touch business-development note to a senior decision-maker you \
do not know (founder, principal, COO, head of talent, etc.). The goal is to plant a seed \
that could become a client conversation in 1-12 months.

Forget what a "BD email" sounds like. Write what a real senior partner with two decades \
of search experience — who writes maybe four of these a week — would actually send.

WHAT A REAL ONE LOOKS LIKE
- A real first observation, specific to THEM, drawn from their actual facts. If the facts \
  are thin, don't fake it — write a shorter, market-level note that's honest about what \
  you do and don't know.
- The Aidentifi mention is ONE understated line at most. Often the right move is no pitch \
  at all — just a thought plus an open door. The pitch is never the spine of the note.
- The ask is light, conditional, or absent. "If/when you ever..." is fine. "No agenda \
  otherwise" is fine. "Curious whether..." is fine. A single specific question is fine. \
  Asking a stranger for time outright is not.
- Length serves the point. Rich: 70-120 words. Sparse: 30-55 words. A great 35-word note \
  beats a forced 110-word one.
- Sound like a person. Contractions. A real first name on its own line at the end. No \
  brochure phrases. No bullets-in-prose ("we map / we reach / we deliver…").

BANNED PHRASES — you will be re-prompted if you use any of these:
- "AI-native"
- any variant of "map the (real / true / actual) pool"
- "by firm type, not titles" / "not titles"
- "people who aren't looking" / "the passive pool" / "reach passive candidates"
- "the kind of search/mandate (we|Aidentifi) (is|are) built for"
- "Worth 20 minutes" / "a quick 20" / any "20 minutes" framing
- "compare notes"
- "judgment-heavy"
- "best-in-class", "synergies", "circle back", "rolodex", "value-add"
- "I hope this finds you well", "I came across your profile",
  "your impressive [profile|background|track record]", "explore potential synergies/opportunities"

HARD GROUNDING RULES
- Known facts are listed for you. State as FACT only what is on that list.
- Inferences from role/firm archetype are allowed but must be flagged is_inference. \
  Never assert an inference as fact.
- Never invent: employers, titles, AUM, deal flow, tenures, schools, locations, \
  hires, numbers, dates, or accomplishments.
- If you don't have a real specific hook, the right answer is to write LESS and be \
  honest about it — not to invent.

VARIATION — IMPORTANT
You'll be told which "shape" to write in for this recipient. Stick to that shape. The \
shapes are different on purpose so the batch doesn't sound templated:

  OBSERVATION  — open with a specific true thing about them, then a short market \
                 reflection, then a light open door. Pitch can be omitted.
  MARKET_TAKE  — open with a market/category observation that is true and useful to \
                 someone in their seat. Tie it to them in one line. No ask, or a \
                 conditional ask only.
  QUESTION     — open with a specific question grounded in their facts. Brief context \
                 on who you are. No "20 minutes" framing.
  DIRECT       — short, declarative. "I run X at Aidentifi. Reason for the note: …". \
                 Best for sparse profiles.

SIGN-OFF
End with a single first name on its own line. Optionally a short firm tag line below it. \
Nothing else. No "Partner, [Firm]". No "Best regards". No links.

EXAMPLES (varied on purpose — do not copy any of these phrasings; absorb the register)

[OBSERVATION — rich]
Willy — Aoyama-after-Dymon is a seat more SG ex-COOs end up running than they planned. \
Curious whether you find yourself pulled into operator hires for the managers you back, \
or whether you keep that arms-length on purpose. We do narrow senior search in SG \
financials; the COO-for-a-seeded-GP brief lands on our desk a couple of times a year and \
is always interesting. No agenda — just say if it ever overlaps with what you're seeing.

Shashank
Aidentifi

[MARKET_TAKE — rich]
Bhaargav — the functional-foods talent bench in SG is thinner than the LinkedIn count \
suggests; the people who could anchor R&D or supply for a brand at your stage are mostly \
inside regional incumbents and not advertising. If you ever start mapping that first \
senior science or ops hire, happy to share where they actually sit. No need to reply \
otherwise.

Shashank

[QUESTION — rich]
Haryanto — six years into Sayris on a sustainable-food-systems thesis: when you've \
needed an investor-operator at that intersection, has the search been internal-network or \
external? We run a small Asia FS search practice and the bench at that intersection is \
the kind of thing we keep a live view of.

Shashank
Aidentifi

[DIRECT — sparse]
Gerald — running a single-name SG vehicle as a private investor usually means a senior \
hire every couple of years, and "search" is the wrong word for how those should happen. \
If that's ever you, happy to share what a quieter version looks like.

Shashank

[DIRECT — sparse]
Juuso — first-time CTO-founder + early stage usually means the first senior commercial \
or ops hire lands on your desk before there's even a JD. If/when, we're a good first \
call. Otherwise ignore.

Shashank

Call submit_outreach exactly once."""


@dataclass
class OutreachDraft:
    recipient_id: str
    recipient_name: str | None
    tier: str
    channel: str
    shape: str
    subject: str
    body: str
    relevance_thesis: str
    claims: list[dict]
    confidence: str
    uncertainty_flags: list[str]
    review_required: bool
    ungrounded_claims: list[str] = field(default_factory=list)
    cliche_retries: int = 0


# Shape rotation across the batch — recipient index decides shape so 5 recipients
# never all get the same skeleton. Sparse recipients are biased toward DIRECT
# (the only shape that works honestly with almost no facts).
_SHAPES_RICH = ("OBSERVATION", "MARKET_TAKE", "QUESTION", "OBSERVATION", "MARKET_TAKE")
_SHAPES_MOD = ("MARKET_TAKE", "OBSERVATION", "QUESTION", "MARKET_TAKE", "OBSERVATION")


def _shape_for(idx: int, tier: RichnessTier) -> str:
    if tier == RichnessTier.sparse:
        return "DIRECT"
    table = _SHAPES_RICH if tier == RichnessTier.rich else _SHAPES_MOD
    return table[idx % len(table)]


_SHAPE_GUIDE = {
    "OBSERVATION": (
        "SHAPE = OBSERVATION. Open with one specific, TRUE observation drawn from "
        "their facts (a tenure, a transition, a firm archetype detail). Earn the "
        "next sentence. Then a short market reflection a peer would find useful. "
        "Then either a single light question or a no-pressure open door. The "
        "pitch is at most one understated line and may be omitted entirely. "
        "70-120 words."
    ),
    "MARKET_TAKE": (
        "SHAPE = MARKET_TAKE. Open with a market or category observation that is "
        "useful to someone in their seat (e.g. the shape of the talent bench in "
        "their sector, a structural pattern in their archetype). Tie it back to "
        "them in one line. End with a conditional offer ('if you ever start...', "
        "'no need to reply otherwise'). No direct meeting ask. 70-120 words."
    ),
    "QUESTION": (
        "SHAPE = QUESTION. Open with a specific, genuine question grounded in their "
        "facts. Then a one-line statement of who you are and why this question. "
        "No follow-up ask. 60-100 words."
    ),
    "DIRECT": (
        "SHAPE = DIRECT. Short but not terse. 60-90 words. State one honest "
        "observation about the recipient's seat or firm archetype, then ONE more "
        "line of context that's true at the archetype level (the kind of hire "
        "that comes up, why it's hard, what they'd actually want from a search "
        "firm), then a one-line conditional open door. NO manufactured "
        "personalisation. NO pitch language. NO meeting ask. The reader should "
        "feel it was worth opening even though you know almost nothing about them."
    ),
}


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
                    "description": (
                        "Every factual statement about THE RECIPIENT in the body. "
                        "Do NOT include sentences about Aidentifi (the sender) or about "
                        "your own firm — those are not graded here. List only sentences "
                        "that assert something about the recipient, their company, their "
                        "history, or their situation."
                    ),
                    "items": {
                        "type": "object",
                        "properties": {
                            "text": {"type": "string"},
                            "grounded_in": {
                                "type": "string",
                                "description": "The known recipient fact this rests on, verbatim-ish, or '' if none.",
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


def _signature_block(aid: AidentifiProfile) -> str:
    first = (aid.sender_name or "").strip().split()[0] if aid.sender_name else ""
    tag = (aid.sender_firm_tag or "").strip()
    if first and tag:
        return f"{first}\n{tag}"
    if first:
        return first
    return aid.sender_firm_tag or "Aidentifi"


def _user_prompt(aid: AidentifiProfile, feats: RecipientFeatures, shape: str) -> str:
    r = feats.recipient
    first_name = (r.name or "").split()[0] if r.name else "(no first name — open without one)"
    sig = _signature_block(aid)
    lines = [
        "# AIDENTIFI (sender — your firm; mention sparingly, never as the spine of the note)",
        f"One-liner: {aid.one_liner.strip()}",
        f"Positioning: {aid.positioning.strip()}",
        f"Voice to match: {aid.voice.strip()}",
        "",
        "# SIGNATURE — end the body with EXACTLY this block on its own lines, nothing after:",
        sig,
        "",
        f"# RECIPIENT (richness tier: {feats.tier.value}, score {feats.richness_score})",
        f"Open with: {first_name}",
        "KNOWN FACTS — the ONLY things you may assert as fact:",
        *([f"  - {f}" for f in feats.known_facts] or ["  - (only an identifier; essentially no facts)"]),
        "",
        "Strongest personalisation hooks (use the strongest TRUE one if any):",
        *([f"  - {h}" for h in feats.hooks] or ["  - (none — lean on role/firm archetype, honestly)"]),
        f"Notably missing: {', '.join(feats.missing) or 'nothing major'}",
        "",
        _SHAPE_GUIDE[shape],
        "",
        "REMINDERS",
        "- The pitch, if any, is ONE understated line. Not the spine.",
        "- No 'Worth 20 minutes', no 'compare notes', no 'AI-native'.",
        "- Sign-off is exactly the signature block above. No title line, no 'Best,'.",
        "- Subject line (if email): short, lower-stakes, NOT a sales line. Empty for linkedin_note.",
        "- 'claims' list only sentences about the RECIPIENT. Sentences about Aidentifi/the sender are NOT claims.",
    ]
    return "\n".join(lines)


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

    def _call(self, messages: list[dict]) -> dict:
        client = self._anthropic()
        resp = client.messages.create(
            model=self.model,
            max_tokens=1200,
            system=SYSTEM,
            tools=[_tool_schema()],
            tool_choice={"type": "tool", "name": "submit_outreach"},
            messages=messages,
        )
        payload = next(
            (b.input for b in resp.content if getattr(b, "type", None) == "tool_use"),
            None,
        )
        if payload is None:
            raise RuntimeError("Model did not return submit_outreach.")
        return payload

    def generate(self, recipient: Recipient, *, batch_index: int = 0) -> OutreachDraft:
        feats = assess(recipient)
        shape = _shape_for(batch_index, feats.tier)
        messages: list[dict] = [
            {"role": "user", "content": _user_prompt(self.aid, feats, shape)},
        ]

        payload = self._call(messages)
        cliche_retries = 0
        # Up to two rewrites if banned phrases slip through.
        for _ in range(2):
            hits = _find_banned(payload.get("body", "")) + _find_banned(payload.get("subject", ""))
            if not hits:
                break
            cliche_retries += 1
            messages.append({
                "role": "assistant",
                "content": [{
                    "type": "tool_use",
                    "id": f"prev_{cliche_retries}",
                    "name": "submit_outreach",
                    "input": payload,
                }],
            })
            messages.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": f"prev_{cliche_retries}",
                    "content": (
                        "REJECTED. Your draft used banned phrases: "
                        + ", ".join(sorted(set(hits)))
                        + ". Rewrite the body (and subject if present) without ANY of those phrases "
                        "or close paraphrases. Keep the shape, grounding, and signature block. "
                        "Re-call submit_outreach with the rewritten draft."
                    ),
                }],
            })
            payload = self._call(messages)

        ungrounded = _validate(feats, payload.get("claims", []))
        return OutreachDraft(
            recipient_id=recipient.id,
            recipient_name=recipient.name,
            tier=feats.tier.value,
            channel=payload["channel"],
            shape=shape,
            subject=payload.get("subject", ""),
            body=payload["body"],
            relevance_thesis=payload.get("relevance_thesis", ""),
            claims=payload.get("claims", []),
            confidence=payload.get("confidence", "low"),
            uncertainty_flags=payload.get("uncertainty_flags", []),
            review_required=feats.review_required or bool(ungrounded),
            ungrounded_claims=ungrounded,
            cliche_retries=cliche_retries,
        )
