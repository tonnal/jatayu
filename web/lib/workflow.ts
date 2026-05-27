import { MandateDetail, Credits, Candidate, Ranked, ShortlistResp, ClientReport, NegHeuristic } from "@/lib/api";

export type StageKey =
  | "brief" | "market" | "targeting" | "preflight" | "calibrate" | "source"
  | "longlist" | "shortlist" | "engagement" | "report";

export type Ctx = {
  id: string;
  detail: MandateDetail;
  credits: Credits | null;
  busy: string | null;
  heuristics: NegHeuristic[]; setHeuristics: (h: NegHeuristic[]) => void;
  offLimits: string[]; setOffLimits: (o: string[]) => void;
  calibration: Candidate[] | null;
  ranked: Ranked | null;
  shortlist: ShortlistResp | null;
  report: ClientReport | null;
  go: (s: StageKey) => void;
  onGenerate: (brief: string) => Promise<void>;
  generating: boolean;
  runCalibrate: () => void;
  sendFeedback: (v: Record<string, string>) => Promise<{ note: string } | void>;
  runSource: () => void;
  doTriage: (cid: string, v: string) => void;
  doStatus: (cid: string, s: string) => void;
  openCandidate: (c: Candidate) => void;
  sourced: boolean;
};
