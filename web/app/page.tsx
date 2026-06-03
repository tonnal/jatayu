"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, Mandate } from "@/lib/api";
import { TopBar } from "@/components/TopBar";
import { Card, Pill, Kicker } from "@/components/ui";

const SETUP = ["Brief", "Market Map", "Targeting", "Calibrate", "Source"];
const PIPELINE = ["Longlist", "Shortlist", "Engagement", "Report"];

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
      <main className="mx-auto max-w-[1180px] px-6 pb-20 pt-16">
        <div className="max-w-3xl rise">
          <Kicker>Executive search intelligence</Kicker>
          <h1 className="font-display mt-4 text-[52px] leading-[1.02] tracking-tight">
            From a mandate brief to a defensible shortlist.
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-[var(--color-muted)]">
            Jatayu walks the search professional&rsquo;s real workflow — market map, targeting,
            calibration, longlist, shortlist — with AI doing the heavy lifting and the operator
            in control at every gate. Firm attributes over titles. Hard gates over averages.
            Every credit and every score, transparent.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <Track label="Setup" sub="Linear — you configure and sign off" steps={SETUP} accent />
          <Track label="Pipeline" sub="A living candidate board with feedback loops" steps={PIPELINE} />
        </div>

        <div className="mt-16 flex items-end justify-between">
          <Kicker>Start setup — bring your own brief</Kicker>
          <span className="text-xs text-[var(--color-faint)]">{live ? "Live · keys detected" : "Demo · real engine over mock data"}</span>
        </div>
        {err && <p className="mt-4 rounded-xl bg-[#9d3a30]/8 p-4 text-sm text-[#9d3a30]">Backend not reachable.<br /><span className="font-mono text-xs">{err}</span></p>}

        <BriefStarter live={live} />

        <div className="mt-12 flex items-end justify-between">
          <Kicker>Or open a worked example</Kicker>
          <span className="text-xs text-[var(--color-faint)]">the two mandates from the Aidentifi brief</span>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {mandates.filter(m => m.id !== "generated").map((m) => (
            <Link key={m.id} href={`/mandate/${m.id}`}>
              <Card className="group relative h-full overflow-hidden p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-pop">
                <div className="flex items-center gap-2.5">
                  <h3 className="font-display text-[22px]">{m.name}</h3>
                  {m.executed ? <Pill tone="emerald">executed</Pill> : <Pill>config-only</Pill>}
                </div>
                <p className="mt-3 line-clamp-4 text-[15px] leading-relaxed text-[var(--color-muted)]">{m.description}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent)]">Open workspace <span className="transition group-hover:translate-x-1">→</span></span>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

function BriefStarter({ live }: { live: boolean }) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (brief.trim().length < 40) {
      setErr("Give the model something to work with — a few sentences at minimum.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const m = await api.generate(brief.trim());
      router.push(`/mandate/${m.id}`);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-[22px]">Describe the search you&rsquo;re running</h3>
        <span className="text-xs text-[var(--color-faint)]">
          {live ? "Anthropic key live · this will hit the model" : "Demo · the engine will stub the LLM call"}
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--color-muted)]">
        Paste a mandate brief — firm profile, role, what good and weak look like. Jatayu will translate it
        into a working filter + scoring config you can edit, then run end-to-end.
      </p>
      <textarea
        value={brief}
        onChange={(e) => { setBrief(e.target.value); setErr(null); }}
        rows={9}
        placeholder={`Example:\n\nSingapore-headquartered MAS-licensed asset manager (~SGD 500M AUM), looking for a sole compliance officer. 8-15 years experience, must have direct AI onboarding under their own license, fluency with MAS CMS license categories, ideally from an independent SG asset manager not pure banking.`}
        className="mt-5 w-full resize-y rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-canvas)] px-4 py-3 text-[15px] leading-relaxed text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
      />
      {err && <p className="mt-3 text-[13px] text-[#9d3a30]">{err}</p>}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-[var(--color-faint)]">{brief.trim().length} chars</span>
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-[var(--color-accent-ink)] disabled:cursor-progress disabled:opacity-60"
        >
          {busy ? "Generating strategy…" : "Generate strategy →"}
        </button>
      </div>
    </Card>
  );
}

function Track({ label, sub, steps, accent }: { label: string; sub: string; steps: string[]; accent?: boolean }) {
  return (
    <Card className="p-6">
      <div className="flex items-baseline gap-2.5">
        <span className={`font-display text-xl ${accent ? "text-[var(--color-accent)]" : ""}`}>{label}</span>
        <span className="text-xs text-[var(--color-faint)]">{sub}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-y-2">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center">
            <span className="flex items-center gap-2 rounded-lg bg-black/[.03] px-3 py-1.5 text-[13px]">
              <span className="font-display text-xs text-[var(--color-faint)]">{String(i + 1).padStart(2, "0")}</span>{s}
            </span>
            {i < steps.length - 1 && <span className="mx-1.5 text-[var(--color-line-strong)]">—</span>}
          </span>
        ))}
      </div>
    </Card>
  );
}
