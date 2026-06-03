"""
Outreach runner: generate one piece per recipient, write readable + auditable output.

Writes, per run:
  data/output/outreach/<id>.md     human-readable draft + provenance footer
  data/output/outreach/index.json  structured drafts (channel, claims, flags, review)
"""

from __future__ import annotations

import json
from pathlib import Path

from .generator import OutreachDraft, OutreachGenerator
from .schema import OutreachConfig


def _draft_to_md(d: OutreachDraft) -> str:
    retry_tag = f"  ·  *cliche-retries:* **{d.cliche_retries}**" if d.cliche_retries else ""
    lines = [
        f"# Outreach — {d.recipient_name or d.recipient_id}  ({d.recipient_id})",
        f"*tier:* **{d.tier}**  ·  *shape:* **{d.shape}**  ·  *channel:* **{d.channel}**  ·  "
        f"*confidence:* **{d.confidence}**  ·  *review required:* **{d.review_required}**"
        + retry_tag,
        "",
    ]
    if d.subject:
        lines += [f"**Subject:** {d.subject}", ""]
    lines += [d.body, "", "---", f"**Relevance thesis:** {d.relevance_thesis}", ""]
    if d.uncertainty_flags:
        lines.append("**Uncertainty flags:**")
        lines += [f"- {u}" for u in d.uncertainty_flags]
        lines.append("")
    if d.ungrounded_claims:
        lines.append("**Ungrounded claims caught by validator (must fix before send):**")
        lines += [f"- {c}" for c in d.ungrounded_claims]
        lines.append("")
    lines.append("**Claim provenance:**")
    for c in d.claims:
        kind = "inference" if c.get("is_inference") else "fact"
        src = c.get("grounded_in") or "—"
        lines.append(f"- [{kind}] \"{c.get('text','')}\"  ←  {src}")
    return "\n".join(lines)


def run_all(
    aidentifi_path: str = "configs/aidentifi.yaml",
    recipients_path: str = "configs/recipients.yaml",
    out_dir: str = "data/output/outreach",
    api_key: str | None = None,
) -> list[OutreachDraft]:
    cfg = OutreachConfig.load(aidentifi_path, recipients_path)
    gen = OutreachGenerator(cfg.aidentifi, api_key=api_key)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    drafts: list[OutreachDraft] = []
    for i, r in enumerate(cfg.recipients):
        d = gen.generate(r, batch_index=i)
        drafts.append(d)
        (out / f"{r.id}.md").write_text(_draft_to_md(d), encoding="utf-8")

    (out / "index.json").write_text(
        json.dumps([d.__dict__ for d in drafts], indent=2), encoding="utf-8"
    )
    return drafts
