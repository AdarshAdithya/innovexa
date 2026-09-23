export const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const KEY = import.meta.env.VITE_API_KEY || "";

export type Status = "MET" | "NOT_MET" | "UNKNOWN" | "PENDING";
export type Decision = "ELIGIBLE" | "NOT_ELIGIBLE" | "NEEDS_REVIEW";

export interface Rule {
  id: string;
  kind: "inclusion" | "exclusion";
  field: string;
  operator: string;
  value: unknown;
  unit: string | null;
  source_text: string;
  section: string | null;
  any_of: Rule[] | null;
}
export interface Trial {
  id: string;
  title: string;
  condition: string;
  criteria_text: string;
  rules: Rule[];
  parsed_by: string;
  patient_count: number;
  screened: Record<Decision, number>;
}
export interface Anomaly {
  implausible: boolean;
  outlier: boolean;
  score: number;
  reasons: string[];
}
export interface Patient {
  id: string;
  age: number | null;
  sex: string | null;
  conditions: string[];
  medications: string[];
  labs: Record<string, number | { value: number; unit: string } | null>;
  pregnant: boolean | null;
  notes: string;
  anomaly: Anomaly | null;
}
export interface CriterionResult {
  rule_id: string;
  kind: string;
  source_text: string;
  section: string | null;
  status: Status;
  patient_value: unknown;
  evaluated_by: string;
  detail: string;
}
export interface Verdict {
  patient_id: string;
  trial_id: string;
  decision: Decision;
  results: CriterionResult[];
  rationale: string;
  confidence: number;
  citations: string[];
  flags: string[];
  counterfactuals: string[];
  corrections: string[];
}
export interface TraceEvent {
  type: string;
  content: string;
  patient_id?: string;
  trial_id?: string;
  data?: Record<string, unknown> & { verdict?: Verdict };
}
export interface Metrics {
  n: number;
  correct: number;
  accuracy: number;
  precision: number | null;
  recall: number | null;
  labels: Decision[];
  confusion_matrix: number[][];
  per_class: Record<Decision, { precision: number | null; recall: number | null; support: number }>;
  per_trial: Record<string, { accuracy: number; n: number }>;
  mismatches: { patient_id: string; trial_id: string; expected: string; predicted: string; label_comment: string; rationale: string }[];
  judge: { avg_clarity: number | null; n: number; mode: string | null; distribution: Record<string, number>; samples: { score: number; reason: string }[] };
  mode: string;
  seconds: number;
  target: number;
  baseline?: { available: boolean; reason?: string; accuracy?: number; n?: number } | null;
}
export interface Ranking {
  trial_id: string;
  title: string;
  similarity: number;
  decision: Decision | null;
  score: number;
}
export interface Cohorts {
  k: number;
  silhouette: number;
  clusters: { id: number; size: number; label: string; means: Record<string, number> }[];
  points: { patient_id: string; cluster: number; x: number; y: number; excluded_from_fit: boolean }[];
  note: string;
}
export interface QueryResult {
  question: string;
  filter: Record<string, unknown>;
  parsed_by: string;
  answer: string;
  rows: { patient_id: string; trial_id: string; decision: Decision; age: number; sex: string; confidence: number; flags: string[] }[];
}
export interface ReviewItem {
  patient_id: string;
  trial_id: string;
  decision: Decision;
  flags: string[];
  unknown: string[];
  reviewed: { decision: string; note: string } | null;
}

function headers(): HeadersInit {
  return { "Content-Type": "application/json", ...(KEY ? { "X-API-Key": KEY } : {}) };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, { ...init, headers: headers() });
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try {
      const body = await r.json();
      msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* keep status text */
    }
    throw new Error(msg);
  }
  return r.json();
}

export const api = {
  health: () => req<{ status: string; mode: string; llm_model: string | null }>("/health"),
  trials: () => req<Trial[]>("/trials"),
  createTrial: (body: { id: string; title: string; condition: string; criteria_text: string }) =>
    req<Trial>("/trials", { method: "POST", body: JSON.stringify(body) }),
  patients: () => req<Patient[]>("/patients"),
  screen: (trial_id: string, patient_ids?: string[]) =>
    req<Verdict[]>("/screen", { method: "POST", body: JSON.stringify({ trial_id, patient_ids }) }),
  metrics: (refresh = false, baseline = false) =>
    req<Metrics>(`/metrics?refresh=${refresh}&baseline=${baseline}`),
  query: (question: string) => req<QueryResult>("/query", { method: "POST", body: JSON.stringify({ question }) }),
  rankings: (pid: string) => req<Ranking[]>(`/patients/${encodeURIComponent(pid)}/rankings`),
  cohorts: () => req<Cohorts>("/cohorts"),
  review: () => req<ReviewItem[]>("/review"),
  submitReview: (body: { patient_id: string; trial_id: string; decision: string; note: string }) =>
    req<{ ok: boolean }>("/review", { method: "POST", body: JSON.stringify(body) }),
};

/** SSE over fetch so the optional API key header can be sent. */
export async function streamScreen(
  trialId: string,
  patientIds: string[] | null,
  onEvent: (e: TraceEvent) => void,
  signal?: AbortSignal,
) {
  const qs = new URLSearchParams({ trial_id: trialId });
  if (patientIds?.length) qs.set("patient_ids", patientIds.join(","));
  const r = await fetch(`${BASE}/screen/stream?${qs}`, { headers: headers(), signal });
  if (!r.ok || !r.body) throw new Error(`stream failed: ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)));
    }
  }
}
