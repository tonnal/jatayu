"use client";
import { useEffect, useState } from "react";
import { Ctx } from "@/lib/workflow";
import { api, Candidate, Ranked, STATUS_FLOW } from "@/lib/api";
import { Card, Button, Pill, TierBadge, Bar, Stat, SectionTitle, Kicker, TIER_COLOR, fitColor } from "@/components/ui";

/* ----------------------------- shared bits ----------------------------- */

function EditableChips({ items, onChange, tone = "zinc", placeholder = "Add…" }: {
  items: string[]; onChange: (v: string[]) => void; tone?: string; placeholder?: string;
}) {
  const [val, setVal] = useState("");
  const toneCls: Record<string, string> = {
    zinc: "bg-zinc-100 text-zinc-700", indigo: "bg-[--color-accent-soft] text-[--color-accent]",
    rose: "bg-rose-50 text-rose-700", emerald: "bg-emerald-50 text-emerald-700",
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((it, i) => (
        <span key={`${it}-${i}`} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${toneCls[tone]}`}>
          {it}
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-current/50 hover:text-current">×</button>
        </span>
      ))}
      <input value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) { onChange([...items, val.trim()]); setVal(""); } }}
        placeholder={placeholder} className="w-28 rounded-md border border-dashed border-[--color-line] bg-transparent px-2 py-0.5 text-xs outline-none placeholder:text-zinc-300 focus:border-[--color-accent]" />
    </div>
  );
}

function NextButton({ ctx, to, label }: { ctx: Ctx; to: Parameters<Ctx["go"]>[0]; label: string }) {
  return <div className="mt-6 flex justify-end"><Button onClick={() => ctx.go(to)}>{label} →</Button></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Kicker>{label}</Kicker><div className="mt-1.5">{children}</div></div>;
}

/* -------------------------------- S1 Brief ------------------------------ */

export function BriefStage({ ctx }: { ctx: Ctx }) {
  const d = ctx.detail;
  const [must, setMust] = useState(d.spec.must_haves);
  const [nice, setNice] = useState(d.spec.nice_to_haves);
  const sig: Record<string, string> = { high: "emerald", medium: "indigo", low: "zinc", negative: "rose" };
  return (
    <>
      <SectionTitle kicker="Setup · 1 — Position spec" title="The Brief, decomposed"
        sub="The mandate parsed into must-haves vs nice-to-haves, plus the signal map an expert carries: what you want to know, and the observable proxy that stands in for it." />
      <Card className="p-6">
        <p className="text-[15px] leading-relaxed text-[--color-muted]">{d.description}</p>
      </Card>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Card className="p-5">
          <Field label="Must-haves (hard requirements)"><EditableChips items={must} onChange={setMust} tone="indigo" /></Field>
        </Card>
        <Card className="p-5">
          <Field label="Nice-to-haves (differentiators)"><EditableChips items={nice} onChange={setNice} tone="zinc" /></Field>
        </Card>
      </div>
      <Card className="mt-5 overflow-hidden p-0">
        <div className="border-b border-[--color-line] px-5 py-3"><Kicker>Signal map — what you want to know → observable proxy</Kicker></div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-[--color-line]">
            {d.criteria_evidence.map((c, i) => (
              <tr key={i} className="align-top">
                <td className="w-1/3 px-5 py-3 font-medium text-[--color-ink]">{c.want}</td>
                <td className="px-5 py-3 text-[--color-muted]">{c.proxy}</td>
                <td className="w-28 px-5 py-3 text-right"><Pill tone={sig[c.signal]}>{c.signal}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <NextButton ctx={ctx} to="market" label="Map the market" />
    </>
  );
}

/* ----------------------------- S2 Market Map ---------------------------- */

const TIER_LABELS: Record<string, string> = { core: "Core target", adjacent: "Strong adjacent", stretch: "Stretch", excluded: "Excluded" };
const TIER_TONE: Record<string, string> = { core: "emerald", adjacent: "indigo", stretch: "amber", excluded: "rose" };

export function MarketStage({ ctx }: { ctx: Ctx }) {
  const mm = ctx.detail.market_map;
  const [groups, setGroups] = useState<Record<string, string[]>>(mm.target_companies);
  return (
    <>
      <SectionTitle kicker="Setup · 2 — Market map & target list" title="Where do these people live?"
        sub="Before any profile, an expert maps the pool: which firm types are the bullseye, which are adjacent, which are categorically wrong. Tier tags here flow straight into ranking and the shortlist bands." />
      <Card className="mb-5 p-5">
        <Kicker>Estimated true pool</Kicker>
        <p className="font-display mt-1 text-xl text-[--color-ink]">{mm.pool_estimate || "—"}</p>
        <p className="mt-1 text-sm text-[--color-muted]">A tight pool means filters should be aggressive — pull close to the true universe, not a noisy superset.</p>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {["core", "adjacent", "stretch", "excluded"].filter((t) => groups[t]).map((t) => (
          <Card key={t} className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${TIER_COLOR[t === "excluded" ? "disqualified" : t]}`} />
              <span className="font-medium text-[--color-ink]">{TIER_LABELS[t]}</span>
            </div>
            <EditableChips items={groups[t]} onChange={(v) => setGroups({ ...groups, [t]: v })} tone={TIER_TONE[t]} />
          </Card>
        ))}
      </div>
      <NextButton ctx={ctx} to="targeting" label="Configure targeting" />
    </>
  );
}

/* ----------------------------- S3 Targeting ----------------------------- */

export function TargetingStage({ ctx }: { ctx: Ctx }) {
  const s = ctx.detail.sourcing;
  const [industries, setIndustries] = useState(s.industries_any);
  const [titles, setTitles] = useState(s.title_keywords_any);
  const ec = s.employee_count;
  return (
    <>
      <SectionTitle kicker="Setup · 3 — Targeting" title="Firm attributes first, title last"
        sub="Title-matching floods the pull with wrong fits. Lead with firm industry and scale; treat the title as the weakest clause. Then screen the negative space." />

      <Card className="p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Location">{s.location_countries.map((c) => <Pill key={c}>{c}</Pill>)}</Field>
          <Field label="Firm size (employees)">{ec ? <Pill tone="indigo">{ec.gte ?? 0}–{ec.lte ?? "∞"}</Pill> : <span className="text-sm text-[--color-faint]">no size filter — size isn&rsquo;t a fit signal here</span>}</Field>
          <div className="md:col-span-2"><Field label="Industries — the precision lever (any-match)"><EditableChips items={industries} onChange={setIndustries} tone="emerald" /></Field></div>
          <div className="md:col-span-2"><Field label="Title keywords — applied last"><EditableChips items={titles} onChange={setTitles} tone="zinc" /></Field></div>
        </div>
      </Card>

      {/* off-limits — hard COI */}
      <Card className="mt-5 p-6">
        <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-500" /><h3 className="font-medium text-[--color-ink]">Off-limits &amp; conflicts</h3><Pill tone="rose">hard block</Pill></div>
        <p className="mt-1 mb-3 text-sm text-[--color-muted]">Categorically excluded regardless of fit — the client&rsquo;s own group, recent placements, active off-limits agreements.</p>
        <EditableChips items={ctx.offLimits} onChange={ctx.setOffLimits} tone="rose" placeholder="Add firm/rule…" />
      </Card>

      {/* negative heuristics — decoration archetypes, toggleable */}
      <Card className="mt-5 p-6">
        <h3 className="font-medium text-[--color-ink]">Negative screen — &ldquo;what weak looks like&rdquo;</h3>
        <p className="mt-1 mb-3 text-sm text-[--color-muted]">Decoration archetypes that look right and aren&rsquo;t. Toggle which to actively screen out.</p>
        <div className="space-y-2">
          {ctx.heuristics.map((h) => (
            <label key={h.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[--color-line] px-3 py-2.5 text-sm hover:bg-zinc-50">
              <input type="checkbox" checked={h.enabled} onChange={(e) => ctx.setHeuristics(ctx.heuristics.map((x) => x.id === h.id ? { ...x, enabled: e.target.checked } : x))} className="h-4 w-4 accent-[--color-accent]" />
              <span className={h.enabled ? "text-[--color-ink]" : "text-[--color-faint] line-through"}>{h.label}</span>
            </label>
          ))}
        </div>
      </Card>

      <details className="mt-5 rounded-xl border border-[--color-line] bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-[--color-muted]">Generated Elasticsearch query</summary>
        <pre className="scroll-thin mt-3 max-h-72 overflow-auto rounded-lg bg-[--color-ink] p-3 text-xs text-zinc-100">{JSON.stringify(ctx.detail.query, null, 2)}</pre>
        <p className="mt-2 text-xs text-[--color-faint]">In demo mode, chip edits are local; in live mode they rewrite this query before the pull.</p>
      </details>

      <NextButton ctx={ctx} to="calibrate" label="Calibrate on benchmarks" />
    </>
  );
}

/* ----------------------------- S4 Calibrate ----------------------------- */

export function CalibrateStage({ ctx }: { ctx: Ctx }) {
  const [verdicts, setVerdicts] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const benches = ctx.calibration;
  return (
    <>
      <SectionTitle kicker="Setup · 4 — Calibrate" title="Validate the targeting before you spend"
        sub="An expert pulls 10–15 benchmark candidates and gets a thumbs-up/down read first — confirming the spec and filters are right before committing the production credit budget." />
      {!benches ? (
        <Card className="flex items-center justify-between p-6">
          <p className="text-sm text-[--color-muted]">Run a cheap calibration pull (1 search + a small sample). Mark each benchmark, then lock targeting.</p>
          <Button onClick={ctx.runCalibrate} disabled={!!ctx.busy}>{ctx.busy === "calibrate" ? "Pulling…" : "Run calibration pull (≈9 cr)"}</Button>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {benches.map((b) => {
              const v = verdicts[b.profile.coresignal_id];
              return (
                <Card key={b.profile.coresignal_id} className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="font-medium">{b.profile.name}</span><TierBadge tier={b.profile.current_firm_tier} /></div>
                    <p className="truncate text-sm text-[--color-muted]">{b.profile.current_title} · {b.profile.current_company}</p>
                  </div>
                  <div className="flex w-32 items-center gap-2">{b.score.disqualified ? <Pill tone="rose">DQ</Pill> : <><Bar value={b.score.fit_score} color={fitColor(b.score.fit_score)} /><span className="w-8 text-right text-sm font-semibold tabular-nums">{b.score.fit_score}</span></>}</div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setVerdicts({ ...verdicts, [b.profile.coresignal_id]: "up" })} className={`rounded-lg px-2.5 py-1.5 text-sm ${v === "up" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}>👍</button>
                    <button onClick={() => setVerdicts({ ...verdicts, [b.profile.coresignal_id]: "down" })} className={`rounded-lg px-2.5 py-1.5 text-sm ${v === "down" ? "bg-rose-100 text-rose-700" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}>👎</button>
                  </div>
                </Card>
              );
            })}
          </div>
          {note && <Card className="mt-4 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">✓ {note}</Card>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={async () => { const r = await ctx.sendFeedback(verdicts); if (r) setNote(r.note); }} disabled={!Object.keys(verdicts).length}>Apply feedback</Button>
            <Button onClick={() => ctx.go("source")}>Lock targeting → Source</Button>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------- S5 Source ------------------------------ */

export function SourceStage({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <SectionTitle kicker="Setup · 5 — Source" title="Run the production longlist"
        sub="One production search plus collection of the refined universe → the raw longlist. Every call is logged to the credit ledger as a costed decision." />
      <Card className="flex items-center justify-between p-6">
        <div>
          <p className="text-sm text-[--color-muted]">{ctx.sourced ? "Longlist sourced and scored. Move to the pipeline." : "Collect the production longlist and score every profile with gates + weighted sub-scores."}</p>
          {ctx.ranked && <p className="mt-1 text-sm text-[--color-ink]">{ctx.ranked.candidates.length} profiles · {ctx.ranked.shortlist_size} pass the gates</p>}
        </div>
        {ctx.sourced ? <Button onClick={() => ctx.go("longlist")}>Open longlist →</Button>
          : <Button onClick={ctx.runSource} disabled={!!ctx.busy}>{ctx.busy === "source" ? "Sourcing + scoring…" : "Run production pull + score"}</Button>}
      </Card>
    </>
  );
}

/* ------------------------------ P1/P2 Longlist -------------------------- */

const TRIAGE_BTN: Record<string, string> = {
  accept: "bg-emerald-100 text-emerald-700", park: "bg-amber-100 text-amber-700", reject: "bg-rose-100 text-rose-700",
};

export function LonglistStage({ ctx }: { ctx: Ctx }) {
  const r = ctx.ranked;
  if (!r) return <Empty msg="Run Source first to build the longlist." />;
  const active = r.candidates.filter((c) => c.triage !== "reject");
  const rejected = r.candidates.filter((c) => c.triage === "reject");
  return (
    <>
      <SectionTitle kicker="Pipeline · Longlist" title={`Longlist — ${r.shortlist_size} pass the gates`}
        sub="Triage the scored pool: accept, park, or reject. Rejections sink and re-rank the board. Click anyone to inspect and override." />
      <div className="space-y-2">{active.map((c) => <LongRow key={c.profile.coresignal_id} c={c} ctx={ctx} />)}</div>
      {rejected.length > 0 && (
        <>
          <p className="mt-6 mb-2"><Kicker>Rejected & disqualified ({rejected.length})</Kicker></p>
          <div className="space-y-2 opacity-60">{rejected.map((c) => <LongRow key={c.profile.coresignal_id} c={c} ctx={ctx} />)}</div>
        </>
      )}
      <NextButton ctx={ctx} to="shortlist" label="Build the shortlist" />
    </>
  );
}

function LongRow({ c, ctx }: { c: Candidate; ctx: Ctx }) {
  const s = c.score;
  return (
    <Card className="flex items-center gap-4 p-3.5">
      <span className="w-8 text-center text-sm font-semibold text-[--color-faint]">{c.rank ? `#${c.rank}` : "—"}</span>
      <button onClick={() => ctx.openCandidate(c)} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[--color-ink] hover:underline">{c.profile.name}</span>
          <TierBadge tier={c.profile.current_firm_tier} />
          {s.overridden && <Pill tone="indigo">overridden</Pill>}
        </div>
        <p className="truncate text-sm text-[--color-muted]">{c.profile.current_title} · {c.profile.current_company}</p>
      </button>
      <div className="flex w-36 items-center gap-2">
        {s.disqualified ? <span className="text-sm font-medium text-rose-600">DQ · {s.failed_gates.join(", ")}</span>
          : <><Bar value={s.fit_score} color={fitColor(s.fit_score)} /><span className="w-8 text-right text-sm font-semibold tabular-nums">{s.fit_score}</span></>}
      </div>
      <div className="flex gap-1">
        {["accept", "park", "reject"].map((v) => (
          <button key={v} onClick={() => ctx.doTriage(c.profile.coresignal_id, c.triage === v ? "none" : v)}
            className={`rounded-md px-2 py-1 text-[11px] font-medium capitalize ${c.triage === v ? TRIAGE_BTN[v] : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"}`}>{v}</button>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------ P3 Shortlist ---------------------------- */

const BAND_TONE: Record<string, string> = { "Direct fit": "emerald", "Strong adjacent": "indigo", "Stretch": "amber", "Wildcard": "zinc" };

export function ShortlistStage({ ctx }: { ctx: Ctx }) {
  const sl = ctx.shortlist;
  if (!sl) return <Empty msg="Loading shortlist…" />;
  return (
    <>
      <SectionTitle kicker="Pipeline · Shortlist" title="The shortlist tells a story"
        sub="Not a ranked dump — a landscape. Direct fits, strong adjacents, stretch options, wildcards, each with the context a client needs to interpret the rank." />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {sl.bands.filter((b) => b.candidates.length).map((b) => (
            <div key={b.band}>
              <div className="mb-2 flex items-center gap-2"><Pill tone={BAND_TONE[b.band]}>{b.band}</Pill><span className="text-xs text-[--color-faint]">{b.candidates.length}</span></div>
              <div className="space-y-2">
                {b.candidates.map((c) => (
                  <Card key={c.profile.coresignal_id} className="p-4">
                    <button onClick={() => ctx.openCandidate(c)} className="w-full text-left">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><span className="font-medium hover:underline">{c.profile.name}</span><TierBadge tier={c.profile.current_firm_tier} /></div>
                        <span className="font-display text-lg">{c.score.fit_score}</span>
                      </div>
                      <p className="text-sm text-[--color-muted]">{c.profile.current_title} · {c.profile.current_company}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-[--color-ink]">{c.score.rationale}</p>
                      {c.score.concerns_or_flags && <p className="mt-1 text-xs text-amber-700">⚑ {c.score.concerns_or_flags}</p>}
                    </button>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div>
          <Card className="p-5">
            <Kicker>Balanced-slate diagnostic</Kicker>
            <p className="font-display mt-1 text-2xl">{sl.slate.size}<span className="text-base text-[--color-faint]"> candidates</span></p>
            <Diag label="By band" data={sl.slate.band_counts} />
            <Diag label="Firm tier spread" data={sl.slate.firm_tier_spread} />
            <Diag label="Confidence" data={sl.slate.confidence_spread} />
            <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">⚑ {sl.slate.diversity_note}</p>
          </Card>
          <NextButton ctx={ctx} to="engagement" label="Engage" />
        </div>
      </div>
    </>
  );
}

function Diag({ label, data }: { label: string; data: Record<string, number> }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-[--color-faint]">{label}</p>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="mt-1 flex items-center justify-between text-sm"><span className="capitalize text-[--color-muted]">{k}</span><span className="tabular-nums">{v}</span></div>
      ))}
    </div>
  );
}

/* ----------------------------- P4 Engagement ---------------------------- */

export function EngagementStage({ ctx }: { ctx: Ctx }) {
  const r = ctx.ranked;
  if (!r) return <Empty msg="Run Source first." />;
  const shortlisted = r.candidates.filter((c) => c.rank);
  return (
    <>
      <SectionTitle kicker="Pipeline · Engagement" title="Move candidates through the process"
        sub="Each shortlisted candidate carries a status. Advance them as the search progresses — this is what powers the client status report." />
      <div className="space-y-3">
        {shortlisted.map((c) => (
          <Card key={c.profile.coresignal_id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><span className="font-medium">{c.profile.name}</span><TierBadge tier={c.profile.current_firm_tier} /><span className="text-sm text-[--color-muted]">· {c.profile.current_company}</span></div>
              <Pill tone="indigo">{(c.status || "sourced").replace("_", " ")}</Pill>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1">
              {STATUS_FLOW.map((st, i) => {
                const cur = STATUS_FLOW.indexOf(c.status || "sourced");
                const done = i <= cur;
                return (
                  <span key={st} className="flex items-center gap-1">
                    <button onClick={() => ctx.doStatus(c.profile.coresignal_id, st)}
                      className={`rounded-md px-2 py-1 text-[11px] capitalize transition ${done ? "bg-[--color-accent] text-white" : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"}`}>{st.replace("_", " ")}</button>
                    {i < STATUS_FLOW.length - 1 && <span className={`h-px w-3 ${i < cur ? "bg-[--color-accent]" : "bg-zinc-200"}`} />}
                  </span>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
      <NextButton ctx={ctx} to="report" label="Generate client report" />
    </>
  );
}

/* ------------------------------ Client report --------------------------- */

export function ReportStage({ ctx }: { ctx: Ctx }) {
  const rep = ctx.report;
  if (!rep) return <Empty msg="Generating report…" />;
  return (
    <>
      <SectionTitle kicker="Deliverable" title="Client status report"
        sub="The shareable artifact — shortlist with context, pipeline status, and the cost of the search." />
      <Card className="p-7">
        <div className="flex items-baseline justify-between border-b border-[--color-line] pb-4">
          <div><Kicker>Mandate</Kicker><h3 className="font-display text-2xl">{rep.mandate}</h3></div>
          <Pill tone="indigo">confidential</Pill>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Longlist" value={rep.pool.longlist} />
          <Stat label="Shortlist" value={rep.pool.shortlist} />
          <Stat label="Disqualified" value={rep.pool.disqualified} />
          <Stat label="Credits used" value={rep.credits_spent} sub={`of ${ctx.credits?.cap ?? 300}`} />
        </div>
        <div className="mt-6">
          <Kicker>Shortlist by band</Kicker>
          <div className="mt-2 space-y-3">
            {rep.shortlist.bands.filter((b) => b.candidates.length).map((b) => (
              <div key={b.band}>
                <Pill tone={BAND_TONE[b.band]}>{b.band}</Pill>
                <ul className="mt-1.5 space-y-1">
                  {b.candidates.map((c) => (
                    <li key={c.profile.coresignal_id} className="flex items-baseline justify-between border-b border-dashed border-[--color-line] pb-1 text-sm">
                      <span><b>{c.profile.name}</b> — {c.profile.current_title}, {c.profile.current_company}</span>
                      <span className="tabular-nums text-[--color-muted]">{c.score.fit_score} · {(c.status || "sourced").replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6">
          <Kicker>Pipeline status</Kicker>
          <div className="mt-2 flex flex-wrap gap-2">{Object.entries(rep.pipeline_status).map(([k, v]) => <Pill key={k}>{k.replace("_", " ")}: {v}</Pill>)}</div>
        </div>
      </Card>
    </>
  );
}

function Empty({ msg }: { msg: string }) {
  return <Card className="p-10 text-center text-sm text-[--color-faint]">{msg}</Card>;
}

/* --------------------------- candidate drawer --------------------------- */

export function CandidateDrawer({ id, c, onClose, onRanked }: { id: string; c: Candidate; onClose: () => void; onRanked: (r: Ranked) => void }) {
  const p = c.profile, s = c.score;
  const [subs, setSubs] = useState<Record<string, number>>(() => Object.fromEntries(s.sub_scores.map((x) => [x.id, x.value ?? 0])));
  const [gates, setGates] = useState<Record<string, boolean>>(() => Object.fromEntries(s.gates.map((g) => [g.id, g.passed])));
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSubs(Object.fromEntries(s.sub_scores.map((x) => [x.id, x.value ?? 0])));
    setGates(Object.fromEntries(s.gates.map((g) => [g.id, g.passed])));
  }, [p.coresignal_id]); // eslint-disable-line

  async function recompute() {
    setBusy(true);
    try {
      const subOv: Record<string, number> = {}, gateOv: Record<string, boolean> = {};
      s.sub_scores.forEach((x) => { if (subs[x.id] !== (x.value ?? 0)) subOv[x.id] = subs[x.id]; });
      s.gates.forEach((g) => { if (gates[g.id] !== g.passed) gateOv[g.id] = gates[g.id]; });
      onRanked(await api.override(id, p.coresignal_id, { sub_overrides: subOv, gate_overrides: gateOv, note }));
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-[--color-ink]/25 backdrop-blur-sm" onClick={onClose}>
      <div className="scroll-thin h-full w-full max-w-xl overflow-y-auto bg-[--color-canvas] p-6 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2"><h2 className="font-display text-2xl">{p.name}</h2><TierBadge tier={p.current_firm_tier} /></div>
            <p className="text-sm text-[--color-muted]">{p.current_title} · {p.current_company} · {p.location_country}</p>
            <p className="text-xs text-[--color-faint]">{p.years_relevant_experience}y relevant / {p.years_total_experience}y total</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-[--color-faint] hover:bg-zinc-200">✕</button>
        </div>

        <div className="mt-4 flex items-center gap-4 rounded-xl border border-[--color-line] bg-white p-4">
          <div className="font-display text-4xl">{s.fit_score}</div>
          <div className="text-xs text-[--color-muted]">fit score{s.disqualified && <span className="ml-1 font-semibold text-rose-600">· DISQUALIFIED</span>}<div>ungated {s.ungated_fit} · confidence {s.confidence}{s.overridden && " · overridden"}</div></div>
        </div>

        {s.rationale && <p className="mt-4 rounded-xl border border-[--color-line] bg-white p-3 text-sm text-[--color-ink]">{s.rationale}</p>}
        {s.concerns_or_flags && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">⚑ {s.concerns_or_flags}</p>}

        <p className="mt-5"><Kicker>Career — read firm types, not titles</Kicker></p>
        <div className="mt-2 space-y-2">
          {p.experiences.map((e, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-[--color-line] bg-white p-3 text-sm">
              <span className={`h-9 w-1 rounded-full ${TIER_COLOR[e.tier]}`} />
              <div className="min-w-0 flex-1"><p className="font-medium">{e.title} <span className="font-normal text-[--color-muted]">@ {e.company}</span></p><p className="text-xs text-[--color-faint]">{e.firm_label} · {e.industry || "industry n/a"} · {e.size ? `${e.size} emp` : "size n/a"} · {e.period}</p></div>
              <TierBadge tier={e.tier} />
            </div>
          ))}
        </div>

        <p className="mt-6"><Kicker>Gates — override path</Kicker></p>
        <div className="mt-2 space-y-2">
          {s.gates.map((g) => (
            <label key={g.id} className="flex items-start gap-3 rounded-xl border border-[--color-line] bg-white p-3 text-sm">
              <input type="checkbox" checked={gates[g.id]} onChange={(e) => setGates({ ...gates, [g.id]: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[--color-accent]" />
              <span><span className="font-medium">{g.id}</span> {g.hard ? <Pill tone="rose">hard</Pill> : <Pill>soft</Pill>}<span className={`ml-2 ${gates[g.id] ? "text-emerald-600" : "text-rose-600"}`}>{gates[g.id] ? "pass" : "fail"}</span><p className="mt-0.5 text-xs text-[--color-faint]">{g.description}</p></span>
            </label>
          ))}
        </div>

        <p className="mt-6"><Kicker>Sub-scores — adjust & recompute</Kicker></p>
        <div className="mt-2 space-y-3">
          {s.sub_scores.map((x) => (
            <div key={x.id}>
              <div className="flex items-center justify-between text-sm"><span className="text-[--color-ink]">{x.label} <span className="text-xs text-[--color-faint]">w={x.weight}</span></span><span className="font-medium tabular-nums">{subs[x.id]}</span></div>
              <input type="range" min={0} max={100} value={subs[x.id]} onChange={(e) => setSubs({ ...subs, [x.id]: Number(e.target.value) })} className="w-full accent-[--color-accent]" />
              {x.reason && <p className="text-xs text-[--color-faint]">{x.reason}</p>}
            </div>
          ))}
        </div>

        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Override note (e.g. 'AM exp confirmed on call')" className="mt-4 w-full rounded-xl border border-[--color-line] bg-white px-3 py-2 text-sm outline-none focus:border-[--color-accent]" />
        <Button onClick={recompute} disabled={busy} className="mt-3 w-full">{busy ? "Recomputing…" : "Recompute fit (deterministic)"}</Button>
      </div>
    </div>
  );
}
