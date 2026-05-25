import React from "react";

export const TIER_COLOR: Record<string, string> = {
  core: "bg-emerald-500", adjacent: "bg-sky-500", weak: "bg-amber-500",
  disqualified: "bg-rose-500", stretch: "bg-amber-500", none: "bg-zinc-300",
};
export const TIER_TEXT: Record<string, string> = {
  core: "text-emerald-700 bg-emerald-50 ring-emerald-600/15",
  adjacent: "text-sky-700 bg-sky-50 ring-sky-600/15",
  weak: "text-amber-700 bg-amber-50 ring-amber-600/15",
  stretch: "text-amber-700 bg-amber-50 ring-amber-600/15",
  disqualified: "text-rose-700 bg-rose-50 ring-rose-600/15",
  none: "text-zinc-600 bg-zinc-100 ring-zinc-500/15",
};

export function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[--color-faint]">{children}</p>;
}

export function SectionTitle({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <div className="mb-5">
      {kicker && <Kicker>{kicker}</Kicker>}
      <h2 className="font-display mt-1 text-[26px] leading-tight text-[--color-ink]">{title}</h2>
      {sub && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-[--color-muted]">{sub}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[--color-line] bg-[--color-surface] shadow-card ${className}`}>{children}</div>;
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" };
export function Button({ variant = "primary", size = "md", className = "", ...p }: BtnProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3 py-1.5 text-[13px]", md: "px-4 py-2.5 text-sm" };
  const variants = {
    primary: "bg-[--color-accent] text-white hover:brightness-110 shadow-sm",
    secondary: "bg-[--color-ink] text-white hover:brightness-125",
    ghost: "border border-[--color-line] bg-white text-[--color-ink] hover:bg-zinc-50",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...p} />;
}

export function Pill({ children, tone = "zinc" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    zinc: "bg-zinc-100 text-zinc-700 ring-zinc-500/15",
    indigo: "bg-[--color-accent-soft] text-[--color-accent] ring-[--color-accent]/15",
    rose: "bg-rose-50 text-rose-700 ring-rose-600/15",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    amber: "bg-amber-50 text-amber-700 ring-amber-600/15",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone] || tones.zinc}`}>{children}</span>;
}

export function TierBadge({ tier }: { tier: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset ${TIER_TEXT[tier] || TIER_TEXT.none}`}>{tier}</span>;
}

export function Bar({ value, max = 100, color = "bg-[--color-accent]", className = "" }: { value: number; max?: number; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className={`h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/70 ${className}`}><div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} /></div>;
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-[--color-line] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[--color-faint]">{label}</p>
      <p className="font-display mt-1 text-2xl text-[--color-ink]">{value}</p>
      {sub && <p className="text-xs text-[--color-muted]">{sub}</p>}
    </div>
  );
}

export function fitColor(fit: number, dq = false) {
  if (dq) return "bg-rose-400";
  if (fit >= 85) return "bg-emerald-500";
  if (fit >= 70) return "bg-sky-500";
  if (fit >= 50) return "bg-amber-500";
  return "bg-zinc-400";
}
