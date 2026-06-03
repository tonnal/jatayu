"use client";

/**
 * Soft access gate for the public Railway URL. Not real security — the password
 * sits in the bundle and an attacker can read it — but it stops casual visitors
 * (random crawlers, anyone who stumbles on the deploy URL) from poking the LIVE
 * endpoints and burning Coresignal / Anthropic credits.
 *
 * The expected password lives in NEXT_PUBLIC_GATE_PASSWORD (defaults to
 * "aidentifi"). On success we set a localStorage flag so the gate doesn't
 * reappear on refresh.
 */

import { useEffect, useState } from "react";

const EXPECTED = process.env.NEXT_PUBLIC_GATE_PASSWORD || "aidentifi";
const STORAGE_KEY = "jatayu_unlocked";

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  // `null` = still resolving from localStorage; avoids a hydration flash where
  // we render the gate then immediately swap it for the app.
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      setUnlocked(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setUnlocked(false);
    }
  }, []);

  if (unlocked === null) {
    return <div className="min-h-screen bg-[var(--color-canvas)]" />;
  }
  if (unlocked) return <>{children}</>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim().toLowerCase() === EXPECTED.toLowerCase()) {
      try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch {}
      setUnlocked(true);
    } else {
      setError(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-8 shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-faint)]">
          Jatayu — private preview
        </p>
        <h1 className="font-display mt-3 text-[28px] leading-[1.1] text-[var(--color-ink)]">
          Enter the access password
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          This deploy is shared privately with Aidentifi for the FDE assessment.
        </p>

        <form onSubmit={submit} className="mt-6">
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(false); }}
            placeholder="Password"
            className="w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-canvas)] px-3.5 py-2.5 text-[15px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          />
          {error && (
            <p className="mt-2 text-[13px] text-[#9d3a30]">That isn&apos;t the password.</p>
          )}
          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-[15px] font-medium text-white transition hover:bg-[var(--color-accent-ink)]"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
