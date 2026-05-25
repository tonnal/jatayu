"""
Jatayu CLI — the operator surface for the engine.

The four-stage credit-disciplined workflow as commands:

  jatayu validate-filter   # cheap: 1 search + small sample; inspect precision
  jatayu pull              # production raw pull (filter audit deliverable)
  jatayu score             # LLM gates + sub-scores (scoring intermediate)
  jatayu run               # pull -> score -> shortlist, all stages, one go

All commands are config-driven (`--config configs/mandate_a.yaml`); nothing about
a mandate is hard-coded. Credit spend is printed after every command.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

from .config import MandateConfig
from .coresignal.credits import CreditLedger
from .pipeline import JatayuRun

load_dotenv()
app = typer.Typer(add_completion=False, help="Jatayu — sourcing & ranking engine.")
console = Console()


def _run(config: str, out: str, cap: int) -> JatayuRun:
    cfg = MandateConfig.load(config)
    ledger = CreditLedger(hard_cap=cap)
    return JatayuRun(
        cfg=cfg,
        ledger=ledger,
        api_key=os.environ.get("CORESIGNAL_API_KEY"),
        anthropic_key=os.environ.get("ANTHROPIC_API_KEY"),
        out_dir=Path(out),
    )


@app.command("show-query")
def show_query(config: str = "configs/mandate_a.yaml", size: int = 50) -> None:
    """Print the ES DSL query for a config without spending any credits."""
    from .sourcing.query_builder import build_search_query

    cfg = MandateConfig.load(config)
    console.print_json(json.dumps(build_search_query(cfg.sourcing, size=size)))


@app.command("validate-filter")
def validate_filter(
    config: str = "configs/mandate_a.yaml",
    sample: int = 10,
    out: str = "data/output",
    cap: int = 300,
) -> None:
    """Stage 1: 1 search + a small collected sample; report firm-tier precision."""
    run = _run(config, out, cap)
    report = run.validate_filter(sample_size=sample)
    console.print(report.render())
    run.write_credit_log()
    console.print(f"[bold]{run.ledger.summary()}[/bold]")


@app.command("pull")
def pull(
    config: str = "configs/mandate_a.yaml",
    limit: int = 200,
    out: str = "data/output",
    cap: int = 250,
) -> None:
    """Stage 2: production pull -> raw_production_pull.csv (filter audit)."""
    run = _run(config, out, cap)
    profiles = run.production_pull(limit=limit)
    console.print(f"collected {len(profiles)} profiles -> {out}/raw_production_pull.csv")
    run.write_credit_log()
    console.print(f"[bold]{run.ledger.summary()}[/bold]")


@app.command("run")
def run_all(
    config: str = "configs/mandate_a.yaml",
    limit: int = 200,
    top: int = 10,
    out: str = "data/output",
    cap: int = 300,
) -> None:
    """All stages: pull -> score -> shortlist. Writes every deliverable."""
    run = _run(config, out, cap)
    profiles = run.production_pull(limit=limit)
    console.print(f"raw pull: {len(profiles)} profiles")
    pairs = run.score(profiles)
    path = run.shortlist(pairs, top_n=top)
    run.write_credit_log()

    table = Table(title="Top shortlist")
    for col in ("rank", "name", "company", "fit"):
        table.add_column(col)
    ranked = [pr for pr in sorted(pairs, key=lambda x: x[1].fit_score, reverse=True)
              if not pr[1].disqualified][:top]
    for i, (p, r) in enumerate(ranked, 1):
        table.add_row(str(i), p.name, p.current_company, str(r.fit_score))
    console.print(table)
    console.print(f"shortlist -> {path}")
    console.print(f"[bold]{run.ledger.summary()}[/bold]")


if __name__ == "__main__":
    app()
