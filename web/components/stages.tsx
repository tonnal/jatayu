"use client";
import { useEffect, useState } from "react";
import { Ctx } from "@/lib/workflow";
import { api, Candidate, Ranked, Preflight, STATUS_FLOW } from "@/lib/api";
import { Card, Button, Pill, TierBadge, Bar, Stat, SectionTitle, Kicker, Dot, TIER_HEX, fitColor } from "@/components/ui";

/* ----------------------------- shared bits ----------------------------- */

function EditableChips({ items, onChange, tone = "zinc", placeholder = "Add…" }: {
  items: string[]; onChange: (v: string[]) => void; tone?: string; placeholder?: string;
}) {
  const [val, setVal] = useState("");
  const toneCls: Record<string, string> = {
    zinc: "bg-black/[.04] text-[var(--color-ink)]", indigo: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
    rose: "text-[#9d3a30] bg-[#9d3a30]/8", emerald: "text-[#1f4d44] bg-[#1f4d44]/8", amber: "text-[#9a6b1f] bg-[#9a6b1f]/8",
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((it, i) => (
        <span key={`${it}-${i}`} className={`group inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium ${toneCls[tone]}`}>
          {it}
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="opacity-40 transition hover:opacity-100">×</button>
        </span>
      ))}
      <input value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) { e.stopPropagation(); onChange([...items, val.trim()]); setVal(""); } }}
        placeholder={placeholder} className="w-32 rounded-md border border-dashed border-[var(--color-line-strong)] bg-transparent px-2 py-1 text-[13px] outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)]" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Kicker>{label}</Kicker><div className="mt-2">{children}</div></div>;
}

/* -------------------------------- S1 Brief ------------------------------ */

export function BriefStage({ ctx }: { ctx: Ctx }) {
  const d = ctx.detail;
  const [text, setText] = useState(d.description);
  const [analyzed, setAnalyzed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [must, setMust] = useState(d.spec.must_haves);
  const [nice, setNice] = useState(d.spec.nice_to_haves);
  const sig: Record<string, string> = { high: "emerald", medium: "indigo", low: "zinc", negative: "rose" };

  const analyze = () => { setAnalyzing(true); setTimeout(() => { setAnalyzing(false); setAnalyzed(true); }, 650); };

  return (
    <>
      <SectionTitle kicker="Setup · 01 — Position spec" title="Start with the mandate"
        sub="Paste the brief from the client. Jatayu decomposes it into hard requirements, differentiators, and the signal map — the observable proxies an expert reads in place of things a profile never states outright." />

      <Card className="p-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) analyze(); }}
          rows={7} spellCheck={false}
          className="w-full resize-none rounded-xl bg-transparent p-4 text-[15px] leading-relaxed text-[var(--color-ink)] outline-none placeholder:text-[var(--color-faint)]"
          placeholder="Paste the mandate brief…" />
        <div className="flex items-center justify-between border-t border-[var(--color-line)] px-4 py-3">
          <span className="text-xs text-[var(--color-faint)]">{text.trim().split(/\s+/).filter(Boolean).length} words · ⌘↵ to analyze</span>
          <Button onClick={analyze} disabled={analyzing || !text.trim()}>
            {analyzing ? "Analyzing…" : analyzed ? "Re-analyze" : "Analyze brief"} →
          </Button>
        </div>
      </Card>

      {analyzed && (
        <div className="rise mt-7 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5"><Field label="Must-haves — hard requirements"><EditableChips items={must} onChange={setMust} tone="indigo" /></Field></Card>
            <Card className="p-5"><Field label="Nice-to-haves — differentiators"><EditableChips items={nice} onChange={setNice} tone="zinc" /></Field></Card>
          </div>
          <Card className="overflow-hidden">
            <div className="border-b border-[var(--color-line)] px-5 py-3"><Kicker>Signal map — what you want to know → the observable proxy</Kicker></div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--color-line)]">
                {d.criteria_evidence.map((c, i) => (
                  <tr key={i} className="align-top">
                    <td className="w-1/3 px-5 py-3.5 font-medium">{c.want}</td>
                    <td className="px-5 py-3.5 text-[var(--color-muted)]">{c.proxy}</td>
                    <td className="w-28 px-5 py-3.5 text-right"><Pill tone={sig[c.signal]}>{c.signal}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
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
      <SectionTitle kicker="Setup · 02 — Market map" title="Where do these people live?"
        sub="Before a single profile, map the pool. Sort firm types into the bullseye, the close, the stretch, and the categorically wrong. These tiers flow straight into ranking and the shortlist bands." />
      <Card className="mb-5 flex flex-wrap items-end justify-between gap-4 p-5">
        <div><Kicker>Estimated true pool</Kicker><p className="font-display mt-1.5 text-2xl">{mm.pool_estimate || "—"}</p></div>
        <p className="max-w-sm text-sm text-[var(--color-muted)]">A tight pool means aggressive filters — pull close to the true universe, not a noisy superset.</p>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {["core", "adjacent", "stretch", "excluded"].filter((t) => groups[t]).map((t) => (
          <Card key={t} className="p-5">
            <div className="mb-3 flex items-center gap-2"><Dot tier={t === "excluded" ? "disqualified" : t} className="h-2.5 w-2.5" /><span className="font-medium">{TIER_LABELS[t]}</span></div>
            <EditableChips items={groups[t]} onChange={(v) => setGroups({ ...groups, [t]: v })} tone={TIER_TONE[t]} />
          </Card>
        ))}
      </div>
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
      <SectionTitle kicker="Setup · 03 — Targeting" title="Firm attributes first, title last"
        sub="Title-matching floods the pull with wrong fits. Lead with firm industry and scale; treat the title as the weakest clause. Then screen the negative space." />
      <Card className="p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Location">{s.location_countries.map((c) => <Pill key={c}>{c}</Pill>)}</Field>
          <Field label="Firm size (employees)">{ec ? <Pill tone="indigo">{ec.gte ?? 0}–{ec.lte ?? "∞"}</Pill> : <span className="text-sm text-[var(--color-faint)]">no size filter — size isn&rsquo;t a fit signal here</span>}</Field>
          <div className="md:col-span-2"><Field label="Industries — the precision lever (any-match)"><EditableChips items={industries} onChange={setIndustries} tone="emerald" /></Field></div>
          <div className="md:col-span-2"><Field label="Title keywords — applied last"><EditableChips items={titles} onChange={setTitles} tone="zinc" /></Field></div>
        </div>
      </Card>

      <Card className="mt-5 p-6">
        <div className="flex items-center gap-2"><Dot tier="disqualified" className="h-2 w-2" /><h3 className="font-medium">Off-limits &amp; conflicts</h3><Pill tone="rose">hard block</Pill></div>
        <p className="mt-1 mb-3 text-sm text-[var(--color-muted)]">Categorically excluded regardless of fit — the client&rsquo;s own group, recent placements, active off-limits agreements.</p>
        <EditableChips items={ctx.offLimits} onChange={ctx.setOffLimits} tone="rose" placeholder="Add firm/rule…" />
      </Card>

      <Card className="mt-5 p-6">
        <h3 className="font-medium">Negative screen — &ldquo;what weak looks like&rdquo;</h3>
        <p className="mt-1 mb-3 text-sm text-[var(--color-muted)]">Decoration archetypes that look right and aren&rsquo;t. Toggle which to actively screen out.</p>
        <div className="space-y-2">
          {ctx.heuristics.map((h) => (
            <label key={h.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--color-line)] px-3.5 py-3 text-sm transition hover:bg-black/[.02]">
              <input type="checkbox" checked={h.enabled} onChange={(e) => ctx.setHeuristics(ctx.heuristics.map((x) => x.id === h.id ? { ...x, enabled: e.target.checked } : x))} className="h-4 w-4" />
              <span className={h.enabled ? "" : "text-[var(--color-faint)] line-through"}>{h.label}</span>
            </label>
          ))}
        </div>
      </Card>

      <details className="mt-5 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--color-muted)]">Generated Elasticsearch query</summary>
        <pre className="scroll-thin mt-3 max-h-72 overflow-auto rounded-xl bg-[var(--color-ink)] p-4 text-xs leading-relaxed text-[#e9e4d6]">{JSON.stringify(ctx.detail.query, null, 2)}</pre>
        <p className="mt-2 text-xs text-[var(--color-faint)]">In demo mode, chip edits are local; in live mode they rewrite this query before the pull.</p>
      </details>
    </>
  );
}

/* ----------------------------- S3.5 Pre-flight -------------------------- */

const STATUS: Record<string, { hex: string; glyph: string; label: string; tone: string }> = {
  pass: { hex: "#1f4d44", glyph: "✓", label: "pass", tone: "emerald" },
  warn: { hex: "#9d3a30", glyph: "!", label: "needs fix", tone: "rose" },
  info: { hex: "#9a6b1f", glyph: "i", label: "confirm", tone: "amber" },
};

export function PreflightStage({ ctx }: { ctx: Ctx }) {
  const [pf, setPf] = useState<Preflight | null>(null);
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  useEffect(() => { api.preflight(ctx.id).then(setPf); }, [ctx.id]);
  if (!pf) return <Empty msg="Analyzing filter…" />;

  const gained = pf.checks.reduce((a, c) => a + (applied[c.id] ? c.weight : 0), 0);
  const health = Math.min(pf.max_health, pf.health + gained);
  const openWarn = pf.checks.some((c) => c.status === "warn" && !applied[c.id]);
  const healthHex = health >= 88 ? "#1f4d44" : health >= 70 ? "#9a6b1f" : "#9d3a30";
  const passCount = pf.checks.filter((c) => c.status === "pass").length;

  return (
    <>
      <SectionTitle kicker="Setup · 04 — Pre-flight" title="Pressure-test the filter before you spend"
        sub="Every credit is a decision. Before the production pull, Jatayu audits the filter against known Coresignal data-quality patterns — flagging brittleness and confirming what's already sound. The Calibrate pull then verifies it on real data." />

      <Card className="mb-5 flex items-center gap-6 p-6">
        <div className="text-center">
          <p className="font-display text-[44px] leading-none tnum" style={{ color: healthHex }}>{health}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">filter health</p>
        </div>
        <div className="flex-1">
          <Bar value={health} color={healthHex} className="h-2.5" />
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {openWarn ? "An open issue could drop real candidates from a pool of only ~15–20. Apply the fix, or accept and verify on the calibration pull."
              : `${passCount} checks pass — the filter is recall-safe and looks production-ready. Calibrate to confirm on real data.`}
          </p>
        </div>
        {!openWarn && <Pill tone="emerald">production-ready</Pill>}
      </Card>

      <div className="space-y-2.5">
        {pf.checks.map((c) => {
          const st = STATUS[c.status];
          const done = applied[c.id];
          const actionable = !!c.fix && c.status !== "pass";
          return (
            <Card key={c.id} className={`p-5 transition ${done ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: done ? "#1f4d44" : st.hex }}>{done ? "✓" : st.glyph}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.title}</span>
                    <Pill tone={done ? "emerald" : st.tone}>{done ? "resolved" : st.label}</Pill>
                    <code className="rounded bg-black/[.04] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)]">{c.query_shape}</code>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted)]">{c.detail}</p>
                  {actionable && <p className="mt-2 text-sm"><span className="font-medium text-[var(--color-accent)]">Fix → </span>{c.fix}</p>}
                </div>
                {actionable && (
                  <button onClick={() => setApplied({ ...applied, [c.id]: !done })}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${done ? "bg-[#1f4d44]/12 text-[#1f4d44]" : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-ink)]"}`}>
                    {done ? "Applied ✓" : "Apply fix"}
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-[var(--color-faint)]">{pf.note} In demo mode, applying a fix is illustrative; in live mode it rewrites the query before the pull.</p>
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
      <SectionTitle kicker="Setup · 05 — Calibrate" title="Validate before you spend"
        sub="An expert pulls a handful of benchmark candidates and reads them first — confirming the spec and filters are right before committing the production budget. Mark each, then continue." />
      {!benches ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-7">
          <p className="max-w-md text-sm text-[var(--color-muted)]">Run a cheap calibration pull — one search plus a small sample. Costs roughly 9 of 300 credits.</p>
          <Button size="lg" onClick={ctx.runCalibrate} disabled={!!ctx.busy}>{ctx.busy === "calibrate" ? "Pulling…" : "Run calibration pull"}</Button>
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
                    <p className="truncate text-sm text-[var(--color-muted)]">{b.profile.current_title} · {b.profile.current_company}</p>
                  </div>
                  <div className="flex w-32 items-center gap-2">{b.score.disqualified ? <Pill tone="rose">DQ</Pill> : <><Bar value={b.score.fit_score} color={fitColor(b.score.fit_score)} /><span className="w-8 text-right text-sm font-semibold tnum">{b.score.fit_score}</span></>}</div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setVerdicts({ ...verdicts, [b.profile.coresignal_id]: "up" })} className={`rounded-lg px-2.5 py-1.5 text-sm transition ${v === "up" ? "bg-[#1f4d44]/12 text-[#1f4d44]" : "bg-black/[.04] text-[var(--color-faint)] hover:bg-black/[.08]"}`}>👍</button>
                    <button onClick={() => setVerdicts({ ...verdicts, [b.profile.coresignal_id]: "down" })} className={`rounded-lg px-2.5 py-1.5 text-sm transition ${v === "down" ? "bg-[#9d3a30]/12 text-[#9d3a30]" : "bg-black/[.04] text-[var(--color-faint)] hover:bg-black/[.08]"}`}>👎</button>
                  </div>
                </Card>
              );
            })}
          </div>
          {note && <Card className="mt-4 p-4 text-sm" ><span className="text-[var(--color-accent)]">✓ {note}</span></Card>}
          <div className="mt-5 flex justify-end">
            <Button variant="ghost" onClick={async () => { const r = await ctx.sendFeedback(verdicts); if (r) setNote(r.note); }} disabled={!Object.keys(verdicts).length}>Apply feedback to targeting</Button>
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
      <SectionTitle kicker="Setup · 06 — Source" title="Run the production longlist"
        sub="One production search plus collection of the refined universe → the raw longlist, with every profile scored on gates and weighted sub-scores. Every call is logged to the credit ledger." />
      <Card className="flex flex-wrap items-center justify-between gap-4 p-7">
        <div>
          <p className="max-w-md text-sm text-[var(--color-muted)]">{ctx.sourced ? "Longlist sourced and scored." : "Collect the production longlist and score every profile."}</p>
          {ctx.ranked && <p className="mt-1 text-sm font-medium">{ctx.ranked.candidates.length} profiles · {ctx.ranked.shortlist_size} pass the gates</p>}
        </div>
        {ctx.sourced ? <Button size="lg" onClick={() => ctx.go("longlist")}>Open longlist →</Button>
          : <Button size="lg" onClick={ctx.runSource} disabled={!!ctx.busy}>{ctx.busy === "source" ? "Sourcing + scoring…" : "Run production pull + score"}</Button>}
      </Card>
    </>
  );
}

/* ------------------------------ P1/P2 Longlist -------------------------- */

const TRIAGE_BTN: Record<string, string> = {
  accept: "bg-[#1f4d44]/12 text-[#1f4d44]", park: "bg-[#9a6b1f]/12 text-[#9a6b1f]", reject: "bg-[#9d3a30]/12 text-[#9d3a30]",
};

export function LonglistStage({ ctx }: { ctx: Ctx }) {
  const r = ctx.ranked;
  if (!r) return <Empty msg="Run Source first to build the longlist." />;
  const active = r.candidates.filter((c) => c.triage !== "reject");
  const rejected = r.candidates.filter((c) => c.triage === "reject");
  return (
    <>
      <SectionTitle kicker="Pipeline · Longlist" title={`${r.shortlist_size} candidates pass the gates`}
        sub="Triage the scored pool — accept, park, or reject. Rejections sink and re-rank the board. Click anyone to inspect the reasoning and override it." />
      <div className="space-y-2">{active.map((c) => <LongRow key={c.profile.coresignal_id} c={c} ctx={ctx} />)}</div>
      {rejected.length > 0 && (
        <>
          <p className="mt-7 mb-2"><Kicker>Rejected &amp; disqualified ({rejected.length})</Kicker></p>
          <div className="space-y-2 opacity-55">{rejected.map((c) => <LongRow key={c.profile.coresignal_id} c={c} ctx={ctx} />)}</div>
        </>
      )}
    </>
  );
}

function LongRow({ c, ctx }: { c: Candidate; ctx: Ctx }) {
  const s = c.score;
  return (
    <Card className="flex items-center gap-4 p-4 transition hover:shadow-pop">
      <span className="w-7 text-center text-sm font-semibold text-[var(--color-faint)] tnum">{c.rank ? c.rank : "—"}</span>
      <button onClick={() => ctx.openCandidate(c)} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2"><span className="font-medium hover:underline">{c.profile.name}</span><TierBadge tier={c.profile.current_firm_tier} />{s.overridden && <Pill tone="indigo">overridden</Pill>}</div>
        <p className="truncate text-sm text-[var(--color-muted)]">{c.profile.current_title} · {c.profile.current_company}</p>
      </button>
      <div className="flex w-36 items-center gap-2">
        {s.disqualified ? <span className="text-sm font-medium text-[#9d3a30]">DQ · {s.failed_gates.join(", ")}</span>
          : <><Bar value={s.fit_score} color={fitColor(s.fit_score)} /><span className="w-8 text-right text-sm font-semibold tnum">{s.fit_score}</span></>}
      </div>
      <div className="flex gap-1">
        {["accept", "park", "reject"].map((v) => (
          <button key={v} onClick={() => ctx.doTriage(c.profile.coresignal_id, c.triage === v ? "none" : v)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition ${c.triage === v ? TRIAGE_BTN[v] : "bg-black/[.04] text-[var(--color-faint)] hover:bg-black/[.08]"}`}>{v}</button>
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
        sub="Not a ranked dump — a landscape. Direct fits, strong adjacents, stretch options, wildcards; each with the context a client needs to read the rank." />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {sl.bands.filter((b) => b.candidates.length).map((b) => (
            <div key={b.band}>
              <div className="mb-2.5 flex items-center gap-2"><Pill tone={BAND_TONE[b.band]}>{b.band}</Pill><span className="text-xs text-[var(--color-faint)]">{b.candidates.length}</span></div>
              <div className="space-y-2">
                {b.candidates.map((c) => (
                  <Card key={c.profile.coresignal_id} className="p-5 transition hover:shadow-pop">
                    <button onClick={() => ctx.openCandidate(c)} className="w-full text-left">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><span className="font-medium hover:underline">{c.profile.name}</span><TierBadge tier={c.profile.current_firm_tier} /></div>
                        <span className="font-display text-xl tnum">{c.score.fit_score}</span>
                      </div>
                      <p className="text-sm text-[var(--color-muted)]">{c.profile.current_title} · {c.profile.current_company}</p>
                      <p className="mt-2 text-sm leading-relaxed">{c.score.rationale}</p>
                      {c.score.concerns_or_flags && <p className="mt-1.5 text-xs text-[#9a6b1f]">⚑ {c.score.concerns_or_flags}</p>}
                    </button>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div>
          <Card className="sticky top-32 p-5">
            <Kicker>Balanced-slate diagnostic</Kicker>
            <p className="font-display mt-1.5 text-2xl tnum">{sl.slate.size}<span className="text-base text-[var(--color-faint)]"> candidates</span></p>
            <Diag label="By band" data={sl.slate.band_counts} />
            <Diag label="Firm tier spread" data={sl.slate.firm_tier_spread} />
            <Diag label="Confidence" data={sl.slate.confidence_spread} />
            <p className="mt-4 rounded-lg bg-[#9a6b1f]/8 p-2.5 text-xs text-[#7a5418]">⚑ {sl.slate.diversity_note}</p>
          </Card>
        </div>
      </div>
    </>
  );
}

function Diag({ label, data }: { label: string; data: Record<string, number> }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-[var(--color-faint)]">{label}</p>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="mt-1 flex items-center justify-between text-sm"><span className="capitalize text-[var(--color-muted)]">{k}</span><span className="tnum">{v}</span></div>
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
        sub="Each candidate carries a status from first contact to offer. Advance them as the search progresses — this is what powers the client status report." />
      <div className="space-y-3">
        {shortlisted.map((c) => {
          const cur = STATUS_FLOW.indexOf(c.status || "sourced");
          return (
            <Card key={c.profile.coresignal_id} className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="font-medium">{c.profile.name}</span><TierBadge tier={c.profile.current_firm_tier} /><span className="text-sm text-[var(--color-muted)]">· {c.profile.current_company}</span></div>
                <Pill tone="indigo">{(c.status || "sourced").replace("_", " ")}</Pill>
              </div>
              <div className="mt-3.5 flex flex-wrap items-center gap-1">
                {STATUS_FLOW.map((st, i) => (
                  <span key={st} className="flex items-center gap-1">
                    <button onClick={() => ctx.doStatus(c.profile.coresignal_id, st)}
                      className={`rounded-md px-2.5 py-1 text-[11px] capitalize transition ${i <= cur ? "bg-[var(--color-accent)] text-white" : "bg-black/[.04] text-[var(--color-faint)] hover:bg-black/[.08]"}`}>{st.replace("_", " ")}</button>
                    {i < STATUS_FLOW.length - 1 && <span className="h-px w-2.5" style={{ backgroundColor: i < cur ? "var(--color-accent)" : "var(--color-line-strong)" }} />}
                  </span>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
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
      <Card className="p-8">
        <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-5">
          <div><Kicker>Mandate</Kicker><h3 className="font-display text-[28px]">{rep.mandate}</h3></div>
          <Pill tone="indigo">confidential</Pill>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Longlist" value={rep.pool.longlist} />
          <Stat label="Shortlist" value={rep.pool.shortlist} />
          <Stat label="Disqualified" value={rep.pool.disqualified} />
          <Stat label="Credits used" value={rep.credits_spent} sub={`of ${ctx.credits?.cap ?? 300}`} />
        </div>
        <div className="mt-7">
          <Kicker>Shortlist by band</Kicker>
          <div className="mt-3 space-y-4">
            {rep.shortlist.bands.filter((b) => b.candidates.length).map((b) => (
              <div key={b.band}>
                <Pill tone={BAND_TONE[b.band]}>{b.band}</Pill>
                <ul className="mt-2 space-y-1.5">
                  {b.candidates.map((c) => (
                    <li key={c.profile.coresignal_id} className="flex items-baseline justify-between border-b border-dashed border-[var(--color-line)] pb-1.5 text-sm">
                      <span><b>{c.profile.name}</b> — {c.profile.current_title}, {c.profile.current_company}</span>
                      <span className="tnum text-[var(--color-muted)]">{c.score.fit_score} · {(c.status || "sourced").replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-7">
          <Kicker>Pipeline status</Kicker>
          <div className="mt-2 flex flex-wrap gap-2">{Object.entries(rep.pipeline_status).map(([k, v]) => <Pill key={k}>{k.replace("_", " ")}: {v}</Pill>)}</div>
        </div>
      </Card>
    </>
  );
}

function Empty({ msg }: { msg: string }) {
  return <Card className="p-12 text-center text-sm text-[var(--color-faint)]">{msg}</Card>;
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
    <div className="fixed inset-0 z-30 flex justify-end bg-[var(--color-ink)]/30 backdrop-blur-sm" onClick={onClose}>
      <div className="scroll-thin h-full w-full max-w-xl overflow-y-auto bg-[var(--color-canvas)] p-7 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2"><h2 className="font-display text-[26px]">{p.name}</h2><TierBadge tier={p.current_firm_tier} /></div>
            <p className="text-sm text-[var(--color-muted)]">{p.current_title} · {p.current_company} · {p.location_country}</p>
            <p className="text-xs text-[var(--color-faint)]">{p.years_relevant_experience}y relevant / {p.years_total_experience}y total</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-[var(--color-faint)] hover:bg-black/[.06]">✕</button>
        </div>

        <div className="mt-5 flex items-center gap-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-raised)] p-4">
          <div className="font-display text-[40px] leading-none tnum">{s.fit_score}</div>
          <div className="text-xs text-[var(--color-muted)]">fit score{s.disqualified && <span className="ml-1 font-semibold text-[#9d3a30]">· DISQUALIFIED</span>}<div>ungated {s.ungated_fit} · confidence {s.confidence}{s.overridden && " · overridden"}</div></div>
        </div>

        {s.rationale && <p className="mt-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-raised)] p-4 text-sm">{s.rationale}</p>}
        {s.concerns_or_flags && <p className="mt-2 rounded-xl bg-[#9a6b1f]/8 p-3 text-sm text-[#7a5418]">⚑ {s.concerns_or_flags}</p>}

        <p className="mt-6"><Kicker>Career — read firm types, not titles</Kicker></p>
        <div className="mt-2 space-y-2">
          {p.experiences.map((e, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-raised)] p-3.5 text-sm">
              <span className="h-9 w-1 rounded-full" style={{ backgroundColor: TIER_HEX[e.tier] }} />
              <div className="min-w-0 flex-1"><p className="font-medium">{e.title} <span className="font-normal text-[var(--color-muted)]">@ {e.company}</span></p><p className="text-xs text-[var(--color-faint)]">{e.firm_label} · {e.industry || "industry n/a"} · {e.size ? `${e.size} emp` : "size n/a"} · {e.period}</p></div>
              <TierBadge tier={e.tier} />
            </div>
          ))}
        </div>

        <p className="mt-6"><Kicker>Gates — override path</Kicker></p>
        <div className="mt-2 space-y-2">
          {s.gates.map((g) => (
            <label key={g.id} className="flex items-start gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-raised)] p-3.5 text-sm">
              <input type="checkbox" checked={gates[g.id]} onChange={(e) => setGates({ ...gates, [g.id]: e.target.checked })} className="mt-0.5 h-4 w-4" />
              <span><span className="font-medium">{g.id}</span> {g.hard ? <Pill tone="rose">hard</Pill> : <Pill>soft</Pill>}<span className={`ml-2 ${gates[g.id] ? "text-[#1f4d44]" : "text-[#9d3a30]"}`}>{gates[g.id] ? "pass" : "fail"}</span><p className="mt-0.5 text-xs text-[var(--color-faint)]">{g.description}</p></span>
            </label>
          ))}
        </div>

        <p className="mt-6"><Kicker>Sub-scores — adjust &amp; recompute</Kicker></p>
        <div className="mt-2 space-y-3.5">
          {s.sub_scores.map((x) => (
            <div key={x.id}>
              <div className="flex items-center justify-between text-sm"><span>{x.label} <span className="text-xs text-[var(--color-faint)]">w={x.weight}</span></span><span className="font-semibold tnum">{subs[x.id]}</span></div>
              <input type="range" min={0} max={100} value={subs[x.id]} onChange={(e) => setSubs({ ...subs, [x.id]: Number(e.target.value) })} className="mt-1 w-full" />
              {x.reason && <p className="text-xs text-[var(--color-faint)]">{x.reason}</p>}
            </div>
          ))}
        </div>

        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Override note (e.g. 'AM exp confirmed on call')" className="mt-5 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-raised)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]" />
        <Button onClick={recompute} disabled={busy} className="mt-3 w-full">{busy ? "Recomputing…" : "Recompute fit (deterministic)"}</Button>
      </div>
    </div>
  );
}
