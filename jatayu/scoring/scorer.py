"""
LLM scorer.

The model returns per-gate verdicts and per-sub-score values; the aggregate
fit_score is computed HERE, in code, so the scoring is transparent and a recruiter
can override any input (a sub-score or a gate) and recompute deterministically.

Aggregation rule:
  ungated_fit = sum(sub_score_value * weight)        # 0..100
  if any HARD gate fails: fit_score = 0, disqualified = True  (flaw not averaged)
  else:                   fit_score = ungated_fit
Sub-scores and the ungated fit are always retained for transparency.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from ..config import MandateConfig
from .profile import Profile
from .prompts import SYSTEM, assessment_tool, build_user_prompt


@dataclass
class ScoreResult:
    coresignal_id: str
    fit_score: float  # final, post-gate (0-100)
    ungated_fit: float  # pre-gate weighted aggregate (0-100)
    disqualified: bool
    failed_gates: list[str]
    sub_scores: dict[str, int]  # id -> 0..100
    sub_score_reasons: dict[str, str] = field(default_factory=dict)
    gate_reasons: dict[str, str] = field(default_factory=dict)
    rationale: str = ""
    confidence: str = "medium"
    confidence_reason: str = ""
    concerns_or_flags: str = ""
    # Provenance for recruiter override / audit.
    overridden: bool = False
    override_note: str = ""


def compute_fit(
    cfg: MandateConfig,
    sub_scores: dict[str, int],
    gate_verdicts: dict[str, bool],
) -> tuple[float, float, bool, list[str]]:
    """Deterministic aggregation — the single source of truth for fit_score."""
    weights = {s.id: s.weight for s in cfg.scoring.sub_scores}
    ungated = sum(sub_scores.get(sid, 0) * w for sid, w in weights.items())

    failed_hard = [
        g.id
        for g in cfg.scoring.gates
        if g.hard and gate_verdicts.get(g.id, True) is False
    ]
    disqualified = bool(failed_hard)
    fit = 0.0 if disqualified else ungated
    return round(fit, 1), round(ungated, 1), disqualified, failed_hard


class Scorer:
    def __init__(self, cfg: MandateConfig, *, model: str | None = None,
                 api_key: str | None = None) -> None:
        self.cfg = cfg
        self.model = model or cfg.scoring.model or os.environ.get(
            "JATAYU_SCORING_MODEL", "claude-opus-4-7"
        )
        self._api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self._client = None  # lazy

    def _anthropic(self):
        if self._client is None:
            import anthropic

            if not self._api_key:
                raise RuntimeError("ANTHROPIC_API_KEY not set.")
            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def score(self, profile: Profile) -> ScoreResult:
        tool = assessment_tool(self.cfg)
        client = self._anthropic()
        resp = client.messages.create(
            model=self.model,
            max_tokens=1500,
            temperature=0,
            system=SYSTEM,
            tools=[tool],
            tool_choice={"type": "tool", "name": "submit_assessment"},
            messages=[{"role": "user", "content": build_user_prompt(profile, self.cfg)}],
        )
        payload = _extract_tool_input(resp)
        return self._assemble(profile.coresignal_id, payload)

    def _assemble(self, cid: str, payload: dict) -> ScoreResult:
        sub_scores = {d["id"]: int(d["score"]) for d in payload.get("sub_scores", [])}
        sub_reasons = {d["id"]: d.get("reason", "") for d in payload.get("sub_scores", [])}
        gate_verdicts = {d["id"]: bool(d["passed"]) for d in payload.get("gate_verdicts", [])}
        gate_reasons = {d["id"]: d.get("reason", "") for d in payload.get("gate_verdicts", [])}

        fit, ungated, dq, failed = compute_fit(self.cfg, sub_scores, gate_verdicts)
        return ScoreResult(
            coresignal_id=cid,
            fit_score=fit,
            ungated_fit=ungated,
            disqualified=dq,
            failed_gates=failed,
            sub_scores=sub_scores,
            sub_score_reasons=sub_reasons,
            gate_reasons=gate_reasons,
            rationale=payload.get("rationale", ""),
            confidence=payload.get("confidence", "medium"),
            confidence_reason=payload.get("confidence_reason", ""),
            concerns_or_flags=payload.get("concerns_or_flags", ""),
        )


def _extract_tool_input(resp) -> dict:
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use":
            return block.input
    raise RuntimeError("Model did not return a submit_assessment tool call.")


def recompute_with_overrides(
    cfg: MandateConfig,
    result: ScoreResult,
    *,
    sub_score_overrides: dict[str, int] | None = None,
    gate_overrides: dict[str, bool] | None = None,
    note: str = "",
) -> ScoreResult:
    """Recruiter override path: replace any inputs and recompute deterministically."""
    subs = dict(result.sub_scores)
    if sub_score_overrides:
        subs.update(sub_score_overrides)
    gates = {g.id: g.id not in result.failed_gates for g in cfg.scoring.gates}
    if gate_overrides:
        gates.update(gate_overrides)

    fit, ungated, dq, failed = compute_fit(cfg, subs, gates)
    return ScoreResult(
        coresignal_id=result.coresignal_id,
        fit_score=fit,
        ungated_fit=ungated,
        disqualified=dq,
        failed_gates=failed,
        sub_scores=subs,
        sub_score_reasons=result.sub_score_reasons,
        gate_reasons=result.gate_reasons,
        rationale=result.rationale,
        confidence=result.confidence,
        confidence_reason=result.confidence_reason,
        concerns_or_flags=result.concerns_or_flags,
        overridden=True,
        override_note=note,
    )
