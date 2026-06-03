# Q1b — Configuration Migration Document: Mandate B

**Executed mandate:** A (Compliance, SG asset manager).
**This document:** how Jatayu handles **Mandate B (Investment Director, SG Single
Family Office)** with *no code changes* — only a new config (`configs/mandate_b.yaml`,
committed and validated through the identical pipeline) — and, honestly, where it
strains.

## Two paths to a working config — neither requires code

There is a meaningful subtlety the brief asks about ("how would your tool handle
the other mandate without code changes") that this doc should name up front:

1. **LLM-generated path (the default).** The user pastes a mandate brief into the
   home-page "Generate strategy" card (or hits `POST /api/generate`). `jatayu/
   strategy.py` translates the brief into a complete `MandateConfig` —
   industries, firm taxonomy, gates, sub-scores, weights, exclusions — and
   writes it to `configs/generated.yaml`. The same engine then runs against
   that config identically to a hand-written one. **No YAML editing required at
   all.** This is how Mandate B *actually* lands in the product today.

2. **Expert-tuned path (what this document shows).** A search professional
   reads the LLM's first draft, identifies precision/recall trade-offs the
   model didn't make well (e.g. "drop the `employee_count` cap entirely
   because firm size is noise for SFO PMs"), and edits the YAML. The diff
   below is that human refinement — the version we'd ship after one expert
   iteration on top of the LLM output.

The brief asks for an explicit diff, so this doc shows the expert-tuned
version. But the architecturally honest answer to "how does the tool handle a
new mandate" is **path 1: it generates the config itself.** Path 2 is the
ceiling, not the floor.

---

## 1. Diff against the existing config

`configs/mandate_b.yaml` is the same schema as `mandate_a.yaml`. The meaningful
hunks (comment churn omitted; full diff: `diff -u configs/mandate_a.yaml configs/mandate_b.yaml`):

```diff
 sourcing:
   company_filters:
     industries_any:
-      - "Investment Management"        # A: narrow to AM-shaped firms
-      - "Financial Services"
-      - "Capital Markets"
-      - "Venture Capital & Private Equity"
+      - "Investment Management"        # B: broaden to all buy-side + private banks
+      - "Capital Markets"
+      - "Venture Capital & Private Equity"
+      - "Financial Services"
+      - "Banking"                      # private banks hold HNW PM-book candidates
-    employee_count:                    # A: boutique scale is THE signal
-      gte: 5
-      lte: 250
+    # B: NO employee_count range — firm size is not a fit signal for this mandate.

   title_keywords_any:
-      - "Compliance" / "Chief Compliance Officer" / "Head of Compliance" / ...
+      - "Investment Director" / "Portfolio Manager" / "Chief Investment Officer"
+      - "Head of Investments" / "Multi-Asset" / "Investment Principal"

   exclusions:
     title_keywords_none:
-      - "Internal Audit" / "Auditor"
+      - "Analyst" / "Associate" / "Sales" / "Distribution"   # junior / sell-side

 scoring:
   gates:
-    - am_side_experience / singapore_based / minimum_experience (8y)
+    - minimum_experience_15y (hard)
+    - discretionary_pm_track_record (hard)
+    - multi_asset (hard)
+    - singapore_rooted (SOFT — flag, don't zero)

   sub_scores:                          # weights re-allocated, all sum to 1.0
-    am_regulatory_fit            0.30
-    ownership_scope              0.25
-    business_model_fit           0.25
-    commercial_orientation       0.15
-    stability_progression        0.05
+    multi_asset_pm_track_record  0.30
+    sfo_mfo_fit                  0.25
+    private_markets_depth        0.20
+    singapore_roots              0.15
+    seniority_scope              0.10
```

The firm taxonomy is fully replaced (compliance-pool types → buy-side/family-office
types); see §2.

---

## 2. Search-filter changes (with reasoning)

| Filter | Change | Why |
|---|---|---|
| `industries_any` | **Broadened**, added `Banking` | B's pool spans buy-side AND private banks (HNW PM book). A excluded banking entirely; B needs it. |
| `employee_count` | **Removed** | The single biggest filter difference. For A, boutique scale (≤250) *is* the sole-officer signal. For B, a senior PM seat exists at a 6-person SFO and a 6,000-person global AM alike — size is noise, and capping it would wrongly drop strong candidates. |
| `title_keywords_any` | **Replaced** | Investment titles (Investment Director / PM / CIO / Head of Investments) replace compliance titles. Still applied *last*. |
| `exclusions.title_keywords_none` | **Repurposed** | A excluded audit. B excludes `Analyst`/`Associate` (junior step-up risk) and `Sales`/`Distribution` (no discretionary PM book). |
| `exclusions.industries_none` | **Reduced** | A excluded Banking/Insurance/Accounting. B keeps Banking (private banks are in-pool) and excludes only Insurance. |
| Firm taxonomy | **Replaced** | `boutique_am/bank/big4/ifa/regulator` → `single_family_office (core)`, `multi_family_office (core)`, `private_bank (adjacent)`, `buy_side_am (adjacent)`, `sell_side_ib (disqualified)`, `retail_ifa (disqualified)`. |

**A filter that is NOT reusable:** the `employee_count` boutique cap. It is the
crispest precision lever on Mandate A and *actively harmful* on Mandate B. Nothing
one-to-one replaces it; the discrimination it provided moves *into the scorer* (the
`sfo_mfo_fit` and `multi_asset_pm_track_record` sub-scores), which is the honest
admission that B's signal isn't filterable the way A's is.

---

## 3. Scoring weight changes

All four A sub-scores are **dropped** (they're compliance-specific) and five new
ones appear. Numerical weights:

| Sub-score (Mandate B) | Weight | Replaces |
|---|---|---|
| `multi_asset_pm_track_record` | 0.30 | (new) — the essential requirement |
| `sfo_mfo_fit` | 0.25 | structurally parallels A's `ownership_scope` |
| `private_markets_depth` | 0.20 | (new) — deal flow / PE-VC depth |
| `singapore_roots` | 0.15 | (new) — commitment to stay; A had no equivalent |
| `seniority_scope` | 0.10 | structurally parallels A's `stability_progression` |

Gates change from 3 (all hard) to 4 (three hard, **one soft**): `singapore_rooted`
is soft because PR status often isn't observable on a profile, so zeroing on it
would over-prune — we flag instead.

---

## 4. What breaks (honest)

1. **Filter precision degrades, structurally.** A's precision came from the size
   cap; B has no equivalent crisp filter. The raw pull for B *will* be noisier
   (more senior bankers and single-asset PMs slipping in), and more of the
   precision burden falls on the scorer. If the audit metric is "90%+ fits in the
   raw pull," B's raw pull will score worse than A's no matter how good the config.

2. **Sparse SFO profiles starve the scorer.** Coresignal can return a near-empty
   profile for exactly the most in-pool people. The system degrades to low
   confidence and `sfo_mfo_fit` inference from the firm name alone — but a profile
   with two lines can't be ranked confidently against a rich one. The ranking is
   least trustworthy precisely where the best candidates live. (Q2's richness-tier
   handling exists; the Q1 scorer only has a confidence field, not a full
   sparse-mode strategy.)

3. **No ground-truth archetype, so ranking is contestable.** A reasonable reviewer
   could weight `private_markets_depth` at 0.30 and `singapore_roots` at 0.05 and
   produce a defensibly different top-10. My weights are a *position*, not a fact —
   the config makes them explicit and tunable, but it can't make B's fuzziness go
   away.

4. **(Bonus) `years_relevant_experience` is title-keyword based.** It counts tenure
   in titles containing compliance/PM tokens. For B's varied titles (e.g.
   "Managing Director" at a fund) this under-counts relevant years — a normalization
   gap, not a config gap (see §6).

---

## 5. Estimated credit allocation (if run today)

| Stage | Mandate A (executed) | Mandate B (estimate) | Why different |
|---|---|---|---|
| Dev — searches | ~10 | **~20** | Fuzzier pool ⇒ more filter iterations to find a tolerable precision/recall balance. |
| Dev — sample collects | ~25 | **~40** | Need to inspect more samples across archetypes to calibrate scorer weights. |
| Production collect | ~200 | **~220** | Looser filter ⇒ pull more to compensate for lower precision, then let the scorer cut. |
| Reserve | ~45 | **~20** | Less buffer because dev ate more. |
| **Split** | ~35 dev / ~245 prod | **~60 dev / ~240 prod** | B justifies the brief's "50 for dev" far more than A does. |

---

## 6. Code changes you'd genuinely need anyway

Short list (the architecture handles most of B in config; these are the real gaps):

1. **Sparse-mode scoring path in the Q1 scorer.** Port Q2's richness-tier idea into
   `scoring/`: when a profile is below a data threshold, switch to a firm-archetype-
   weighted scoring strategy and cap confidence, rather than scoring thin data on the
   normal rubric. Today the scorer has a confidence field but not a branch. This is
   logic, not config.

2. **A non-string firm classifier for B.** B leans harder on `name_keywords`
   ("Family Office", "Multi Family") which are noisier than A's industry+size combo.
   A robust version needs fuzzy matching / a small firm registry, which is code.

3. **`years_relevant_experience` made config-driven.** The relevant-title token list
   (`_RELEVANT_TITLE_TOKENS` in `profile.py`) is hard-coded for compliance. To serve
   B it should be a config field (PM/investment tokens). Small change, but genuinely
   code today.

The fact that this list is *short* and *peripheral* (not "rewrite the query builder")
is the evidence the architecture generalises. The fact that it's *non-empty* is the
honest answer the brief asks for.
