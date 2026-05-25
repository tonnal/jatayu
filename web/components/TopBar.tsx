"use client";
import Link from "next/link";

export function TopBar({ live }: { live?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">J</span>
          <span className="text-[15px] font-semibold tracking-tight">Jatayu</span>
          <span className="text-[13px] text-zinc-400">AI Executive Search</span>
        </Link>
        <nav className="ml-4 flex items-center gap-1 text-sm">
          <Link href="/" className="rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-100">Mandates</Link>
          <Link href="/outreach" className="rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-100">Outreach</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${live ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-amber-50 text-amber-700 ring-amber-600/20"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-amber-500"}`} />
            {live ? "LIVE" : "DEMO MODE"}
          </span>
        </div>
      </div>
    </header>
  );
}
