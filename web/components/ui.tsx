import React from "react";

// Editorial, desaturated fit tiers (match globals --t-*).
export const TIER_HEX: Record<string, string> = {
  core: "#1f4d44", adjacent: "#3a5a7d", weak: "#9a6b1f", stretch: "#9a6b1f",
  disqualified: "#9d3a30", none: "#a09a8b",
};

export function tierStyle(tier: string): React.CSSProperties {
  const c = TIER_HEX[tier] || TIER_HEX.none;
  return { color: c, backgroundColor: `${c}14`, boxShadow: `inset 0 0 0 1px ${c}33` };
}

export function fitColor(fit: number, dq = false): string {
  if (dq) return TIER_HEX.disqualified;
  if (fit >= 85) return TIER_HEX.core;
  if (fit >= 70) return TIER_HEX.adjacent;
  if (fit >= 50) return TIER_HEX.weak;
  return TIER_HEX.none;
}

export function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-faint)]">{children}</p>;
}

export function SectionTitle({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <div className="mb-7 max-w-2xl">
      {kicker && <Kicker>{kicker}</Kicker>}
      <h2 className="font-display mt-2 text-[34px] leading-[1.08] text-[var(--color-ink)]">{title}</h2>
      {sub && <p className="mt-3 text-[16px] leading-relaxed text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-card ${className}`}>{children}</div>;
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "subtle"; size?: "sm" | "md" | "lg" };
export function Button({ variant = "primary", size = "md", className = "", ...p }: BtnProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3.5 py-1.5 text-[13px]", md: "px-5 py-2.5 text-sm", lg: "px-7 py-3 text-[15px]" };
  const variants = {
    primary: "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-ink)] shadow-[0_2px_12px_-4px_rgba(31,77,68,.5)]",
    ghost: "border border-[var(--color-line-strong)] bg-transparent text-[var(--color-ink)] hover:bg-black/[.03]",
    subtle: "bg-[var(--color-accent-soft)] text-[var(--color-accent)] hover:brightness-95",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...p} />;
}

export function Pill({ children, tone = "zinc" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    zinc: "bg-black/[.04] text-[var(--color-muted)] ring-black/[.06]",
    indigo: "bg-[var(--color-accent-soft)] text-[var(--color-accent)] ring-[var(--color-accent)]/20",
    rose: "text-[#9d3a30] bg-[#9d3a30]/8 ring-[#9d3a30]/20",
    emerald: "text-[#1f4d44] bg-[#1f4d44]/8 ring-[#1f4d44]/20",
    amber: "text-[#9a6b1f] bg-[#9a6b1f]/8 ring-[#9a6b1f]/20",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone] || tones.zinc}`}>{children}</span>;
}

export function TierBadge({ tier }: { tier: string }) {
  return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize" style={tierStyle(tier)}>{tier}</span>;
}

export function Dot({ tier, className = "" }: { tier: string; className?: string }) {
  return <span className={`inline-block rounded-full ${className}`} style={{ backgroundColor: TIER_HEX[tier] || TIER_HEX.none }} />;
}

export function Bar({ value, max = 100, color = "var(--color-accent)", className = "" }: { value: number; max?: number; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className={`h-1.5 w-full overflow-hidden rounded-full bg-black/[.07] ${className}`}><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} /></div>;
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-raised)] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-faint)]">{label}</p>
      <p className="font-display mt-1 text-[26px] leading-none text-[var(--color-ink)] tnum">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}
