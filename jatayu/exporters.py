"""
Deliverable exporters.

Produces the exact artifacts the brief audits:
  - raw production pull CSV   (normalised profiles, pre-ranking) <- filter audit
  - scoring intermediate CSV  (raw pull + computed scores, pre top-10 cut)
  - top-10 Excel              (exact required column set)
  - credit log Excel          (dev + production sheets)

Sub-score columns in the top-10 are named with their config labels (the brief
explicitly permits adjusting sub-score names to the mandate); the canonical
sub_score_1..4 / sub_score_other positions are preserved in column order.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .config import FitTier, MandateConfig
from .coresignal.credits import CreditLedger
from .scoring.profile import Profile
from .scoring.scorer import ScoreResult


# --- raw pull -------------------------------------------------------------- #


def _profile_row(p: Profile) -> dict:
    current = next((x for x in p.experiences if x.is_current), None)
    cur_firm = current.firm if current else (p.experiences[0].firm if p.experiences else None)
    core_adj = sum(
        1
        for x in p.experiences
        if x.firm.tier in (FitTier.core, FitTier.adjacent)
    )
    return {
        "coresignal_id": p.coresignal_id,
        "name": p.name,
        "current_title": p.current_title,
        "current_company": p.current_company,
        "current_firm_type": cur_firm.type_key if cur_firm else "",
        "current_firm_tier": cur_firm.tier.value if cur_firm else "",
        "location_country": p.location_country or "",
        "years_total_experience": p.years_total_experience,
        "years_relevant_experience": p.years_relevant_experience,
        "n_core_adjacent_firms": core_adj,
        "all_companies": " | ".join(
            f"{x.company_name}[{x.firm.tier.value}]" for x in p.experiences
        ),
        "linkedin_url": p.linkedin_url,
        "headline": p.headline or "",
    }


def export_raw_pull(profiles: list[Profile], path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame([_profile_row(p) for p in profiles])
    df.to_csv(path, index=False)
    return path


# --- scoring intermediate -------------------------------------------------- #


def export_scoring_intermediate(
    cfg: MandateConfig,
    pairs: list[tuple[Profile, ScoreResult]],
    path: str | Path,
    *,
    credits_per_candidate: int = 1,
) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for p, r in pairs:
        row = _profile_row(p)
        row.update(
            {
                "fit_score": r.fit_score,
                "ungated_fit": r.ungated_fit,
                "disqualified": r.disqualified,
                "failed_gates": ", ".join(r.failed_gates),
                "confidence": r.confidence,
                "credits_spent_on_this_candidate": credits_per_candidate,
                "rationale": r.rationale,
                "concerns_or_flags": r.concerns_or_flags,
            }
        )
        for s in cfg.scoring.sub_scores:
            row[f"score__{s.id}"] = r.sub_scores.get(s.id)
        rows.append(row)
    df = pd.DataFrame(rows).sort_values("fit_score", ascending=False)
    df.to_csv(path, index=False)
    return path


# --- top-10 Excel ---------------------------------------------------------- #

# Canonical positions -> first four sub-scores are sub_score_1..4, rest -> other.
def _subscore_layout(cfg: MandateConfig) -> tuple[list[str], list[str]]:
    ids = [s.id for s in cfg.scoring.sub_scores]
    primary = ids[:4]
    other = ids[4:]
    return primary, other


def build_top_shortlist_df(
    cfg: MandateConfig,
    pairs: list[tuple[Profile, ScoreResult]],
    *,
    top_n: int = 10,
    credits_per_candidate: int = 1,
) -> pd.DataFrame:
    ranked = sorted(pairs, key=lambda pr: pr[1].fit_score, reverse=True)
    ranked = [pr for pr in ranked if not pr[1].disqualified][:top_n]

    primary, other = _subscore_layout(cfg)
    label = {s.id: s.label for s in cfg.scoring.sub_scores}

    rows = []
    for rank, (p, r) in enumerate(ranked, start=1):
        row = {
            "rank": rank,
            "coresignal_id": p.coresignal_id,
            "linkedin_url": p.linkedin_url,
            "name": p.name,
            "current_title": p.current_title,
            "current_company": p.current_company,
            "years_relevant_experience": p.years_relevant_experience,
            "fit_score": r.fit_score,
        }
        # sub_score_1..4 with descriptive headers
        for i, sid in enumerate(primary, start=1):
            row[f"sub_score_{i} — {label[sid]}"] = r.sub_scores.get(sid)
        # sub_score_other (combine any remaining)
        if other:
            row["sub_score_other — " + "/".join(label[o] for o in other)] = "; ".join(
                f"{label[o]}={r.sub_scores.get(o)}" for o in other
            )
        else:
            row["sub_score_other"] = ""
        row["rationale"] = r.rationale
        row["confidence"] = r.confidence
        row["credits_spent_on_this_candidate"] = credits_per_candidate
        row["concerns_or_flags"] = r.concerns_or_flags
        rows.append(row)
    return pd.DataFrame(rows)


def export_top_shortlist(
    cfg: MandateConfig,
    pairs: list[tuple[Profile, ScoreResult]],
    path: str | Path,
    *,
    top_n: int = 10,
    credits_per_candidate: int = 1,
) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    df = build_top_shortlist_df(
        cfg, pairs, top_n=top_n, credits_per_candidate=credits_per_candidate
    )
    df.to_excel(path, index=False, sheet_name="Top Shortlist")
    return path


# --- credit log Excel (dev + production sheets) ---------------------------- #


def export_credit_log(ledger: CreditLedger, path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [e.as_row() for e in ledger.entries]
    df = pd.DataFrame(rows)
    with pd.ExcelWriter(path, engine="openpyxl") as xl:
        for stage in ("dev", "production"):
            sub = df[df["stage"] == stage] if not df.empty else df
            sheet = sub.drop(columns=["stage"]) if not sub.empty else pd.DataFrame()
            sheet.to_excel(xl, index=False, sheet_name=stage)
    return path
