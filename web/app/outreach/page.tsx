"use client";
import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Card, Pill } from "@/components/ui";
import { api, OutreachResp, Draft } from "@/lib/api";

const TIER_TONE: Record<string, string> = { rich: "emerald", moderate: "indigo", sparse: "rose" };

export default function OutreachPage() {
  const [data, setData] = useState<OutreachResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.outreach().then(setData).catch((e) => setErr(String(e))); }, []);

  return (
    <>
      <TopBar live={data?.live_available} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Outreach generator</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">
          Per-recipient BD outreach, grounded in their actual context. Richness tier drives the
          strategy: rich → specific email; sparse → short, archetype-level, low-confidence,
          flagged for review. Every factual claim must trace to a known fact — no hallucination.
        </p>
        {data && <p className="mt-2 text-xs text-zinc-400">Aidentifi positioning: {data.aidentifi}</p>}
        {err && <p className="mt-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700">Backend not reachable on :8000. <span className="font-mono text-xs">{err}</span></p>}

        <div className="mt-6 space-y-4">
          {data?.drafts.map((d) => <DraftCard key={d.recipient_id} d={d} />)}
        </div>
      </main>
    </>
  );
}

function DraftCard({ d }: { d: Draft }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{d.recipient_name || d.recipient_id}</h3>
        <Pill tone={TIER_TONE[d.tier]}>{d.tier} · score {d.richness_score}</Pill>
        <Pill>{d.channel}</Pill>
        <span className={`text-xs ${d.confidence === "high" ? "text-emerald-600" : d.confidence === "low" ? "text-amber-600" : "text-zinc-500"}`}>confidence: {d.confidence}</span>
        {d.review_required && <Pill tone="rose">review required</Pill>}
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[1fr_240px]">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          {d.subject && <p className="text-sm font-medium text-zinc-800">Subject: {d.subject}</p>}
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{d.body}</p>
        </div>
        <div className="space-y-3 text-xs">
          <div>
            <p className="font-semibold uppercase tracking-wide text-zinc-400">Grounded in</p>
            <ul className="mt-1 space-y-0.5 text-zinc-600">
              {d.known_facts.length ? d.known_facts.map((f, i) => <li key={i}>• {f}</li>) : <li className="text-zinc-400">— (only an identifier)</li>}
            </ul>
          </div>
          {d.uncertainty_flags.length > 0 && (
            <div>
              <p className="font-semibold uppercase tracking-wide text-amber-500">Uncertainty</p>
              <ul className="mt-1 space-y-0.5 text-amber-700">{d.uncertainty_flags.map((f, i) => <li key={i}>⚑ {f}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
