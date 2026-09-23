import type { CriterionResult, Decision, EvidenceRequest, EvidenceSummary, Verdict, WhyNot } from "../api";
import { StatusPill, fmtValue } from "./ui";

const BANNER: Record<Decision, { cls: string; label: string; icon: string }> = {
  ELIGIBLE: { cls: "bg-emerald-600 text-white", label: "ELIGIBLE", icon: "✓" },
  NOT_ELIGIBLE: { cls: "bg-rose-600 text-white", label: "NOT ELIGIBLE", icon: "✕" },
  NEEDS_REVIEW: { cls: "bg-amber-400 text-amber-950", label: "NEEDS REVIEW", icon: "?" },
};

export function VerdictBanner({ v }: { v: Verdict }) {
  const b = BANNER[v.decision];
  const s = v.evidence_summary;
  return (
    <div className={`rounded-xl px-4 py-3 ${b.cls}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xl font-bold tracking-tight">
          {b.icon} {b.label}
        </p>
        <p className="text-sm opacity-90">Decided by the deterministic rule engine</p>
      </div>
      {s && s.total > 0 && (
        <p className="mt-1 text-sm opacity-90">
          {s.passed} passed · {s.failed} failed · {s.unresolved} unresolved of {s.total} criteria · evidence
          completeness {Math.round(s.completeness * 100)}%
        </p>
      )}
    </div>
  );
}

export function SummaryChips({ s }: { s: EvidenceSummary }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">{s.passed} passed</span>
      <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-800">{s.failed} failed</span>
      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">{s.unresolved} unresolved</span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
        {Math.round(s.completeness * 100)}% evidence
      </span>
    </div>
  );
}

export function WhyNotPanel({ items }: { items: WhyNot[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-800">Why not eligible?</h3>
      <div className="space-y-2">
        {items.map((w) => (
          <div key={w.rule_id} className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm">
            <p className="font-medium text-rose-900">
              <span className="mr-1 text-xs text-rose-700">[{w.section}]</span>
              {w.criterion}
            </p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-slate-700">
              <dt className="text-slate-500">Observed</dt>
              <dd>{fmtValue(w.observed)}</dd>
              <dt className="text-slate-500">Required</dt>
              <dd>{w.required}</dd>
              {w.comparison && (
                <>
                  <dt className="text-slate-500">Comparison</dt>
                  <dd className="font-mono">{w.comparison}</dd>
                </>
              )}
            </dl>
            {w.counterfactual && (
              <p className="mt-2 rounded bg-white px-2 py-1 text-xs text-sky-900 ring-1 ring-sky-200">
                <b>What would change the decision:</b> {w.counterfactual}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Counterfactuals come only from the protocol rules. They describe the criterion, not a treatment.
      </p>
    </section>
  );
}

const IMPACT: Record<string, string> = {
  HIGH: "bg-rose-600 text-white",
  MEDIUM: "bg-amber-400 text-amber-950",
  LOW: "bg-slate-300 text-slate-800",
};

export function NextBestEvidence({ items, children }: { items: EvidenceRequest[]; children?: React.ReactNode }) {
  if (!items.length) return null;
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50/50 p-3">
      <h3 className="text-sm font-bold tracking-wide text-amber-900">NEXT BEST EVIDENCE</h3>
      {items[0].plan && <p className="mb-2 text-xs text-amber-900">{items[0].plan}</p>}
      <ol className="space-y-2">
        {items.map((n) => (
          <li key={n.rule_id} className="rounded-lg bg-white p-2.5 text-sm ring-1 ring-amber-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-800">{n.rank}.</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${IMPACT[n.impact]}`}>{n.impact} IMPACT</span>
              <span className="font-medium">{n.request}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Required by {n.kind} criterion [{n.section}]: “{n.criterion}”. {n.why}
            </p>
            <p className="mt-1 flex flex-wrap gap-2 text-xs">
              {Object.entries(n.if_resolved).map(([k, d]) => (
                <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5">
                  if {k} → <b>{d.replace("_", " ")}</b>
                </span>
              ))}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-amber-900/80">
        Ranking is deterministic: outcomes are simulated through the rule engine; impact uses how often each criterion
        blocks otherwise-eligible patients in this cohort. No patient value is invented.
      </p>
      {children}
    </section>
  );
}

function Node({ label, value, tone = "slate" }: { label: string; value: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: "border-slate-200 bg-white",
    green: "border-emerald-300 bg-emerald-50",
    red: "border-rose-300 bg-rose-50",
    amber: "border-amber-300 bg-amber-50",
  };
  return (
    <div className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="break-words text-xs text-slate-900">{value}</div>
    </div>
  );
}

const Arrow = () => <span className="hidden shrink-0 self-center text-slate-400 sm:block">→</span>;

export function ProvenanceGraph({ v }: { v: Verdict }) {
  const rows = v.why_not.length
    ? v.results.filter((r) => v.why_not.some((w) => w.rule_id === r.rule_id))
    : v.decision === "NEEDS_REVIEW"
      ? v.results.filter((r) => r.status === "UNKNOWN" || r.status === "PENDING")
      : v.results.filter((r, i, all) => all.findIndex((x) => x.source_text === r.source_text) === i).slice(0, 4);
  const verdictTone = v.decision === "ELIGIBLE" ? "green" : v.decision === "NOT_ELIGIBLE" ? "red" : "amber";
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-800">Decision provenance</h3>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.rule_id} className="flex flex-col gap-1.5 sm:flex-row">
            <Node label="Patient evidence" value={`${r.field ?? "value"} = ${fmtValue(r.patient_value)}`} />
            <Arrow />
            <Node label={`Criterion [${r.section}]`} value={r.source_text} />
            <Arrow />
            <Node label="Comparison" value={<span className="font-mono">{r.comparison ?? r.detail ?? "—"}</span>} />
            <Arrow />
            <Node
              label="Status"
              value={<StatusPill s={r.status} />}
              tone={r.status === "UNKNOWN" || r.status === "PENDING" ? "amber" : "slate"}
            />
            <Arrow />
            <Node label="Verdict" value={<b>{v.decision.replace("_", " ")}</b>} tone={verdictTone} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function TemporalTimeline({ r }: { r: CriterionResult }) {
  const t = r.temporal;
  if (!t) return null;
  const dated = t.events.filter((e) => e.months_ago !== null && !e.negated);
  const span = Math.max(t.window_months * 2, ...dated.map((e) => (e.months_ago as number) * 1.15), 12);
  const pos = (m: number) => `${100 - (m / span) * 100}%`;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold text-slate-700">
        Timeline · [{r.section}] {r.source_text}
      </p>
      <div className="relative mx-2 mt-6 mb-7 h-2 rounded-full bg-slate-200">
        <div
          className="absolute inset-y-0 right-0 rounded-r-full bg-rose-300"
          style={{ left: pos(t.window_months) }}
          title={`exclusion window: ${t.window_text}`}
        />
        <span className="absolute -top-5 right-0 text-[10px] font-semibold text-slate-700">NOW</span>
        <span className="absolute top-3 text-[10px] text-rose-700" style={{ left: pos(t.window_months) }}>
          {t.window_months}-month window
        </span>
        {dated.map((e, i) => (
          <div key={i} className="absolute -top-1.5 -translate-x-1/2" style={{ left: pos(e.months_ago as number) }}>
            <div className={`h-5 w-5 rounded-full border-2 border-white ${e.inside_window ? "bg-rose-600" : "bg-sky-600"}`} />
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-slate-700">
              {e.concept} · {e.stated_as}
            </span>
          </div>
        ))}
      </div>
      <ul className="space-y-0.5 text-xs text-slate-600">
        {t.events.length === 0 && <li>No mention in the clinical note: status {r.status}.</li>}
        {t.events.map((e, i) => (
          <li key={i}>
            “{e.sentence}” →{" "}
            {e.negated
              ? "negated (event absent)"
              : e.months_ago === null
                ? "no date stated, cannot place on the timeline"
                : e.inside_window
                  ? "inside the window"
                  : "outside the window"}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs">
        Result: <StatusPill s={r.status} />{" "}
        {r.kind === "exclusion" && r.status === "NOT_MET" && <b className="text-emerald-700">PASS</b>}
        {r.kind === "exclusion" && r.status === "MET" && <b className="text-rose-700">EXCLUDED</b>}
      </p>
      <p className="mt-1 text-[10px] text-slate-400">Positions use only the intervals stated in the note; no dates are invented.</p>
    </div>
  );
}

export function VerificationPanel({ v }: { v: Verdict }) {
  const ver = v.verification;
  if (!ver || !ver.checks) {
    return v.corrections.length ? (
      <p className="text-xs text-violet-700">Self-verification: {v.corrections.join("; ")}</p>
    ) : null;
  }
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-slate-800">
        Verification{" "}
        <span className={ver.status === "passed" ? "text-emerald-700" : "text-violet-700"}>({ver.status})</span>
      </h3>
      <ul className="space-y-0.5 text-xs">
        {ver.checks.map((c) => (
          <li key={c.check} className={c.ok ? "text-slate-700" : "text-violet-700"}>
            {c.ok ? "✓" : "↺"} {c.check}
          </li>
        ))}
      </ul>
      {v.corrections.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs text-violet-700">
          {v.corrections.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
