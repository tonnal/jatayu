"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Card, Bar, TierBadge, Pill, TIER_COLOR, fitColor } from "@/components/ui";
import {
  api, MandateDetail, Credits, DevResult, Ranked, Candidate, Profile, Score,
} from "@/lib/api";

type Stage = "sourcing" | "production" | "ranking";
const TIER_ORDER = ["core", "adjacent", "weak", "disqualified", "none"];

export default function Workspace() {
  const id = String(useParams().id);
  const [m, setM] = useState<MandateDetail | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [stage, setStage] = useState<Stage>("sourcing");
  const [dev, setDev] = useState<DevResult | null>(null);
  const [prod, setProd] = useState<{ count: number; tier_distribution: Record<string, number> } | null>(null);
  const [ranked, setRanked] = useState<Ranked | null>(null);
  const [sel, setSel] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.mandate(id).then(setM);
    api.credits(id).then(setCredits);
  }, [id]);
  useEffect(() => { refresh(); }, [refresh]);

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind); try { await fn(); } finally { setBusy(null); }
  }
  const doDev = () => run("dev", async () => {
    const r = await api.devPull(id, 8); setDev(r.result); setCredits(r.credits);
  });
  const doProd = () => run("prod", async () => {
    const r = await api.productionPull(id); setProd(r.result); setCredits(r.credits); setStage("production");
  });
  const doScore = () => run("score", async () => {
    const r = await api.score(id); setRanked(r.result); setCredits(r.credits); setStage("ranking");
  });
  const reset = () => run("reset", async () => {
    await api.reset(id); setDev(null); setProd(null); setRanked(null); setSel(null); setStage("sourcing"); refresh();
  });

  if (!m) return <><TopBar /><div className="p-10 text-zinc-500">Loading… (is the API on :8000?)</div></>;

  return (
    <>
      <TopBar live={m.live_available} />
      <div className="mx-auto grid max-w-7xl grid-cols-[230px_1fr] gap-6 px-6 py-6">
        {/* left rail */}
        <aside className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Mandate</p>
            <h1 className="mt-1 text-[15px] font-semibold leading-snug">{m.name}</h1>
          </div>
          <CreditMeter c={credits} />
          <Funnel stage={stage} hasDev={!!dev} hasProd={!!prod} hasRank={!!ranked} onJump={(s) => setStage(s)} />
          <button onClick={reset} className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50">Reset run</button>
        </aside>

        {/* main */}
        <main className="min-w-0 space-y-6">
          {stage === "sourcing" && <Sourcing m={m} dev={dev} busy={busy} onDev={doDev} onProd={doProd} />}
          {stage === "production" && <Production prod={prod} busy={busy} onScore={doScore} />}
          {stage === "ranking" && ranked && <Ranking ranked={ranked} onSelect={setSel} />}
        </main>
      </div>

      {sel && <Drawer id={id} c={sel} onClose={() => setSel(null)} onRanked={(r) => {
        setRanked(r);
        const found = r.candidates.find((x) => x.profile.coresignal_id === sel.profile.coresignal_id);
        if (found) setSel(found);
      }} />}
    </>
  );
}

function CreditMeter({ c }: { c: Credits | null }) {
  if (!c) return null;
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Credit meter</span>
        <span className="text-xs text-zinc-400">{c.remaining} left</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{c.spent}<span className="text-base text-zinc-400">/{c.cap}</span></p>
      <Bar value={c.spent} max={c.cap} color="bg-indigo-500" className="mt-2" />
      <div className="mt-2 flex gap-3 text-xs text-zinc-500">
        <span>dev <b className="text-zinc-700">{c.dev}</b></span>
        <span>prod <b className="text-zinc-700">{c.production}</b></span>
      </div>
    </Card>
  );
}

function Funnel({ stage, hasDev, hasProd, hasRank, onJump }: {
  stage: Stage; hasDev: boolean; hasProd: boolean; hasRank: boolean; onJump: (s: Stage) => void;
}) {
  const steps: { key: Stage; label: string; done: boolean; enabled: boolean }[] = [
    { key: "sourcing", label: "Sourcing & filter", done: hasDev, enabled: true },
    { key: "production", label: "Production pull", done: hasProd, enabled: hasProd },
    { key: "ranking", label: "Ranking & review", done: hasRank, enabled: hasRank },
  ];
  return (
    <Card className="p-2">
      {steps.map((s) => (
        <button key={s.key} disabled={!s.enabled} onClick={() => onJump(s.key)}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${stage === s.key ? "bg-indigo-50 text-indigo-700" : s.enabled ? "text-zinc-700 hover:bg-zinc-50" : "text-zinc-300"}`}>
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${s.done ? "bg-emerald-500 text-white" : stage === s.key ? "bg-indigo-600 text-white" : "bg-zinc-200 text-zinc-500"}`}>{s.done ? "✓" : ""}</span>
          {s.label}
        </button>
      ))}
    </Card>
  );
}

function TierDist({ dist, total }: { dist: Record<string, number>; total: number }) {
  return (
    <div className="space-y-1.5">
      {TIER_ORDER.filter((t) => dist[t]).map((t) => (
        <div key={t} className="flex items-center gap-3 text-sm">
          <span className="w-24 capitalize text-zinc-600">{t}</span>
          <div className="flex-1"><Bar value={dist[t]} max={total} color={TIER_COLOR[t]} /></div>
          <span className="w-8 text-right tabular-nums text-zinc-500">{dist[t]}</span>
        </div>
      ))}
    </div>
  );
}

function Sourcing({ m, dev, busy, onDev, onProd }: {
  m: MandateDetail; dev: DevResult | null; busy: string | null; onDev: () => void; onProd: () => void;
}) {
  const s = m.sourcing;
  const ec = s.employee_count;
  const total = dev ? dev.sampled : 0;
  return (
    <>
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Sourcing console</h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">Filter leads with <b>firm attributes</b>, not titles. Iterate cheaply (search = 1 credit) before spending the collect budget.</p>
          </div>
          <button onClick={onDev} disabled={!!busy}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
            {busy === "dev" ? "Running…" : "Run dev pull (≈9 cr)"}
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Location">{s.location_countries.map((c) => <Pill key={c}>{c}</Pill>)}</Field>
          <Field label="Firm size (employees)">
            {ec ? <Pill tone="indigo">{ec.gte ?? 0}–{ec.lte ?? "∞"}</Pill> : <span className="text-sm text-zinc-400">no size filter (size is not a fit signal here)</span>}
          </Field>
          <Field label="Industries (firm-attribute filter)"><div className="flex flex-wrap gap-1.5">{s.industries_any.map((i) => <Pill key={i} tone="emerald">{i}</Pill>)}</div></Field>
          <Field label="Title keywords (applied last)"><div className="flex flex-wrap gap-1.5">{s.title_keywords_any.map((t) => <Pill key={t}>{t}</Pill>)}</div></Field>
          <Field label="Exclusions (must-not)"><div className="flex flex-wrap gap-1.5">{[...s.exclusions.company_keywords_none, ...s.exclusions.industries_none, ...s.exclusions.title_keywords_none].map((e) => <Pill key={e} tone="rose">{e}</Pill>)}</div></Field>
          <Field label="Gates (hard disqualifiers)"><div className="flex flex-wrap gap-1.5">{m.gates.map((g) => <Pill key={g.id} tone={g.hard ? "rose" : "zinc"}>{g.id}{g.hard ? "" : " (soft)"}</Pill>)}</div></Field>
        </div>

        <details className="mt-5 rounded-lg bg-zinc-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-zinc-600">Generated Elasticsearch query</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-zinc-900 p-3 text-xs text-zinc-100">{JSON.stringify(m.query, null, 2)}</pre>
        </details>
      </Card>

      {dev && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Filter validation — firm-tier precision</h3>
            <span className="text-sm">core+adjacent: <b className={dev.precision_estimate >= 0.5 ? "text-emerald-600" : "text-amber-600"}>{Math.round(dev.precision_estimate * 100)}%</b> of sample</span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">Search returned {dev.n_ids} ids; inspected a {dev.sampled}-profile sample. Tune the filter here before the production pull.</p>
          <div className="mt-4"><TierDist dist={dev.tier_distribution} total={total} /></div>
          <div className="mt-5 overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
                <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Current firm</th><th className="px-3 py-2">Tier</th><th className="px-3 py-2">Yrs</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {dev.sample.map((p) => (
                  <tr key={p.coresignal_id}>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-zinc-600">{p.current_company}</td>
                    <td className="px-3 py-2"><TierBadge tier={p.current_firm_tier} /></td>
                    <td className="px-3 py-2 tabular-nums text-zinc-600">{p.years_relevant_experience}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex justify-end">
            <button onClick={onProd} disabled={!!busy} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
              {busy === "prod" ? "Pulling…" : "Filter looks good → run production pull"}
            </button>
          </div>
        </Card>
      )}
    </>
  );
}

function Production({ prod, busy, onScore }: { prod: { count: number; tier_distribution: Record<string, number> } | null; busy: string | null; onScore: () => void }) {
  if (!prod) return null;
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Production pull complete</h2>
      <p className="mt-1 text-sm text-zinc-600">{prod.count} profiles collected into the raw pull (exported to <span className="font-mono text-xs">data/output/</span>). This CSV is what filter precision is audited against.</p>
      <div className="mt-4 max-w-md"><TierDist dist={prod.tier_distribution} total={prod.count} /></div>
      <div className="mt-5"><button onClick={onScore} disabled={!!busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">{busy === "score" ? "Scoring…" : "Run gated scoring →"}</button></div>
    </Card>
  );
}

function Ranking({ ranked, onSelect }: { ranked: Ranked; onSelect: (c: Candidate) => void }) {
  const shortlisted = ranked.candidates.filter((c) => !c.score.disqualified);
  const dq = ranked.candidates.filter((c) => c.score.disqualified);
  return (
    <>
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Ranked shortlist <span className="text-zinc-400">({ranked.shortlist_size})</span></h2>
        <p className="mt-1 text-sm text-zinc-600">Click a candidate to see sub-scores, gates, rationale — and to override.</p>
        <div className="mt-4 space-y-2">
          {shortlisted.map((c) => <Row key={c.profile.coresignal_id} c={c} onSelect={onSelect} />)}
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="font-semibold text-zinc-700">Disqualified by gates <span className="text-zinc-400">({dq.length})</span></h3>
        <p className="mt-1 text-sm text-zinc-500">Surfaced for transparency — a recruiter can override a gate if the data was wrong.</p>
        <div className="mt-3 space-y-2">{dq.map((c) => <Row key={c.profile.coresignal_id} c={c} onSelect={onSelect} />)}</div>
      </Card>
    </>
  );
}

function Row({ c, onSelect }: { c: Candidate; onSelect: (c: Candidate) => void }) {
  const s = c.score;
  return (
    <button onClick={() => onSelect(c)} className="flex w-full items-center gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left hover:border-indigo-300 hover:shadow-sm">
      <span className="w-8 text-center text-sm font-semibold text-zinc-400">{c.rank ? `#${c.rank}` : "—"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{c.profile.name}</span>
          <TierBadge tier={c.profile.current_firm_tier} />
          {s.overridden && <Pill tone="indigo">overridden</Pill>}
        </div>
        <p className="truncate text-sm text-zinc-500">{c.profile.current_title} · {c.profile.current_company}</p>
      </div>
      <div className="w-40">
        {s.disqualified
          ? <span className="text-sm font-medium text-rose-600">DQ · {s.failed_gates.join(", ")}</span>
          : <div className="flex items-center gap-2"><Bar value={s.fit_score} color={fitColor(s.fit_score, false)} /><span className="w-10 text-right text-sm font-semibold tabular-nums">{s.fit_score}</span></div>}
      </div>
      <span className={`w-16 text-right text-xs ${s.confidence === "high" ? "text-emerald-600" : s.confidence === "low" ? "text-amber-600" : "text-zinc-400"}`}>{s.confidence}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</p><div className="mt-1.5 flex flex-wrap items-center gap-1.5">{children}</div></div>;
}

// ---- candidate drawer with recruiter override ----
function Drawer({ id, c, onClose, onRanked }: { id: string; c: Candidate; onClose: () => void; onRanked: (r: Ranked) => void }) {
  const [subs, setSubs] = useState<Record<string, number>>(() =>
    Object.fromEntries(c.score.sub_scores.map((s) => [s.id, s.value ?? 0])));
  const [gates, setGates] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(c.score.gates.map((g) => [g.id, g.passed])));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const p = c.profile, s = c.score;

  useEffect(() => {
    setSubs(Object.fromEntries(s.sub_scores.map((x) => [x.id, x.value ?? 0])));
    setGates(Object.fromEntries(s.gates.map((g) => [g.id, g.passed])));
  }, [c.profile.coresignal_id]); // eslint-disable-line

  async function recompute() {
    setBusy(true);
    try {
      const subOv: Record<string, number> = {}, gateOv: Record<string, boolean> = {};
      s.sub_scores.forEach((x) => { if (subs[x.id] !== (x.value ?? 0)) subOv[x.id] = subs[x.id]; });
      s.gates.forEach((g) => { if (gates[g.id] !== g.passed) gateOv[g.id] = gates[g.id]; });
      const r = await api.override(id, p.coresignal_id, { sub_overrides: subOv, gate_overrides: gateOv, note });
      onRanked(r);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-zinc-900/30" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <TierBadge tier={p.current_firm_tier} />
            </div>
            <p className="text-sm text-zinc-500">{p.current_title} · {p.current_company} · {p.location_country}</p>
            <p className="text-xs text-zinc-400">{p.years_relevant_experience}y relevant / {p.years_total_experience}y total · {p.linkedin_url}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100">✕</button>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-lg bg-zinc-50 p-4">
          <div className="text-3xl font-bold tabular-nums">{s.fit_score}</div>
          <div className="text-xs text-zinc-500">
            fit score{s.disqualified && <span className="ml-1 font-medium text-rose-600">· DISQUALIFIED</span>}
            <div>ungated: {s.ungated_fit} · confidence: {s.confidence}{s.overridden && " · overridden"}</div>
          </div>
        </div>

        {s.rationale && <p className="mt-4 rounded-lg border border-zinc-200 p-3 text-sm text-zinc-700">{s.rationale}</p>}
        {s.concerns_or_flags && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">⚑ {s.concerns_or_flags}</p>}

        {/* career history */}
        <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-zinc-500">Career (read firm types)</h3>
        <div className="mt-2 space-y-2">
          {p.experiences.map((e, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 text-sm">
              <span className={`h-8 w-1 rounded-full ${TIER_COLOR[e.tier]}`} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{e.title} <span className="font-normal text-zinc-500">@ {e.company}</span></p>
                <p className="text-xs text-zinc-400">{e.firm_label} · {e.industry || "industry n/a"} · {e.size ? `${e.size} emp` : "size n/a"} · {e.period}</p>
              </div>
              <TierBadge tier={e.tier} />
            </div>
          ))}
        </div>

        {/* override: gates */}
        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Gates — override path</h3>
        <div className="mt-2 space-y-2">
          {s.gates.map((g) => (
            <label key={g.id} className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 text-sm">
              <input type="checkbox" checked={gates[g.id]} onChange={(e) => setGates({ ...gates, [g.id]: e.target.checked })} className="mt-0.5 h-4 w-4" />
              <span>
                <span className="font-medium">{g.id}</span> {g.hard ? <Pill tone="rose">hard</Pill> : <Pill>soft</Pill>}
                <span className={`ml-2 ${gates[g.id] ? "text-emerald-600" : "text-rose-600"}`}>{gates[g.id] ? "pass" : "fail"}</span>
                <p className="mt-0.5 text-xs text-zinc-400">{g.description}</p>
              </span>
            </label>
          ))}
        </div>

        {/* override: sub-scores */}
        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Sub-scores — adjust & recompute</h3>
        <div className="mt-2 space-y-3">
          {s.sub_scores.map((x) => (
            <div key={x.id}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-700">{x.label} <span className="text-xs text-zinc-400">w={x.weight}</span></span>
                <span className="tabular-nums font-medium">{subs[x.id]}</span>
              </div>
              <input type="range" min={0} max={100} value={subs[x.id]} onChange={(e) => setSubs({ ...subs, [x.id]: Number(e.target.value) })} className="w-full accent-indigo-600" />
              {x.reason && <p className="text-xs text-zinc-400">{x.reason}</p>}
            </div>
          ))}
        </div>

        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Override note (e.g. 'AM exp confirmed on call')"
          className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <button onClick={recompute} disabled={busy} className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
          {busy ? "Recomputing…" : "Recompute fit (deterministic)"}
        </button>
      </div>
    </div>
  );
}
