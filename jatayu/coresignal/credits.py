"""
Credit ledger.

Credit discipline is a graded deliverable (15/80 of Q1) AND a hard safety
constraint (300-credit trial). Every Coresignal call is routed through this
ledger so that:

  1. We can never silently overspend — a hard cap raises before a call commits.
  2. We produce the required credit-log deliverable (dev + production "sheets")
     with the exact columns the brief specifies.
  3. Each line is a decision, not a row: stage_purpose says WHY we spent, and
     useful_yes_no is our self-rated verdict on whether the spend paid off.

Cost model (Coresignal Clean Employee API, verified against docs):
  search / preview  -> 1 credit PER QUERY, regardless of IDs returned
  collect (by id)   -> 1 credit PER PROFILE
  bulk collect      -> 1 credit PER RECORD downloaded
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path


class CreditCapExceeded(RuntimeError):
    """Raised before a call that would push spend past the configured cap."""


@dataclass
class CreditEntry:
    timestamp: str
    endpoint: str
    search_query_or_profile_id: str
    credit_cost: int
    profiles_returned: int
    stage: str  # "dev" | "production" — drives the two-sheet split
    stage_purpose: str  # plain-English reason for the spend
    useful_yes_no: str  # "yes" | "no" | "" (self-rated, can be set later)
    notes: str

    # Column order the brief requires (stage is kept separately for the sheet
    # split but also emitted so a single flat CSV is self-describing).
    CSV_COLUMNS = [
        "timestamp",
        "endpoint",
        "search_query_or_profile_id",
        "credit_cost",
        "profiles_returned",
        "stage",
        "stage_purpose",
        "useful_yes_no",
        "notes",
    ]

    def as_row(self) -> dict[str, object]:
        return {
            "timestamp": self.timestamp,
            "endpoint": self.endpoint,
            "search_query_or_profile_id": self.search_query_or_profile_id,
            "credit_cost": self.credit_cost,
            "profiles_returned": self.profiles_returned,
            "stage": self.stage,
            "stage_purpose": self.stage_purpose,
            "useful_yes_no": self.useful_yes_no,
            "notes": self.notes,
        }


@dataclass
class CreditLedger:
    """Tracks spend, enforces a cap, and writes the credit-log deliverable."""

    hard_cap: int = 300
    entries: list[CreditEntry] = field(default_factory=list)

    # -- spend accounting --------------------------------------------------- #

    @property
    def total_spent(self) -> int:
        return sum(e.credit_cost for e in self.entries)

    def spent_in_stage(self, stage: str) -> int:
        return sum(e.credit_cost for e in self.entries if e.stage == stage)

    @property
    def remaining(self) -> int:
        return self.hard_cap - self.total_spent

    def check_can_spend(self, cost: int) -> None:
        if self.total_spent + cost > self.hard_cap:
            raise CreditCapExceeded(
                f"Refusing call: would spend {self.total_spent + cost} credits, "
                f"cap is {self.hard_cap} (already spent {self.total_spent}). "
                "Raise --credit-cap deliberately if you really mean to."
            )

    def record(
        self,
        *,
        endpoint: str,
        query_or_id: str,
        credit_cost: int,
        profiles_returned: int,
        stage: str,
        stage_purpose: str,
        useful_yes_no: str = "",
        notes: str = "",
    ) -> CreditEntry:
        entry = CreditEntry(
            timestamp=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            endpoint=endpoint,
            search_query_or_profile_id=query_or_id,
            credit_cost=credit_cost,
            profiles_returned=profiles_returned,
            stage=stage,
            stage_purpose=stage_purpose,
            useful_yes_no=useful_yes_no,
            notes=notes,
        )
        self.entries.append(entry)
        return entry

    # -- persistence -------------------------------------------------------- #

    def to_csv(self, path: str | Path) -> Path:
        """Flat master CSV (all stages). The two-sheet xlsx is built in exporters."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=CreditEntry.CSV_COLUMNS)
            writer.writeheader()
            for e in self.entries:
                writer.writerow(e.as_row())
        return path

    def summary(self) -> str:
        return (
            f"credits: {self.total_spent}/{self.hard_cap} spent "
            f"(dev={self.spent_in_stage('dev')}, "
            f"production={self.spent_in_stage('production')}, "
            f"remaining={self.remaining})"
        )
