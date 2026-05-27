"""2-credit live smoke probe: verify auth, query shape, field names, and schema."""
from __future__ import annotations
import json, os
from dotenv import load_dotenv
load_dotenv()

from jatayu.config import MandateConfig
from jatayu.coresignal.credits import CreditLedger
from jatayu.coresignal.client import CoresignalClient
from jatayu.sourcing.query_builder import build_search_query

cfg = MandateConfig.load("configs/mandate_a.yaml")
q = build_search_query(cfg.sourcing, size=50)
ledger = CreditLedger(hard_cap=10)

with CoresignalClient(ledger, stage="dev") as cs:
    print("→ search …")
    try:
        ids = cs.search(q, purpose="live smoke probe: search")
    except Exception as e:
        print("SEARCH FAILED:", repr(e)[:600]); raise SystemExit(1)
    print(f"  search OK — {len(ids)} ids returned (1 credit)")
    print("  first ids:", ids[:5])
    if not ids:
        print("  (no matches — filter likely too tight; we'll loosen)"); raise SystemExit(0)

    print("→ collect 1 …")
    try:
        prof = cs.collect(ids[0], purpose="live smoke probe: collect 1")
    except Exception as e:
        print("COLLECT FAILED:", repr(e)[:600]); raise SystemExit(1)
    print("  collect OK (1 credit)")
    print("  top-level keys:", sorted(prof.keys())[:40])
    exp = prof.get("experience") or prof.get("member_experience_collection") or []
    print("  experience entries:", len(exp))
    if exp:
        e0 = exp[0]
        print("  experience[0] keys:", sorted(e0.keys()))
        print("  sample exp:", {k: e0.get(k) for k in ("title","company_name","company_industry","company_size_employees_count","date_from","date_to")})
    print("  identity:", {k: prof.get(k) for k in ("id","full_name","job_title","location_country","websites_professional_network")})

print(ledger.summary())
