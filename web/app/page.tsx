"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Mandate } from "@/lib/api";
import { TopBar } from "@/components/TopBar";
import { Card, Pill } from "@/components/ui";

const FUNNEL = ["Mandate", "Sourcing", "Filtering", "Ranking", "Shortlist", "Outreach"];

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
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight">Run a search like a domain expert.</h1>
          <p className="mt-3 text-zinc-600">
            Jatayu turns a mandate brief into a tightly-fit, ranked shortlist — sourcing on
            firm attributes (not titles), disqualifying wrong-pool archetypes with hard gates,
            and keeping every credit and score transparent and overridable.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          {FUNNEL.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-sm text-zinc-700 ring-1 ring-zinc-200">{s}</span>
              {i < FUNNEL.length - 1 && <span className="text-zinc-300">→</span>}
            </div>
          ))}
        </div>

        <h2 className="mt-12 text-sm font-semibold uppercase tracking-wide text-zinc-500">Choose a mandate</h2>
        {err && <p className="mt-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700">Backend not reachable — is the API running on :8000?<br /><span className="font-mono text-xs">{err}</span></p>}
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {mandates.map((m) => (
            <Link key={m.id} href={`/mandate/${m.id}`}>
              <Card className="group h-full p-6 transition hover:border-indigo-300 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{m.name}</h3>
                  {m.executed ? <Pill tone="indigo">executed</Pill> : <Pill>config-only</Pill>}
                </div>
                <p className="mt-2 line-clamp-4 text-sm text-zinc-600">{m.description}</p>
                <span className="mt-4 inline-block text-sm font-medium text-indigo-600 group-hover:underline">Open workspace →</span>
              </Card>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-xs text-zinc-400">
          {live ? "Live mode: Coresignal + LLM keys detected." : "Demo mode: the real engine runs over mock data — no credits, no keys. Add keys to .env to go live."}
        </p>
      </main>
    </>
  );
}
