"use client";
import Link from "next/link";

export function TopBar({ live, right }: { live?: boolean; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[--color-line] bg-[--color-canvas]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-5 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[--color-ink] font-display text-base text-white">J</span>
          <span className="font-display text-lg tracking-tight text-[--color-ink]">Jatayu</span>
          <span className="hidden text-[13px] text-[--color-faint] sm:inline">AI Executive Search</span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          {right}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${live ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-amber-50 text-amber-700 ring-amber-600/20"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-amber-500"}`} />
            {live ? "Live" : "Demo"}
          </span>
        </div>
      </div>
    </header>
  );
}
