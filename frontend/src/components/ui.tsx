import type { ReactNode } from "react";
import type { Decision, Status } from "../api";

const DECISION_STYLE: Record<Decision, string> = {
  ELIGIBLE: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  NOT_ELIGIBLE: "bg-rose-100 text-rose-800 ring-rose-300",
  NEEDS_REVIEW: "bg-amber-100 text-amber-800 ring-amber-300",
};
const DECISION_LABEL: Record<Decision, string> = {
  ELIGIBLE: "Eligible",
  NOT_ELIGIBLE: "Not eligible",
  NEEDS_REVIEW: "Needs review",
};

export function DecisionBadge({ d }: { d: Decision | null | undefined }) {
  if (!d) return <span className="text-xs text-slate-400">not screened</span>;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${DECISION_STYLE[d]}`}>
      {DECISION_LABEL[d]}
    </span>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  MET: "text-emerald-700 bg-emerald-50",
  NOT_MET: "text-slate-600 bg-slate-100",
  UNKNOWN: "text-amber-700 bg-amber-50",
  PENDING: "text-sky-700 bg-sky-50",
};

export function StatusPill({ s }: { s: Status }) {
  return <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${STATUS_STYLE[s]}`}>{s}</span>;
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-xs tabular-nums text-slate-600">{pct}%</span>
    </div>
  );
}

export function Card({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      {label}
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
      {error}. Is the backend running on port 8000?
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const cls =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400"
      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:text-slate-400";
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${cls}`}>
      {children}
    </button>
  );
}

export function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.join(", ") || "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
