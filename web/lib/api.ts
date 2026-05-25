// Thin client for the Jatayu FastAPI backend.
const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => j<{ ok: boolean; live_available: boolean }>("/api/health"),
  mandates: () => j<Mandate[]>("/api/mandates"),
  mandate: (id: string) => j<MandateDetail>(`/api/mandates/${id}`),
  credits: (id: string) => j<Credits>(`/api/mandates/${id}/credits`),
  devPull: (id: string, sample = 14) =>
    j<{ result: DevResult; credits: Credits }>(`/api/mandates/${id}/dev-pull?sample=${sample}`, { method: "POST" }),
  productionPull: (id: string, limit = 200) =>
    j<{ result: { count: number; tier_distribution: Record<string, number> }; credits: Credits }>(
      `/api/mandates/${id}/production-pull?limit=${limit}`, { method: "POST" }),
  score: (id: string) =>
    j<{ result: Ranked; credits: Credits }>(`/api/mandates/${id}/score`, { method: "POST" }),
  candidates: (id: string) => j<Ranked>(`/api/mandates/${id}/candidates`),
  override: (id: string, cid: string, body: OverrideBody) =>
    j<Ranked>(`/api/mandates/${id}/candidates/${cid}/override`, {
      method: "POST", body: JSON.stringify(body) }),
  reset: (id: string) => j<{ ok: boolean }>(`/api/mandates/${id}/reset`, { method: "POST" }),
  outreach: () => j<OutreachResp>("/api/outreach"),
};

// ---- types ----
export type Mandate = { id: string; name: string; description: string; executed: boolean };
export type Credits = { spent: number; cap: number; remaining: number; dev: number; production: number; entries: CreditEntry[] };
export type CreditEntry = { timestamp: string; endpoint: string; credit_cost: number; profiles_returned: number; stage: string; stage_purpose: string; useful_yes_no: string };
export type FirmType = { key: string; label: string; tier: string };
export type Gate = { id: string; hard: boolean; description: string };
export type SubScoreDef = { id: string; label: string; weight: number; guidance: string };
export type MandateDetail = {
  id: string; name: string; description: string;
  sourcing: { location_countries: string[]; industries_any: string[]; employee_count: { gte?: number; lte?: number } | null; title_keywords_any: string[]; exclusions: { title_keywords_none: string[]; company_keywords_none: string[]; industries_none: string[] }; min_years: number | null };
  firm_taxonomy: FirmType[]; gates: Gate[]; sub_scores: SubScoreDef[]; query: unknown; live_available: boolean;
};
export type Experience = { title: string; company: string; industry: string | null; size: number | null; firm_type: string; firm_label: string; tier: string; is_current: boolean; period: string; months: number | null };
export type Profile = { coresignal_id: string; name: string; current_title: string; current_company: string; current_firm_type: string; current_firm_tier: string; location_country: string | null; years_total_experience: number; years_relevant_experience: number; linkedin_url: string; headline: string | null; skills: string[]; n_core_adjacent: number; experiences: Experience[] };
export type SubScore = { id: string; label: string; weight: number; value: number | null; reason: string };
export type GateVerdict = { id: string; hard: boolean; passed: boolean; description: string };
export type Score = { fit_score: number; ungated_fit: number; disqualified: boolean; failed_gates: string[]; confidence: string; rationale: string; concerns_or_flags: string; overridden: boolean; override_note: string; sub_scores: SubScore[]; gates: GateVerdict[] };
export type Candidate = { rank: number | null; profile: Profile; score: Score };
export type Ranked = { candidates: Candidate[]; shortlist_size: number };
export type DevResult = { n_ids: number; sampled: number; tier_distribution: Record<string, number>; precision_estimate: number; sample: Profile[] };
export type OverrideBody = { sub_overrides?: Record<string, number>; gate_overrides?: Record<string, boolean>; note?: string };
export type Draft = { recipient_id: string; recipient_name: string | null; tier: string; channel: string; subject: string; body: string; confidence: string; richness_score: number; known_facts: string[]; hooks: string[]; uncertainty_flags: string[]; review_required: boolean };
export type OutreachResp = { aidentifi: string; drafts: Draft[]; live_available: boolean };
