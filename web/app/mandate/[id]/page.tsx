"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, MandateDetail, Credits, Candidate, Ranked, ShortlistResp, ClientReport, NegHeuristic } from "@/lib/api";
import { Ctx, StageKey } from "@/lib/workflow";
import { Button, Bar } from "@/components/ui";
import {
  BriefStage, MarketStage, TargetingStage, CalibrateStage, SourceStage,
  LonglistStage, ShortlistStage, EngagementStage, ReportStage, CandidateDrawer,
} from "@/components/stages";

type Step = { key: StageKey; label: string; phase: "Setup" | "Pipeline" };
const STEPS: Step[] = [
  { key: "brief", label: "Brief", phase: "Setup" },
  { key: "market", label: "Market Map", phase: "Setup" },
  { key: "targeting", label: "Targeting", phase: "Setup" },
  { key: "calibrate", label: "Calibrate", phase: "Setup" },
  { key: "source", label: "Source", phase: "Setup" },
  { key: "longlist", label: "Longlist", phase: "Pipeline" },
  { key: "shortlist", label: "Shortlist", phase: "Pipeline" },
  { key: "engagement", label: "Engagement", phase: "Pipeline" },
  { key: "report", label: "Report", phase: "Pipeline" },
];

export default function Workspace() {
  const id = String(useParams().id);
  const [detail, setDetail] = useState<MandateDetail | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [heuristics, setHeuristics] = useState<NegHeuristic[]>([]);
  const [offLimits, setOffLimits] = useState<string[]>([]);
  const [calibration, setCalibration] = useState<Candidate[] | null>(null);
  const [ranked, setRanked] = useState<Ranked | null>(null);
  const [shortlist, setShortlist] = useState<ShortlistResp | null>(null);
  const [report, setReport] = useState<ClientReport | null>(null);
  const [sel, setSel] = useState<Candidate | null>(null);
  const sourced = !!ranked;
  const stage = STEPS[idx].key;

  const refresh = useCallback(() => {
    api.mandate(id).then((d) => { setDetail(d); setHeuristics(d.negative_heuristics); setOffLimits(d.off_limits); });
    api.credits(id).then(setCredits);
  }, [id]);
  useEffect(() => { refresh(); }, [refresh]);

  async function run(tag: string, fn: () => Promise<void>) { setBusy(tag); try { await fn(); } finally { setBusy(null); } }

  const goKey = useCallback((s: StageKey) => {
    const i = STEPS.findIndex((x) => x.key === s);
    if (i >= 0) setIdx(i);
    if (s === "shortlist") api.shortlist(id).then(setShortlist);
    if (s === "report") api.report(id).then(setReport);
    if (s === "longlist") api.candidates(id).then((r) => r.candidates.length && setRanked(r));
  }, [id]);

  const runCalibrate = () => run("calibrate", async () => { const r = await api.calibrate(id, 8); setCalibration(r.result.benchmarks); setCredits(r.credits); });
  const sendFeedback = async (v: Record<string, string>) => { const r = await api.calibrateFeedback(id, v); return { note: r.note }; };
  const runSource = () => run("source", async () => {
    const pr = await api.productionPull(id); setCredits(pr.credits);
    const sr = await api.score(id); setRanked(sr.result); setCredits(sr.credits);
    goKey("longlist");
  });
  const doTriage = (cid: string, v: string) => run("triage", async () => setRanked(await api.triage(id, cid, v)));
  const doStatus = (cid: string, s: string) => run("status", async () => { await api.setStatus(id, cid, s); setRanked(await api.candidates(id)); });
  const reset = () => run("reset", async () => { await api.reset(id); setCalibration(null); setRanked(null); setShortlist(null); setReport(null); setSel(null); setIdx(0); refresh(); });

  // forward nav: Source requires running first; pipeline auto-loads.
  const isLast = idx === STEPS.length - 1;
  const blockedAtSource = stage === "source" && !sourced;
  const canContinue = !isLast && !blockedAtSource && !(STEPS[idx + 1]?.phase === "Pipeline" && !sourced);
  const next = () => { if (idx < STEPS.length - 1) goKey(STEPS[idx + 1].key); };
  const back = () => { if (idx > 0) goKey(STEPS[idx - 1].key); };

  // Enter advances (unless typing in a field — those use ⌘/Ctrl+Enter handled in-stage)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(t?.tagName);
      if (e.key === "Enter" && !typing && !sel && canContinue) { e.preventDefault(); next(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }); // eslint-disable-line

  if (!detail) return <Loading />;

  const ctx: Ctx = {
    id, detail, credits, busy, heuristics, setHeuristics, offLimits, setOffLimits,
    calibration, ranked, shortlist, report, go: goKey, runCalibrate, sendFeedback, runSource,
    doTriage, doStatus, openCandidate: setSel, sourced,
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-canvas)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-4 px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-ink)] font-display text-base text-[var(--color-canvas)]">J</span>
            <span className="font-display text-lg tracking-tight">Jatayu</span>
          </Link>
          <span className="hidden truncate text-sm text-[var(--color-muted)] sm:block">/ {detail.name}</span>
          <div className="ml-auto flex items-center gap-4">
            {credits && (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-xs text-[var(--color-faint)]">credits</span>
                <span className="font-display text-sm tnum">{credits.spent}<span className="text-[var(--color-faint)]">/{credits.cap}</span></span>
                <div className="w-20"><Bar value={credits.spent} max={credits.cap} /></div>
              </div>
            )}
            <Link href="/outreach" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">BD Outreach</Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#9a6b1f]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#9a6b1f] ring-1 ring-inset ring-[#9a6b1f]/20">
              <span className="h-1.5 w-1.5 rounded-full bg-[#9a6b1f]" />{detail.live_available ? "Live" : "Demo"}
            </span>
          </div>
        </div>
        <Stepper steps={STEPS} idx={idx} sourced={sourced} onJump={(i) => goKey(STEPS[i].key)} />
      </header>

      {/* one focused step at a time */}
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-6 py-12">
        <div key={stage} className="step-in">
          {stage === "brief" && <BriefStage ctx={ctx} />}
          {stage === "market" && <MarketStage ctx={ctx} />}
          {stage === "targeting" && <TargetingStage ctx={ctx} />}
          {stage === "calibrate" && <CalibrateStage ctx={ctx} />}
          {stage === "source" && <SourceStage ctx={ctx} />}
          {stage === "longlist" && <LonglistStage ctx={ctx} />}
          {stage === "shortlist" && <ShortlistStage ctx={ctx} />}
          {stage === "engagement" && <EngagementStage ctx={ctx} />}
          {stage === "report" && <ReportStage ctx={ctx} />}
        </div>
      </main>

      {/* footer nav */}
      <footer className="sticky bottom-0 z-10 border-t border-[var(--color-line)] bg-[var(--color-canvas)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-6 py-3.5">
          <button onClick={back} disabled={idx === 0} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-30">← Back</button>
          <div className="flex items-center gap-3">
            <button onClick={reset} className="text-xs text-[var(--color-faint)] hover:text-[var(--color-muted)]">Reset</button>
            {!isLast && (
              <Button onClick={next} disabled={!canContinue} size="lg">
                Continue <span className="opacity-60">·</span> {STEPS[idx + 1].label}
                <kbd className="ml-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-normal">↵</kbd>
              </Button>
            )}
            {isLast && <span className="text-sm text-[var(--color-muted)]">Search complete</span>}
          </div>
        </div>
      </footer>

      {sel && <CandidateDrawer id={id} c={sel} onClose={() => setSel(null)} onRanked={(r) => {
        setRanked(r);
        const f = r.candidates.find((x) => x.profile.coresignal_id === sel.profile.coresignal_id);
        if (f) setSel(f);
      }} />}
    </div>
  );
}

function Stepper({ steps, idx, sourced, onJump }: { steps: Step[]; idx: number; sourced: boolean; onJump: (i: number) => void }) {
  return (
    <div className="border-t border-[var(--color-line)]/60">
      <div className="scroll-thin mx-auto flex max-w-[1180px] items-center gap-1 overflow-x-auto px-6 py-2.5">
        {steps.map((s, i) => {
          const active = i === idx;
          const done = i < idx;
          const locked = s.phase === "Pipeline" && !sourced;
          const showDivider = i > 0 && steps[i - 1].phase !== s.phase;
          return (
            <div key={s.key} className="flex items-center">
              {showDivider && <span className="mx-2 hidden h-4 w-px bg-[var(--color-line-strong)] sm:block" />}
              <button onClick={() => !locked && onJump(i)} disabled={locked}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[13px] transition ${active ? "bg-[var(--color-accent)] text-white" : locked ? "text-[var(--color-faint)]/50" : done ? "text-[var(--color-ink)] hover:bg-black/[.04]" : "text-[var(--color-muted)] hover:bg-black/[.04]"}`}>
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${active ? "bg-white/25 text-white" : done ? "bg-[var(--color-accent)] text-white" : "bg-black/[.07] text-[var(--color-faint)]"}`}>{done ? "✓" : i + 1}</span>
                {s.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Loading() {
  return <div className="flex min-h-screen items-center justify-center text-sm text-[var(--color-faint)]">Loading workspace… (is the API on :8000?)</div>;
}
