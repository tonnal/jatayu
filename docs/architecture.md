# Jatayu — Architecture Document

## 1. What the system does

Given a mandate brief expressed as a YAML config, Jatayu sources a candidate
universe from Coresignal, filters it down with firm-attribute precision, scores
each profile with a gated LLM rubric, and emits a ranked top-10 shortlist plus
the supporting audit artifacts — while logging and hard-capping every credit.

```
configs/<mandate>.yaml                  ← the only thing that changes per mandate
   │  (filters · firm taxonomy · gates · weighted sub-scores)
   ▼
[1] query_builder      config → Elasticsearch DSL  (firm attributes BEFORE title)
[2] coresignal.client  search (1 cr) → collect (1 cr/profile)   ── credits.ledger
[3] scoring.profile    raw → normalized profile + per-experience firm classification
[4] scoring.scorer     LLM gates + 0-100 sub-scores → fit computed deterministically
[5] exporters          raw_pull.csv · scoring_intermediate.csv · top10.xlsx · credit_log
```

The funnel maps to the real search workflow: **sourcing → filtering → ranking →
shortlist**, with a cheap **dev/validation** loop in front of the expensive
**production** pull.

## 2. Design choices and trade-offs

### 2.1 Firm attributes before title (the core bet)
The brief's central warning: title-matching "Compliance + Singapore + Asset
Management" returns hundreds of wrong fits. So the query leads with the nested
`experience.company_industry` + `experience.company_size_employees_count` range
and treats `job_title` as the *last*, weakest clause. The exclusion set
(`must_not`) renders the talent pool's negative space — banks, Big-4 advisory,
IFA/retail, insurers — and cuts those archetypes *before* we spend a collect
credit on them.
- **Trade-off:** an aggressive size cap (≤250 employees for Mandate A) risks
  excluding a great candidate now sitting at a larger (e.g. post-acquisition)
  firm. We accept this on a tight pool because filter precision is the graded
  metric; the scorer's gates can still rescue edge cases that slip through a
  broader pass. The cap is one config line, so it's trivially tunable per the
  dev-pull evidence.

### 2.2 Gates, then weights (not a single average)
Fit has independent mandatory axes. A bank compliance VP can look senior and
score well on tenure yet be a categorical non-fit. So the scorer applies **hard
gates** first (AM-side experience, Singapore-based, minimum years); failing one
sets `fit_score = 0` and flags the candidate `disqualified` — the flaw is never
averaged away. Among survivors, **weighted sub-scores** differentiate.
- **Trade-off:** a hard gate can wrongly kill a genuine fit on bad data. We
  mitigate two ways: gates carry a `hard` flag (Mandate B's Singapore-roots gate
  is *soft* — flag, don't zero), and the `ungated_fit` is always retained so a
  reviewer sees what the candidate *would* have scored.

### 2.3 The aggregate is computed in code, not by the LLM
The LLM returns per-gate verdicts and per-sub-score values (0-100) with reasons;
`compute_fit()` does the weighted arithmetic. This buys **transparency and a
recruiter override path** (the 5-pt sub-dimension): a reviewer can change any
sub-score or flip any gate and `recompute_with_overrides()` re-derives the
fit_score deterministically, with the override recorded for audit. The LLM is a
judge of evidence, not a black-box ranker.

### 2.4 Exploiting the credit model
Coresignal Clean API charges **1 credit per search query regardless of IDs
returned**, and **1 credit per profile collected**. That asymmetry is the whole
credit strategy: filter iteration is nearly free, so we tighten the filter with
many cheap searches + tiny collected samples, and spend the production budget
only on the refined universe. Every call routes through `CreditLedger`, which
refuses any call that would breach the cap.

### 2.5 Config-driven = mandate-agnostic
Everything mandate-specific lives in the config and is validated by a Pydantic
schema (weights must sum to 1.0, gate/sub-score ids unique, etc.). `mandate_a.yaml`
and `mandate_b.yaml` run through identical code and produce correctly different
queries, gates, and weights. This is the property Q1b tests, and it's enforced,
not asserted.
- **Trade-off:** a config schema can only express what we anticipated. Genuinely
  novel mandate logic (see Q1b §6) still needs code. We treat the schema as the
  90% case, not a universal DSL.

## 3. Credit allocation strategy (planned vs actual)

**Suggested split:** 50 dev / 250 production. **Our plan deviates**, justified by
the cost model: searches are 1 credit each, so the "50 for development" is mostly
unspent if we're disciplined.

| Stage | Activity | Planned credits |
|---|---|---|
| Dev — filter iteration | ~8–12 ES DSL searches (1 cr each) as we tighten industry/size/exclusions | ~10 |
| Dev — sample inspection | 2–3 collected samples of ~10 profiles to eyeball firm-tier precision | ~25–30 |
| **Dev subtotal** | | **~35–40** |
| Production — search | 1 search for the final filter | ~1 |
| Production — collect | the refined universe (cap `collect_limit`, ≤220) | ~200–215 |
| **Reserve** | buffer for a re-pull if the filter needs one more turn | ~45 |

> **Actual spend:** _[filled after the production run from `credit_log.xlsx`]_.
> The credit log's `useful_yes_no` column self-rates each spend; the dev sheet is
> where the filter-iteration learning is visible.

If we exhaust credits, the plan is to **ask Aidentifi with reasoning** (option b)
rather than spin a second trial account silently — the brief grades how we handle
the constraint, and a transparent ask beats a quiet workaround.

## 4. Mandate Selection Rationale

**We executed Mandate A (Compliance, SG asset manager).**

- **Why A:** Its fit is determined by *observable firm attributes* — firm type,
  employee count, MAS license, AM business model — which is exactly what a
  Coresignal filter and a firm-type classifier can capture. That makes the
  dominant metric, **filter precision**, genuinely winnable: we can push the raw
  pull toward the true ~15–20-person pool instead of drowning in title-matches.
  Ranking quality is also more objective on A because the disqualifier archetypes
  (bank, Big-4, regulator, IFA) are crisp.
- **What concerned me about B:** The brief calls it "harder than it appears," and
  it is — for two compounding reasons. (1) The ideal profile is *fuzzy*: ex-SFO
  PM, senior buy-side PM, and private banker with a PM book are all defensible,
  and reasonable people weight them differently, so there's no clean ground truth
  for ranking. (2) SFO professionals keep *deliberately sparse* LinkedIn
  presence, which degrades both the filter (less to match on) and the collected
  data (less to score on). Betting the 45/80 ground-truth metrics on a pool that
  actively hides from the data source is the riskier play.
- **What the tool needs to handle both well:** (a) firm-type classification with
  per-mandate taxonomies — built; (b) *optional* firm-size filtering, since size
  is signal for A but noise for B — built (B's config omits the size range);
  (c) archetype-weighted scoring rather than a single ideal — built via
  configurable sub-score weights; (d) for B specifically, **sparse-profile-aware
  scoring** (treat sparseness as a mild positive at family-office-shaped firms and
  lower confidence rather than penalise) — partially built via the confidence
  field; a fuller version needs the enrichment discussed in Q1b §6.

## 5. What I'd change with more time

1. **Two-pass filtering with a cheap pre-rank.** Use the Coresignal *preview*
   endpoint to score-rank IDs on firmographics before collecting, so collect
   credits go to the most promising profiles first (matters most when the pool
   exceeds the collect budget).
2. **Firm registry cross-reference.** Resolve employers against the MAS Financial
   Institutions Directory / VCC registry to turn "boutique AM" inference into a
   verified license-category fact — a large filter-precision and confidence gain
   (see Q3).
3. **Calibration harness.** A small labelled set (manually-classified profiles)
   to measure filter precision and ranking correlation automatically as we tune
   configs, instead of eyeballing the dev sample.
4. **Embeddings-assisted dedupe + near-duplicate firm-name resolution** so the
   classifier isn't purely string-matching anchors.
