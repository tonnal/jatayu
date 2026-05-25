"""
Jatayu FastAPI app — the engine behind the web product.

Demo mode (no keys) drives the real engine over mock data so the full workflow
is clickable locally. Routes mirror the search funnel: mandate -> sourcing ->
score -> review/override -> outreach.
"""

from __future__ import annotations

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from jatayu.outreach.enrich import assess
from jatayu.outreach.schema import OutreachConfig

from . import service

load_dotenv()
app = FastAPI(title="Jatayu API", version="0.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"], allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True, "live_available": service.live_available()}


@app.get("/api/mandates")
def mandates():
    return service.list_mandates()


@app.get("/api/mandates/{mid}")
def mandate(mid: str):
    return service.mandate_detail(mid)


@app.get("/api/mandates/{mid}/credits")
def credits(mid: str):
    return service.credit_state(mid)


@app.post("/api/mandates/{mid}/dev-pull")
def dev_pull(mid: str, sample: int = 10):
    return {"result": service.run_dev(mid, sample), "credits": service.credit_state(mid)}


@app.post("/api/mandates/{mid}/production-pull")
def production_pull(mid: str, limit: int = 200):
    return {"result": service.run_production(mid, limit), "credits": service.credit_state(mid)}


@app.post("/api/mandates/{mid}/score")
def score(mid: str):
    return {"result": service.run_score(mid), "credits": service.credit_state(mid)}


@app.get("/api/mandates/{mid}/candidates")
def candidates(mid: str):
    return service._ranked(mid)


class OverrideBody(BaseModel):
    sub_overrides: dict[str, int] = {}
    gate_overrides: dict[str, bool] = {}
    note: str = ""


@app.post("/api/mandates/{mid}/candidates/{cid}/override")
def override(mid: str, cid: str, body: OverrideBody):
    return service.apply_override(mid, cid, body.sub_overrides, body.gate_overrides, body.note)


@app.post("/api/mandates/{mid}/reset")
def reset(mid: str):
    service.reset(mid)
    return {"ok": True}


# --- Q2 outreach (demo: real enrichment + templated body; live uses LLM) ---- #


def _demo_outreach(rec, feats) -> dict:
    tier = feats.tier.value
    name = rec.name or "there"
    if tier == "sparse":
        body = (f"Hi {name.split()[0] if rec.name else 'there'} — we help "
                f"principals and firms like {rec.company or 'yours'} fill hard senior "
                "investment and control hires through AI-driven search. Worth a short "
                "intro call?")
        channel, conf = "linkedin_note", "low"
        flags = ["Almost no profile data — kept generic, archetype-level.",
                 *[f"unknown: {m}" for m in feats.missing]]
    else:
        hook = feats.hooks[0] if feats.hooks else "your firm's trajectory"
        body = (f"Hi {name.split()[0]}, noticed {hook}. At moments like that the hard "
                "part is usually a senior hire that title-search won't surface — exactly "
                "what Aidentifi does, mapping the real talent pool and reaching passive "
                "candidates. Open to a 20-minute conversation next week?")
        channel = "email" if tier == "rich" else "linkedin_inmail"
        conf = "high" if tier == "rich" else "medium"
        flags = [] if tier == "rich" else ["Some personalisation inferred from limited data."]
    return {
        "recipient_id": rec.id, "recipient_name": rec.name, "tier": tier,
        "channel": channel, "subject": "" if channel == "linkedin_note" else
        f"A senior hire {rec.company or 'you'} may be circling",
        "body": body, "confidence": conf,
        "richness_score": feats.richness_score,
        "known_facts": feats.known_facts, "hooks": feats.hooks,
        "uncertainty_flags": flags, "review_required": feats.review_required,
        "demo": True,
    }


@app.get("/api/outreach")
def outreach():
    cfg = OutreachConfig.load("configs/aidentifi.yaml", "configs/recipients.yaml")
    drafts = []
    for r in cfg.recipients:
        drafts.append(_demo_outreach(r, assess(r)))
    return {"aidentifi": cfg.aidentifi.one_liner.strip(), "drafts": drafts,
            "live_available": service.live_available()}
