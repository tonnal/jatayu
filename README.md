# Jatayu — Sourcing & Ranking Engine

Given a mandate brief, Jatayu returns a tightly-fit, ranked shortlist of
candidates with minimal human effort. Built for the Aidentifi FDE assessment
(Q1), but designed as a **mandate-agnostic** engine: everything that varies
between searches lives in a YAML config, not in code.

## The one idea

> Title-matching floods the pull with wrong fits. **Signal lives in firm
> attributes** — firm scale, license type, business model — not in the job
> title.

So the filter leads with firm attributes (industry + employee-count range,
matched on the nested `experience` object in the Coresignal query) and treats
title as the *last* keyword. The scorer then reads **firm type before title** and
infers unstated facts from observable proxies (e.g. sole-officer scope from firm
headcount). Hard **gates** disqualify wrong-pool archetypes outright instead of
averaging a fatal flaw away.

## Architecture

```
configs/mandate_a.yaml         the mandate — filters, firm taxonomy, gates, weights
        │
        ▼
jatayu/sourcing/query_builder  config -> Elasticsearch DSL (firm attrs first)
jatayu/coresignal/client       Clean Employee API: search (1 cr) / collect (1 cr/profile)
jatayu/coresignal/credits      every call logged + hard-capped (credit discipline)
        │
        ▼
jatayu/scoring/profile         normalize raw -> compact profile + firm classification
jatayu/scoring/scorer          LLM gates + weighted sub-scores; fit computed IN CODE
        │
        ▼
jatayu/exporters               raw pull CSV · scoring intermediate CSV · top-10 xlsx · credit log
```

Aggregation is deterministic and **transparent**: the LLM returns per-gate
verdicts and 0-100 sub-scores; `compute_fit()` produces the final `fit_score`.
A recruiter can override any sub-score or gate and recompute
(`recompute_with_overrides`) — the scoring transparency / override path.

## Credit model (why dev is cheap)

Coresignal Clean Employee API: **search = 1 credit per query** regardless of IDs
returned; **collect = 1 credit per profile**. So filter iteration is nearly free
— we tighten the filter with cheap searches, inspect a tiny collected sample, and
spend the ~250-credit production budget only on the refined universe.

## Usage

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add CORESIGNAL_API_KEY + ANTHROPIC_API_KEY

# inspect the query without spending anything
python -m jatayu.cli show-query --config configs/mandate_a.yaml

# stage 1 — cheap filter validation (1 search + small sample)
python -m jatayu.cli validate-filter --sample 10

# stage 2-4 — full run: pull -> score -> shortlist (writes all deliverables)
python -m jatayu.cli run --config configs/mandate_a.yaml --limit 200 --top 10
```

Outputs land in `data/output/`: `raw_production_pull.csv`,
`scoring_intermediate.csv`, `top_shortlist.xlsx`, `credit_log.{csv,xlsx}`.

Offline sanity check (zero credits, no keys): `python scripts/mock_e2e.py`.

## Web product (FastAPI + Next.js)

A thin SaaS layer over the engine. **Demo mode** (no keys) drives the *real*
engine over mock data, so the full workflow is clickable locally:

```bash
chmod +x scripts/dev.sh && ./scripts/dev.sh
# backend  → http://localhost:8000   (FastAPI)
# frontend → http://localhost:3000   (Next.js)
```

Walk the funnel: pick a mandate → **Sourcing console** (filter + generated ES DSL
+ live credit meter) → **Run dev pull** (firm-tier precision) → **production pull**
→ **gated scoring** → **ranked review** with a candidate drawer where you can
**override** any sub-score or gate and recompute the fit deterministically. The
**Outreach** tab shows the Q2 drafts with richness tiers and uncertainty flags.

When `.env` has keys, the same screens flip to LIVE (real Coresignal + LLM).

## Switching mandates

No code changes — point at a different config:

```bash
python -m jatayu.cli run --config configs/mandate_b.yaml
```

See `docs/` for the architecture document, the Q1b config-migration doc, and the
Mandate Selection Rationale.
