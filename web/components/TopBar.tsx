"use client";
import Link from "next/link";

export function TopBar({ live, right }: { live?: boolean; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-canvas)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-5 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-ink)] font-display text-base text-[var(--color-canvas)]">J</span>
          <span className="font-display text-lg tracking-tight">Jatayu</span>
        </Link>
        <nav className="ml-2 hidden items-center gap-1 text-sm sm:flex">
          <Link href="/" className="rounded-md px-3 py-1.5 text-[var(--color-muted)] hover:bg-black/[.04]">Mandates</Link>
          <Link href="/outreach" className="rounded-md px-3 py-1.5 text-[var(--color-muted)] hover:bg-black/[.04]">BD Outreach</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {right}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${live ? "bg-[#1f4d44]/10 text-[#1f4d44] ring-[#1f4d44]/20" : "bg-[#9a6b1f]/10 text-[#9a6b1f] ring-[#9a6b1f]/20"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-[#1f4d44]" : "bg-[#9a6b1f]"}`} />{live ? "Live" : "Demo"}
          </span>
        </div>
      </div>
    </header>
  );
}
