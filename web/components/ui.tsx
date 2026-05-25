import React from "react";

export const TIER_COLOR: Record<string, string> = {
  core: "bg-emerald-500",
  adjacent: "bg-sky-500",
  weak: "bg-amber-500",
  disqualified: "bg-rose-500",
  none: "bg-zinc-400",
};
export const TIER_TEXT: Record<string, string> = {
  core: "text-emerald-700 bg-emerald-50 ring-emerald-600/20",
  adjacent: "text-sky-700 bg-sky-50 ring-sky-600/20",
  weak: "text-amber-700 bg-amber-50 ring-amber-600/20",
  disqualified: "text-rose-700 bg-rose-50 ring-rose-600/20",
  none: "text-zinc-600 bg-zinc-100 ring-zinc-500/20",
};

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TIER_TEXT[tier] || TIER_TEXT.none}`}>
      {tier}
    </span>
  );
}

export function Pill({ children, tone = "zinc" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    zinc: "bg-zinc-100 text-zinc-700 ring-zinc-500/20",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
    rose: "bg-rose-50 text-rose-700 ring-rose-600/20",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export function Bar({ value, max = 100, color = "bg-indigo-500", className = "" }: { value: number; max?: number; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-zinc-200 ${className}`}>
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-zinc-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function fitColor(fit: number, dq: boolean) {
  if (dq) return "bg-rose-400";
  if (fit >= 85) return "bg-emerald-500";
  if (fit >= 70) return "bg-sky-500";
  if (fit >= 50) return "bg-amber-500";
  return "bg-zinc-400";
}
