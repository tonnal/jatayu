"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { Card, Button, Pill, TierBadge, Bar, Stat, SectionTitle, Kicker, TIER_COLOR, fitColor } from "@/components/ui";
import { api, MandateDetail, Credits, Candidate, Ranked, ShortlistResp, ClientReport, NegHeuristic } from "@/lib/api";
import { Ctx, StageKey } from "@/lib/workflow";
import {
  BriefStage, MarketStage, TargetingStage, CalibrateStage, SourceStage,
  LonglistStage, ShortlistStage, EngagementStage, ReportStage, CandidateDrawer,
} from "@/components/stages";

const SETUP: { key: StageKey; label: string }[] = [
  { key: "brief", label: "Brief" }, { key: "market", label: "Market Map" },
  { key: "targeting", label: "Targeting" }, { key: "calibrate", label: "Calibrate" },
  { key: "source", label: "Source" },
];
const PIPELINE: { key: StageKey; label: string }[] = [
  { key: "longlist", label: "Longlist" }, { key: "shortlist", label: "Shortlist" },
  { key: "engagement", label: "Engagement" }, { key: "report", label: "Client Report" },
];

export default function Workspace() {
  const id = String(useParams().id);
  const [detail, setDetail] = useState<MandateDetail | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [stage, setStage] = useState<StageKey>("brief");
  const [busy, setBusy] = useState<string | null>(null);
  const [heuristics, setHeuristics] = useState<NegHeuristic[]>([]);
  const [offLimits, setOffLimits] = useState<string[]>([]);
  const [calibration, setCalibration] = useState<Candidate[] | null>(null);
  const [ranked, setRanked] = useState<Ranked | null>(null);
  const [shortlist, setShortlist] = useState<ShortlistResp | null>(null);
  const [report, setReport] = useState<ClientReport | null>(null);
  const [sel, setSel] = useState<Candidate | null>(null);
  const sourced = !!ranked;

  const refresh = useCallback(() => {
    api.mandate(id).then((d) => { setDetail(d); setHeuristics(d.negative_heuristics); setOffLimits(d.off_limits); });
    api.credits(id).then(setCredits);
  }, [id]);
  useEffect(() => { refresh(); }, [refresh]);

  async function run(tag: string, fn: () => Promise<void>) { setBusy(tag); try { await fn(); } finally { setBusy(null); } }

  const runCalibrate = () => run("calibrate", async () => {
    const r = await api.calibrate(id, 8); setCalibration(r.result.benchmarks); setCredits(r.credits);
  });
  const sendFeedback = async (v: Record<string, string>) => { const r = await api.calibrateFeedback(id, v); return { note: r.note }; };
  const runSource = () => run("source", async () => {
    const pr = await api.productionPull(id); setCredits(pr.credits);
    const sr = await api.score(id); setRanked(sr.result); setCredits(sr.credits);
    setStage("longlist");
  });
  const doTriage = (cid: string, v: string) => run("triage", async () => { setRanked(await api.triage(id, cid, v)); });
  const doStatus = (cid: string, s: string) => run("status", async () => {
    await api.setStatus(id, cid, s); setRanked(await api.candidates(id));
  });
  const reset = () => run("reset", async () => {
    await api.reset(id); setCalibration(null); setRanked(null); setShortlist(null); setReport(null); setSel(null); setStage("brief"); refresh();
  });

  const go = (s: StageKey) => {
    setStage(s);
    if (s === "shortlist") api.shortlist(id).then(setShortlist);
    if (s === "report") api.report(id).then(setReport);
    if (s === "longlist" && !ranked) api.candidates(id).then((r) => r.candidates.length && setRanked(r));
  };

  if (!detail) return <><TopBar /><div className="p-12 text-[--color-muted]">Loading workspace… (is the API on :8000?)</div></>;

  const ctx: Ctx = {
    id, detail, credits, busy, heuristics, setHeuristics, offLimits, setOffLimits,
    calibration, ranked, shortlist, report, go, runCalibrate, sendFeedback, runSource,
    doTriage, doStatus, openCandidate: setSel, sourced,
  };

  return (
    <>
      <TopBar live={detail.live_available} right={<Link href="/outreach" className="text-sm text-[--color-muted] hover:text-[--color-ink]">BD Outreach →</Link>} />
      <div className="mx-auto grid max-w-[1400px] grid-cols-[256px_1fr] gap-7 px-6 py-7">
        <aside className="space-y-5">
          <div>
            <Kicker>Mandate</Kicker>
            <h1 className="font-display mt-1 text-lg leading-snug text-[--color-ink]">{detail.name}</h1>
          </div>
          <CreditMeter c={credits} />
          <Rail title="Setup" items={SETUP} stage={stage} go={go} enabled={() => true} />
          <Rail title="Pipeline" items={PIPELINE} stage={stage} go={go} enabled={() => sourced} lockHint="Run Source first" />
          <button onClick={reset} className="w-full rounded-lg border border-[--color-line] bg-white px-3 py-1.5 text-xs text-[--color-faint] hover:bg-zinc-50">Reset run</button>
        </aside>

        <main className="min-w-0">
          {stage === "brief" && <BriefStage ctx={ctx} />}
          {stage === "market" && <MarketStage ctx={ctx} />}
          {stage === "targeting" && <TargetingStage ctx={ctx} />}
          {stage === "calibrate" && <CalibrateStage ctx={ctx} />}
          {stage === "source" && <SourceStage ctx={ctx} />}
          {stage === "longlist" && <LonglistStage ctx={ctx} />}
          {stage === "shortlist" && <ShortlistStage ctx={ctx} />}
          {stage === "engagement" && <EngagementStage ctx={ctx} />}
          {stage === "report" && <ReportStage ctx={ctx} />}
        </main>
      </div>

      {sel && <CandidateDrawer id={id} c={sel} onClose={() => setSel(null)} onRanked={(r) => {
        setRanked(r);
        const f = r.candidates.find((x) => x.profile.coresignal_id === sel.profile.coresignal_id);
        if (f) setSel(f);
      }} />}
    </>
  );
}

function CreditMeter({ c }: { c: Credits | null }) {
  if (!c) return null;
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between"><Kicker>Credit meter</Kicker><span className="text-xs text-[--color-faint]">{c.remaining} left</span></div>
      <p className="font-display mt-1 text-2xl text-[--color-ink]">{c.spent}<span className="text-base text-[--color-faint]">/{c.cap}</span></p>
      <Bar value={c.spent} max={c.cap} className="mt-2" />
      <div className="mt-2 flex gap-3 text-xs text-[--color-muted]"><span>dev <b className="text-[--color-ink]">{c.dev}</b></span><span>prod <b className="text-[--color-ink]">{c.production}</b></span></div>
    </Card>
  );
}

function Rail({ title, items, stage, go, enabled, lockHint }: {
  title: string; items: { key: StageKey; label: string }[]; stage: StageKey; go: (s: StageKey) => void; enabled: () => boolean; lockHint?: string;
}) {
  const on = enabled();
  return (
    <div>
      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[--color-faint]">{title}{!on && lockHint && <span className="ml-1 font-normal lowercase tracking-normal text-zinc-400">· {lockHint}</span>}</p>
      <Card className="overflow-hidden p-1.5">
        {items.map((it, i) => {
          const active = stage === it.key;
          return (
            <button key={it.key} disabled={!on} onClick={() => go(it.key)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${active ? "bg-[--color-accent-soft] text-[--color-accent]" : on ? "text-[--color-ink] hover:bg-zinc-50" : "text-zinc-300"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${active ? "bg-[--color-accent] text-white" : "bg-zinc-100 text-[--color-faint]"}`}>{i + 1}</span>
              {it.label}
            </button>
          );
        })}
      </Card>
    </div>
  );
}
