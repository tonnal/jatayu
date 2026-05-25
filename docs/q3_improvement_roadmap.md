# Q3 — Improvement Roadmap

Budget: **USD 5,000 per tool (USD 10,000 total)**. Time: **5 weeks total**,
allocated **3 weeks Jatayu / 2 weeks Outreach** — Jatayu carries 55% of the grade
and its weakest point (filter precision) is the highest-leverage fix.

Baselines below are honest estimates from the build; they become measured numbers
once the calibration harness (Jatayu improvement #2) exists.

---

## Tool 1 — Jatayu (USD 5,000 · 3 weeks / 15 working days)

### #1 — MAS / VCC registry cross-reference enrichment  *(highest ROI)*
Resolve each candidate's employers against the **MAS Financial Institutions
Directory** (public, free, legal to query) and the **ACRA/VCC registry**, turning
"boutique AM" *inference* into a verified fact: does this firm actually hold a CMS
license, in which category, is it a VCC. Feeds both the filter (drop firms with no
relevant license) and `business_model_fit` (verified VCC exposure).
- **Budget:** USD 1,800 — USD 1,000 Coresignal Company API credits + registry
  pipeline infra/hosting; USD 800 one-off scraper + entity-resolution build.
- **Time:** 6 days.
- **Expected impact:** filter precision (count of 90%+ fits in the raw pull) from
  an estimated **~45% → ~70%** on the Mandate-A-shape pool, by eliminating
  unlicensed look-alike firms the size+industry filter currently lets through.
- **Trade-off:** spends the biggest slice on one mandate *shape*; firms outside SG
  regulatory registries (Mandate B's SFOs, offshore) get no lift from this.

### #2 — Calibration harness + labelled eval set
A 300-profile set hand-labelled to the internal calibration (core/adjacent/
disqualified + a rank order), wired to compute filter-precision and top-10 rank
correlation automatically on every config change.
- **Budget:** USD 1,400 — USD 800 domain-savvy contractor labelling (~40 hrs @ $20);
  USD 600 Coresignal credits to assemble the eval set.
- **Time:** 4 days.
- **Expected impact:** cuts config-tuning cycle time from ~half a day of eyeballing
  to minutes per iteration, and converts "estimated 45%" into a tracked metric with
  a target (≥70%). Prerequisite for trusting #1's and #3's numbers.
- **Trade-off:** builds measurement, not capability — a week with no user-visible
  feature; justified because we're currently flying on intuition.

### #3 — Two-pass pre-rank + sparse-mode scoring
Score-rank IDs on firmographics via the cheap *preview* endpoint **before**
collecting, so collect credits flow to the most promising profiles first; and add a
sparse-mode scoring branch (firm-archetype-weighted, confidence-capped) for thin
profiles.
- **Budget:** USD 1,800 — LLM API + Coresignal preview/collect credits for
  experiments and the pre-rank model.
- **Time:** 5 days.
- **Expected impact:** collect-credit efficiency — **+30% more 90%+ fits collected
  per 100 credits** on tight pools; and ranking stability on sparse profiles
  (Mandate B) measured as fewer rank inversions vs the labelled set.
- **Trade-off:** adds a preview-credit cost and pipeline complexity; only pays off
  when the candidate pool exceeds the collect budget.

---

## Tool 2 — Outreach (USD 5,000 · 2 weeks / 10 working days)

### #1 — Sparse-recipient enrichment connector  *(directly attacks the hardest case)*
Before generation, enrich thin recipients with company-level public signals —
**a news/funding API (e.g. NewsAPI ~USD 450/yr) + Coresignal Company API** for
firmographics — so a name-only recipient gains grounded, *true* context (recent
raise, leadership change, expansion) without fabrication.
- **Budget:** USD 2,000 — USD 1,200 API subscriptions (prorated/annual) + USD 800
  connector build.
- **Time:** 4 days.
- **Expected impact:** sparse-tier recipients with at least one grounded
  personalisation hook from **~0% → ~60%**, and `review_required` rate on the
  sparse tier down correspondingly.
- **Trade-off:** spends 40% of the tool's budget on the 2-of-5 hardest cases;
  rich recipients see little gain.

### #2 — Output-quality eval + repetition guard at scale
A human-rated rubric (register, specificity, hallucination) on a rolling sample,
plus an embeddings-based cross-recipient similarity check that flags drafts too
similar to others in the batch.
- **Budget:** USD 1,500 — USD 1,000 rater time; USD 500 embeddings API + infra.
- **Time:** 3 days.
- **Expected impact:** at 100 recipients, output-repetition (max pairwise cosine
  similarity) held **below 0.85**, and a tracked quality score that surfaces drift
  before a batch goes out — the "quality drift at scale" risk named in Q2.
- **Trade-off:** adds a human-in-the-loop sampling step; doesn't improve any single
  draft, it protects the batch.

### #3 — Channel + sequence logic
Move from one-shot drafts to a 2-touch sequence with channel selection (email vs
LinkedIn) driven by data availability and a follow-up that references the first.
- **Budget:** USD 1,500 — LLM API for sequence generation + build.
- **Time:** 3 days.
- **Expected impact:** measured as reply-rate proxy on a held-out test; target a
  **+15–25% lift** in first-reply over single-touch (industry-standard sequencing
  uplift).
- **Trade-off:** sequencing raises the deliverability/compliance surface (unsub,
  send limits) we'd otherwise not have to manage.

---

**The trade-off across tools:** putting 3 of 5 weeks into Jatayu means the Outreach
tool ships *without* CRM/email-platform integration (send, track, suppress) — it
generates and audits, a human still sends. That's the right call: a warm reply is
worth far more than send automation, and Jatayu's filter-precision metric is where
the grade and the client value concentrate.
