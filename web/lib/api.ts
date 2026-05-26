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
  preflight: (id: string) => j<Preflight>(`/api/mandates/${id}/preflight`),

  calibrate: (id: string, sample = 8) =>
    j<{ result: { benchmarks: Candidate[] }; credits: Credits }>(`/api/mandates/${id}/calibrate?sample=${sample}`, { method: "POST" }),
  calibrateFeedback: (id: string, verdicts: Record<string, string>) =>
    j<{ applied: boolean; thumbs_up: number; thumbs_down: number; note: string }>(`/api/mandates/${id}/calibrate/feedback`, { method: "POST", body: JSON.stringify({ verdicts }) }),
  productionPull: (id: string, limit = 200) =>
    j<{ result: { count: number; tier_distribution: Record<string, number> }; credits: Credits }>(
      `/api/mandates/${id}/production-pull?limit=${limit}`, { method: "POST" }),
  score: (id: string) =>
    j<{ result: Ranked; credits: Credits }>(`/api/mandates/${id}/score`, { method: "POST" }),
  candidates: (id: string) => j<Ranked>(`/api/mandates/${id}/candidates`),
  override: (id: string, cid: string, body: OverrideBody) =>
    j<Ranked>(`/api/mandates/${id}/candidates/${cid}/override`, { method: "POST", body: JSON.stringify(body) }),
  triage: (id: string, cid: string, verdict: string) =>
    j<Ranked>(`/api/mandates/${id}/candidates/${cid}/triage`, { method: "POST", body: JSON.stringify({ verdict }) }),
  shortlist: (id: string) => j<ShortlistResp>(`/api/mandates/${id}/shortlist`),
  setStatus: (id: string, cid: string, status: string) =>
    j<{ ok: boolean }>(`/api/mandates/${id}/candidates/${cid}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  report: (id: string) => j<ClientReport>(`/api/mandates/${id}/report`),
  reset: (id: string) => j<{ ok: boolean }>(`/api/mandates/${id}/reset`, { method: "POST" }),
  outreach: () => j<OutreachResp>("/api/outreach"),
};

export const STATUS_FLOW = ["sourced", "contacted", "responded", "screened", "client_review", "interview", "offer"];

// ---- types ----
export type Mandate = { id: string; name: string; description: string; executed: boolean };
export type Credits = { spent: number; cap: number; remaining: number; dev: number; production: number; entries: CreditEntry[] };
export type CreditEntry = { timestamp: string; endpoint: string; credit_cost: number; profiles_returned: number; stage: string; stage_purpose: string; useful_yes_no: string };
export type FirmType = { key: string; label: string; tier: string };
export type Gate = { id: string; hard: boolean; description: string };
export type SubScoreDef = { id: string; label: string; weight: number; guidance: string };
export type CriteriaEvidence = { want: string; proxy: string; signal: string };
export type MarketMap = { pool_estimate: string; target_companies: Record<string, string[]> };
export type NegHeuristic = { id: string; label: string; enabled: boolean };
export type MandateDetail = {
  id: string; name: string; description: string;
  sourcing: { location_countries: string[]; industries_any: string[]; employee_count: { gte?: number; lte?: number } | null; title_keywords_any: string[]; exclusions: { title_keywords_none: string[]; company_keywords_none: string[]; industries_none: string[] }; min_years: number | null };
  firm_taxonomy: FirmType[]; gates: Gate[]; sub_scores: SubScoreDef[]; query: unknown; live_available: boolean;
  spec: { must_haves: string[]; nice_to_haves: string[] };
  criteria_evidence: CriteriaEvidence[];
  market_map: MarketMap;
  off_limits: string[];
  negative_heuristics: NegHeuristic[];
};
export type Experience = { title: string; company: string; industry: string | null; size: number | null; firm_type: string; firm_label: string; tier: string; is_current: boolean; period: string; months: number | null };
export type Profile = { coresignal_id: string; name: string; current_title: string; current_company: string; current_firm_type: string; current_firm_tier: string; location_country: string | null; years_total_experience: number; years_relevant_experience: number; linkedin_url: string; headline: string | null; skills: string[]; n_core_adjacent: number; experiences: Experience[] };
export type SubScore = { id: string; label: string; weight: number; value: number | null; reason: string };
export type GateVerdict = { id: string; hard: boolean; passed: boolean; description: string };
export type Score = { fit_score: number; ungated_fit: number; disqualified: boolean; failed_gates: string[]; confidence: string; rationale: string; concerns_or_flags: string; overridden: boolean; override_note: string; sub_scores: SubScore[]; gates: GateVerdict[] };
export type Candidate = { rank: number | null; profile: Profile; score: Score; triage?: string; status?: string; verdict?: string };
export type Ranked = { candidates: Candidate[]; shortlist_size: number };
export type Band = { band: string; candidates: Candidate[] };
export type Slate = { size: number; band_counts: Record<string, number>; firm_tier_spread: Record<string, number>; confidence_spread: Record<string, number>; diversity_note: string };
export type ShortlistResp = { bands: Band[]; slate: Slate };
export type ClientReport = { mandate: string; pool: { longlist: number; shortlist: number; disqualified: number }; credits_spent: number; shortlist: ShortlistResp; pipeline_status: Record<string, number> };
export type OverrideBody = { sub_overrides?: Record<string, number>; gate_overrides?: Record<string, boolean>; note?: string };
export type Draft = { recipient_id: string; recipient_name: string | null; tier: string; channel: string; subject: string; body: string; confidence: string; richness_score: number; known_facts: string[]; hooks: string[]; uncertainty_flags: string[]; review_required: boolean };
export type OutreachResp = { aidentifi: string; drafts: Draft[]; live_available: boolean };
export type Risk = { id: string; severity: "high" | "medium" | "low"; title: string; detail: string; query_shape: string; fix: string; weight: number };
export type Preflight = { health: number; max_health: number; risks: Risk[]; note: string };
