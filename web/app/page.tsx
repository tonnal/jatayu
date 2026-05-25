"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Mandate } from "@/lib/api";
import { TopBar } from "@/components/TopBar";
import { Card, Pill, Kicker } from "@/components/ui";

const SETUP = ["Brief", "Market Map", "Targeting", "Calibrate", "Source"];
const PIPELINE = ["Longlist", "Shortlist", "Engagement", "Client Report"];

export default function Home() {
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [live, setLive] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.health().then((h) => setLive(h.live_available)).catch(() => {});
    api.mandates().then(setMandates).catch((e) => setErr(String(e)));
  }, []);

  return (
    <>
      <TopBar live={live} />
      <main className="mx-auto max-w-[1400px] px-6 py-14">
        <div className="max-w-3xl">
          <Kicker>Executive search, the way an expert thinks</Kicker>
          <h1 className="font-display mt-3 text-[44px] leading-[1.05] tracking-tight text-[--color-ink]">
            From a mandate brief to a defensible shortlist.
          </h1>
          <p className="mt-4 text-[17px] leading-relaxed text-[--color-muted]">
            Jatayu walks the search professional&rsquo;s real workflow — market map, targeting,
            calibration, longlist, shortlist — with AI doing the heavy lifting and the operator
            in control at every gate. Firm attributes over titles. Hard gates over averages.
            Every credit and every score, transparent.
          </p>
        </div>

        {/* the two-track workflow, shown as the product's spine */}
        <div className="mt-10 grid gap-3 lg:grid-cols-2">
          <Track label="Setup" sub="Linear — you configure and sign off" steps={SETUP} accent />
          <Track label="Pipeline" sub="A living candidate board with feedback loops" steps={PIPELINE} />
        </div>

        <div className="mt-14 flex items-end justify-between">
          <Kicker>Choose a mandate</Kicker>
          <span className="text-xs text-[--color-faint]">{live ? "Live: keys detected" : "Demo: real engine over mock data"}</span>
        </div>
        {err && <p className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">Backend not reachable on :8000.<br /><span className="font-mono text-xs">{err}</span></p>}
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {mandates.map((m) => (
            <Link key={m.id} href={`/mandate/${m.id}`}>
              <Card className="group h-full p-6 transition hover:-translate-y-0.5 hover:shadow-pop">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-xl text-[--color-ink]">{m.name}</h3>
                  {m.executed ? <Pill tone="indigo">executed</Pill> : <Pill>config-only</Pill>}
                </div>
                <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-[--color-muted]">{m.description}</p>
                <span className="mt-4 inline-block text-sm font-medium text-[--color-accent]">Open workspace →</span>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

function Track({ label, sub, steps, accent }: { label: string; sub: string; steps: string[]; accent?: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline gap-2">
        <span className={`font-display text-lg ${accent ? "text-[--color-accent]" : "text-[--color-ink]"}`}>{label}</span>
        <span className="text-xs text-[--color-faint]">{sub}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="rounded-lg bg-zinc-50 px-2.5 py-1 text-[13px] text-[--color-ink] ring-1 ring-[--color-line]">{i + 1}. {s}</span>
            {i < steps.length - 1 && <span className="text-zinc-300">→</span>}
          </span>
        ))}
      </div>
    </Card>
  );
}
