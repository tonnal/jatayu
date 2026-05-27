"""Dev pull + rich inspection: search, collect a sample, show firm-tier precision."""
from __future__ import annotations
import sys
from dotenv import load_dotenv
load_dotenv()

from jatayu.config import MandateConfig
from jatayu.coresignal.credits import CreditLedger
from jatayu.pipeline import JatayuRun

n = int(sys.argv[1]) if len(sys.argv) > 1 else 12
cfg = MandateConfig.load("configs/mandate_a.yaml")
run = JatayuRun(cfg=cfg, ledger=CreditLedger(hard_cap=300))
rep = run.validate_filter(sample_size=n)

print(rep.render())
print("\n=== sample ===")
for p in rep.sample:
    cur = next((x for x in p.experiences if x.is_current), p.experiences[0] if p.experiences else None)
    tier = cur.firm.tier.value if cur else "?"
    print(f"\n• {p.name}  [{tier}]  — {p.current_title} @ {p.current_company}  ({p.location_country}, ~{p.years_relevant_experience}y rel)")
    for e in p.experiences[:4]:
        sz = f"{e.company_size}emp" if e.company_size else "size?"
        print(f"    - {e.title} @ {e.company_name} [{e.firm.tier.value}] ({e.company_industry or 'ind?'}, {sz})")
print("\n" + run.ledger.summary())
