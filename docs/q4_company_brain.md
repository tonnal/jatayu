# Q4 — Company Brain for an Executive Search Business

## 1. What it means in this context (specifically, not generically)

For most software companies a "Company Brain" means a RAG layer over Slack, docs,
and tickets so anyone can ask "how does X work." That definition is wrong for
executive search, because a search firm's product is not information — it's
**judgment about fit under a specific client's idiosyncratic taste**, applied to a
talent pool everyone can technically see.

So for executive search, the Company Brain is the system that **captures and
compounds the firm's proprietary outcome knowledge** — who we put in front of which
client, who advanced, who got rejected *and why*, who declined the approach, who got
placed and then thrived or flamed out — and turns it into reusable fit judgment.
It is not a database of candidates (LinkedIn and Coresignal already are that). It is
a database of **decisions and their consequences**, which no vendor can sell you.

## 2. Architecture sketch

**Captured:** (a) mandate briefs; (b) every shortlist with per-candidate *outcome
events* — shortlisted → advanced → client-rejected (with reason) → offer → placed →
6/12-month retention; (c) outreach sent + replies (mailbox); (d) interview/call
debrief notes; (e) Jatayu's own pull + sub-score logs (so we can later ask which
scores predicted placement).

**Where it lives:** three coupled stores —
1. an **entity graph** (people ↔ firms ↔ clients ↔ mandates ↔ recruiters);
2. an **outcome event log** (the labels: decision + reason + timestamp);
3. a **vector index** over briefs/notes for semantic recall;
plus a derived **per-client preference model** trained on the event log.

**Queried by whom, doing what:** a recruiter *starting a new mandate* opens the
mandate console and asks, in effect, *"show me the shape and our history for a role
like this"*. The Brain returns: comparable past mandates and how they resolved;
**feeder firms** that produced placed candidates for this role type; candidates we've
shortlisted before for similar roles with their outcome and current relationship
warmth; and — the differentiator — a pre-ranking scored by *this client's revealed
preferences*, not just the brief. A recruiter *mid-search* asks *"who have we
approached, who's gone cold, who should I re-contact"* and gets relationship state,
not just profiles.

## 3. Top 3 data sources to ingest first (ranked by ROI ÷ ingestion effort)

1. **Past shortlists with advance/reject outcomes.** Highest ROI/effort. These are
   the *labels* — the only training signal that lets the Brain learn fit better than
   the open market. If they live in any tracker/ATS/spreadsheet, ingestion is
   moderate effort for an enormous, irreplaceable payoff. Without labels, everything
   downstream is unsupervised guessing.
2. **Recruiter mailboxes (Gmail/Outlook API).** Low ingestion effort (one OAuth
   connector), high value: it reconstructs the relationship graph and recency
   ("when did we last talk, did they reply"), and yields response-pattern data for
   free. The effort-to-value ratio is excellent precisely because it's already
   structured and timestamped.
3. **Interview / client debrief notes.** Highest *raw* value (this is the tacit "why
   we passed" that humans forget within weeks) but highest effort — unstructured,
   scattered, needs transcription + extraction. Third only because of effort, not
   importance; it's where the rejection *reasons* in source #1 get their texture.

## 4. What the system should learn over time (signal humans miss or forget)

- **Each client's revealed fit function.** The delta between what a client *wrote*
  in the brief and who they actually *advanced vs rejected*. Humans re-learn this
  per engagement and forget it between them.
- **Rejection reasons, structured.** The "why not" is forgotten fastest and is the
  most valuable label. "Too bank-y," "great on paper, weak in the room," "wanted
  more commercial edge" — these train the next search.
- **Closed-loop scorer calibration.** Which Jatayu sub-scores actually predicted
  placement, so the rubric self-corrects (maybe `commercial_orientation` predicts
  client-advance far better than `stability_progression` — humans wouldn't notice).
- **Relationship decay.** Who is going cold and is due a touch — the firm's network
  is an asset that silently depreciates.
- **Feeder-firm graph per role type.** The career paths that actually produce placed
  candidates, rediscovered from scratch on every mandate today.

## 5. One non-obvious insight

**The obvious-LLM-summary version:** *"Build a centralized knowledge base over all
your candidate data, past searches, and communications so institutional knowledge is
never lost and any recruiter can query it. Capture tacit expert knowledge and use
RAG to make it searchable."* (Centralize everything → retrieve everything.)

**My view, which differs:** *Centralizing the positive data is nearly worthless,
because it's commodity.* Every competitor can buy the same profiles. The only
defensible asset — the moat — is the **negative space: rejections, declines, and
flame-outs, labelled per client.** And the second non-obvious claim: **the written
mandate is a lossy proxy that the Brain should learn to distrust.** Two clients with
identical briefs want different people; the brief is what the client *can articulate*,
the advance/reject pattern is what they *actually want*. So the Company Brain's
primary job is not "remember everything" — it's to **capture the why-not at the
moment of decision and model each client's revealed preferences against their stated
ones.** A brain that ingests profiles and notes produces commodity-in-commodity-out;
a brain that ingests *outcomes and rejections* produces judgment a competitor cannot
copy even with the same candidate data. Most teams will build the first because the
data is easy; the value is entirely in the second, which is hard precisely because
that data has to be captured deliberately and decays if you don't.

## 6. Honest self-assessment — what I'm least sure about

The **revealed-preference model is data-hungry, and a boutique search firm may not
have the volume to train it.** A firm doing tens (not thousands) of placements a year,
spread across many one-off clients, has a brutal cold-start/sparsity problem: per
client you might have a handful of advance/reject decisions — nowhere near enough to
fit a preference model that beats the brief. My insight could be *directionally right
but operationally premature*: the negatives are the moat in principle, yet in
practice a small firm might get more value, sooner, from the boring relationship-CRM
and feeder-firm graph than from a learned fit function that's starved of labels. I'd
de-risk this by starting with *aggregate* role-type preferences (pool across similar
clients) rather than per-client models, and only specializing per client once a
client has enough history — but I'm genuinely unsure where that threshold sits, and
whether it's reachable at boutique scale at all.
