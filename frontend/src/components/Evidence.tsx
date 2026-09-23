import type { CriterionResult, Decision, EvidenceRequest, EvidenceSummary, Verdict, WhyNot } from "../api";
import { DECISION_META, Icon, Ring, StatusPill, fmtValue, type IconName } from "./ui";

const BANNER: Record<Decision, { wrap: string; iconWrap: string; label: string; icon: IconName; ring: string; sub: string }> = {
  ELIGIBLE: {
    wrap: "from-emerald-50 via-white to-white ring-emerald-200",
    iconWrap: "bg-emerald-500 text-white shadow-[0_10px_24px_-8px_rgb(16_185_129/0.7)]",
    label: "Eligible",
    icon: "check",
    ring: "#10b981",
    sub: "text-emerald-700",
  },
  NOT_ELIGIBLE: {
    wrap: "from-rose-50 via-white to-white ring-rose-200",
    iconWrap: "bg-rose-500 text-white shadow-[0_10px_24px_-8px_rgb(244_63_94/0.7)]",
    label: "Not eligible",
    icon: "x",
    ring: "#f43f5e",
    sub: "text-rose-700",
  },
  NEEDS_REVIEW: {
    wrap: "from-amber-50 via-white to-white ring-amber-200",
    iconWrap: "bg-amber-400 text-amber-950 shadow-[0_10px_24px_-8px_rgb(245_158_11/0.7)]",
    label: "Needs review",
    icon: "question",
    ring: "#f59e0b",
    sub: "text-amber-700",
  },
};

function SectionTitle({ icon, children, tone = "text-navy-900" }: { icon: IconName; children: React.ReactNode; tone?: string }) {
  return (
    <h3 className={`mb-3 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase ${tone}`}>
      <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon name={icon} className="h-3.5 w-3.5" />
      </span>
      {children}
    </h3>
  );
}

export function VerdictBanner({ v }: { v: Verdict }) {
  const b = BANNER[v.decision];
  const s = v.evidence_summary;
  return (
    <div className={`animate-pop rounded-3xl bg-gradient-to-br p-5 ring-1 ${b.wrap}`}>
      <div className="flex flex-wrap items-center gap-4">
        <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${b.iconWrap}`}>
          <Icon name={b.icon} className="h-7 w-7" strokeWidth={2.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-bold tracking-[0.16em] uppercase ${b.sub}`}>Screening verdict</p>
          <p className="font-display text-3xl leading-tight font-extrabold tracking-tight text-navy-900 uppercase">{b.label}</p>
          <p className="text-xs text-slate-500">Decided by the deterministic rule engine</p>
        </div>
        {s && s.total > 0 && (
          <Ring value={s.completeness} size={72} stroke={7} color={b.ring}>
            <div className="text-center leading-none">
              <p className="font-display text-base font-extrabold tabular-nums">{Math.round(s.completeness * 100)}%</p>
              <p className="mt-0.5 text-[8px] font-semibold tracking-widest text-slate-500 uppercase">evidence</p>
            </div>
          </Ring>
        )}
      </div>
      {s && s.total > 0 && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { k: "Passed", v: s.passed, cls: "text-emerald-600" },
              { k: "Failed", v: s.failed, cls: "text-rose-600" },
              { k: "Unresolved", v: s.unresolved, cls: "text-amber-600" },
              { k: "Criteria", v: s.total, cls: "text-navy-900" },
            ].map((x) => (
              <div key={x.k} className="rounded-2xl bg-white/80 px-3 py-2 ring-1 ring-navy-900/5">
                <p className={`font-display text-xl font-extrabold tabular-nums ${x.cls}`}>{x.v}</p>
                <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">{x.k}</p>
              </div>
            ))}
          </div>
          <p className="sr-only">
            {s.passed} passed · {s.failed} failed · {s.unresolved} unresolved of {s.total} criteria · evidence completeness{" "}
            {Math.round(s.completeness * 100)}%
          </p>
          {v.decision === "NOT_ELIGIBLE" && s.primary_blockers?.length > 0 && (
            <div className="mt-3 rounded-2xl bg-white/80 p-3 ring-1 ring-rose-100">
              <p className="mb-1.5 text-[10px] font-bold tracking-widest text-rose-700 uppercase">Blocking criteria</p>
              <ul className="space-y-1 text-xs text-slate-700">
                {s.primary_blockers.map((pb) => (
                  <li key={pb.rule_id} className="flex gap-2">
                    <Icon name="x" className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" strokeWidth={2.6} />
                    <span>
                      <span className="text-slate-400">[{pb.section}]</span> {pb.criterion}{" "}
                      <span className="text-slate-500">· observed {fmtValue(pb.observed)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {v.decision === "NEEDS_REVIEW" && s.unresolved_criteria?.length > 0 && (
            <div className="mt-3 rounded-2xl bg-white/80 p-3 ring-1 ring-amber-100">
              <p className="mb-1.5 text-[10px] font-bold tracking-widest text-amber-700 uppercase">Unresolved criteria</p>
              <ul className="space-y-1 text-xs text-slate-700">
                {s.unresolved_criteria.map((u) => (
                  <li key={u.rule_id} className="flex gap-2">
                    <Icon name="question" className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" strokeWidth={2.6} />
                    <span>
                      <span className="text-slate-400">[{u.section}]</span> {u.criterion} <span className="text-slate-500">· {u.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SummaryChips({ s }: { s: EvidenceSummary }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-100">{s.passed} passed</span>
      <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 ring-1 ring-rose-100">{s.failed} failed</span>
      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 ring-1 ring-amber-100">{s.unresolved} unresolved</span>
      <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-600 ring-1 ring-brand-100">
        {Math.round(s.completeness * 100)}% evidence
      </span>
    </div>
  );
}

export function WhyNotPanel({ items }: { items: WhyNot[] }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionTitle icon="x" tone="text-rose-800">
        Why not eligible?
      </SectionTitle>
      <div className="space-y-3">
        {items.map((w) => (
          <div key={w.rule_id} className="animate-rise overflow-hidden rounded-2xl bg-white ring-1 ring-rose-200">
            <div className="flex items-start gap-2 bg-rose-50/70 px-4 py-2.5">
              <span className="mt-0.5 rounded-md bg-rose-100 px-1.5 py-px font-mono text-[10px] font-semibold text-rose-700">{w.section}</span>
              <p className="text-sm font-semibold text-rose-950">{w.criterion}</p>
            </div>
            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="rounded-xl bg-canvas px-3 py-2">
                <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Observed</p>
                <p className="font-display text-lg font-bold text-rose-600">{fmtValue(w.observed)}</p>
              </div>
              <Icon name="arrowRight" className="hidden h-4 w-4 text-slate-300 sm:block" />
              <div className="rounded-xl bg-canvas px-3 py-2">
                <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Required</p>
                <p className="font-display text-lg font-bold text-navy-900">{w.required}</p>
              </div>
              {w.comparison && (
                <p className="font-mono text-[11px] text-slate-500 sm:col-span-3">
                  <span className="text-slate-400">comparison:</span> {w.comparison}
                </p>
              )}
            </div>
            {w.counterfactual && (
              <div className="mx-4 mb-4 flex items-start gap-2.5 rounded-xl bg-gradient-to-r from-brand-50 to-aqua-100/50 px-3 py-2.5 ring-1 ring-brand-100">
                <Icon name="sparkle" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-brand-600 uppercase">What would change this criterion?</p>
                  <p className="text-sm font-semibold text-navy-900">{w.counterfactual}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Counterfactuals come only from the protocol rules. They describe the criterion, not a treatment.
      </p>
    </section>
  );
}

const IMPACT: Record<string, string> = {
  HIGH: "bg-rose-600 text-white",
  MEDIUM: "bg-amber-400 text-amber-950",
  LOW: "bg-slate-200 text-slate-700",
};

export function NextBestEvidence({ items, children }: { items: EvidenceRequest[]; children?: React.ReactNode }) {
  if (!items.length) return null;
  return (
    <section className="animate-rise relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 p-5 text-white shadow-lift">
      <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-lime-400/20 blur-3xl" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-lime-400 text-navy-950">
            <Icon name="search" className="h-4 w-4" strokeWidth={2.4} />
          </span>
          <h3 className="font-display text-sm font-extrabold tracking-[0.16em] text-white uppercase">Next best evidence</h3>
        </div>
        {items[0].plan && <p className="mt-2 text-xs leading-relaxed text-white/75">{items[0].plan}</p>}
        <ol className="mt-4 space-y-2.5">
          {items.map((n) => (
            <li key={n.rule_id} className="rounded-2xl bg-white p-3.5 text-sm text-navy-900 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-navy-900 font-display text-xs font-bold text-white">{n.rank}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ${IMPACT[n.impact]}`}>{n.impact} IMPACT</span>
                <span className="font-display text-[15px] font-bold">{n.request}</span>
              </div>
              <div className="mt-2 rounded-xl bg-canvas px-3 py-2">
                <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Why it matters</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  Required by {n.kind} criterion [{n.section}]: “{n.criterion}”. {n.why}
                </p>
              </div>
              {Object.keys(n.if_resolved).length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  {Object.entries(n.if_resolved).map(([k, d]) => (
                    <span key={k} className={`rounded-full px-2 py-0.5 ring-1 ${DECISION_META[d]?.badge ?? "bg-slate-100 ring-slate-200"}`}>
                      if {k} → <b>{d.replace("_", " ")}</b>
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11px] leading-relaxed text-white/60">
          Ranking is deterministic: outcomes are simulated through the rule engine; impact uses how often each criterion
          blocks otherwise-eligible patients in this cohort. No patient value is invented.
        </p>
        {children}
      </div>
    </section>
  );
}

function Node({ label, value, tone = "slate", step }: { label: string; value: React.ReactNode; tone?: string; step: number }) {
  const tones: Record<string, string> = {
    slate: "bg-white ring-navy-900/8",
    green: "bg-emerald-50 ring-emerald-200",
    red: "bg-rose-50 ring-rose-200",
    amber: "bg-amber-50 ring-amber-200",
  };
  return (
    <div className={`relative min-w-0 flex-1 rounded-xl px-3 py-2 ring-1 ${tones[tone]}`}>
      <p className="flex items-center gap-1.5 text-[9.5px] font-bold tracking-widest text-slate-500 uppercase">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-navy-900/5 font-mono text-[9px] text-slate-500">{step}</span>
        {label}
      </p>
      <div className="mt-0.5 text-xs break-words text-navy-900">{value}</div>
    </div>
  );
}

const Arrow = () => (
  <span className="flex shrink-0 items-center justify-center text-slate-300 sm:self-center">
    <Icon name="arrowRight" className="h-3.5 w-3.5 rotate-90 sm:rotate-0" />
  </span>
);

export function ProvenanceGraph({ v }: { v: Verdict }) {
  const rows = v.why_not.length
    ? v.results.filter((r) => v.why_not.some((w) => w.rule_id === r.rule_id))
    : v.decision === "NEEDS_REVIEW"
      ? v.results.filter((r) => r.status === "UNKNOWN" || r.status === "PENDING")
      : v.results.filter((r, i, all) => all.findIndex((x) => x.source_text === r.source_text) === i).slice(0, 4);
  const verdictTone = v.decision === "ELIGIBLE" ? "green" : v.decision === "NOT_ELIGIBLE" ? "red" : "amber";
  return (
    <section>
      <SectionTitle icon="link">Decision provenance</SectionTitle>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.rule_id} className="animate-rise flex flex-col gap-1 rounded-2xl bg-canvas p-2 ring-1 ring-navy-900/5 sm:flex-row sm:gap-1.5">
            <Node step={1} label="Patient evidence" value={`${r.field ?? "value"} = ${fmtValue(r.patient_value)}`} />
            <Arrow />
            <Node step={2} label={`Criterion [${r.section}]`} value={r.source_text} />
            <Arrow />
            <Node step={3} label="Comparison" value={<span className="font-mono text-[11px]">{r.comparison ?? r.detail ?? "—"}</span>} />
            <Arrow />
            <Node
              step={4}
              label="Status"
              value={<StatusPill s={r.status} />}
              tone={r.status === "UNKNOWN" || r.status === "PENDING" ? "amber" : "slate"}
            />
            <Arrow />
            <Node step={5} label="Verdict" value={<b>{v.decision.replace("_", " ")}</b>} tone={verdictTone} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Per-criterion evidence cards: criterion → patient evidence → required threshold → comparison → status. */
export function CriteriaEvidence({ results }: { results: CriterionResult[] }) {
  const tone: Record<string, { icon: IconName; dot: string }> = {
    MET: { icon: "check", dot: "bg-emerald-500 text-white" },
    NOT_MET: { icon: "x", dot: "bg-slate-300 text-white" },
    UNKNOWN: { icon: "question", dot: "bg-amber-400 text-amber-950" },
    PENDING: { icon: "clock", dot: "bg-sky-500 text-white" },
  };
  return (
    <div className="space-y-2">
      {results.map((r) => {
        const t = tone[r.status] ?? tone.PENDING;
        const required =
          r.threshold !== undefined && r.threshold !== null ? [r.operator, fmtValue(r.threshold), r.unit].filter(Boolean).join(" ") : null;
        return (
          <div key={r.rule_id} className="rounded-2xl bg-white p-3 ring-1 ring-navy-900/6 transition hover:ring-brand-500/30">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${t.dot}`}>
                <Icon name={t.icon} className="h-3 w-3" strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-1.5 py-px text-[10px] font-bold tracking-wider uppercase ${r.kind === "exclusion" ? "bg-rose-50 text-rose-700" : "bg-brand-50 text-brand-600"}`}>
                    {r.kind}
                  </span>
                  <span className="text-[11px] text-slate-400">{r.section}</span>
                  <span className="ml-auto">
                    <StatusPill s={r.status} />
                  </span>
                </div>
                <p className="mt-1 text-sm leading-snug text-navy-900">{r.source_text}</p>
                {r.detail && r.status === "UNKNOWN" && <p className="mt-0.5 text-xs text-amber-700">{r.detail}</p>}
                <dl className="mt-2 grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
                  <div className="rounded-lg bg-canvas px-2 py-1">
                    <dt className="text-[9.5px] font-bold tracking-widest text-slate-400 uppercase">Patient</dt>
                    <dd className="break-words text-navy-900">{fmtValue(r.patient_value)}</dd>
                  </div>
                  <div className="rounded-lg bg-canvas px-2 py-1">
                    <dt className="text-[9.5px] font-bold tracking-widest text-slate-400 uppercase">Required</dt>
                    <dd className="break-words text-navy-900">{required ?? "—"}</dd>
                  </div>
                  <div className="col-span-2 rounded-lg bg-canvas px-2 py-1">
                    <dt className="text-[9.5px] font-bold tracking-widest text-slate-400 uppercase">Comparison · by {r.evaluated_by}</dt>
                    <dd className="font-mono text-[11px] break-words text-slate-600">{r.comparison ?? "—"}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TemporalTimeline({ r }: { r: CriterionResult }) {
  const t = r.temporal;
  if (!t) return null;
  const dated = t.events.filter((e) => e.months_ago !== null && !e.negated);
  const span = Math.max(t.window_months * 2, ...dated.map((e) => (e.months_ago as number) * 1.15), 12);
  const pos = (m: number) => `${100 - (m / span) * 100}%`;
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-navy-900/6">
      <p className="text-xs font-semibold text-navy-900">
        <span className="text-slate-400">Timeline · [{r.section}]</span> {r.source_text}
      </p>
      <div className="relative mx-2 mt-8 mb-8 h-2 rounded-full bg-mist">
        <div
          className="absolute inset-y-0 right-0 rounded-r-full bg-gradient-to-r from-rose-200 to-rose-300"
          style={{ left: pos(t.window_months) }}
          title={`exclusion window: ${t.window_text}`}
        />
        <span className="absolute -top-6 right-0 rounded-full bg-navy-900 px-1.5 py-px text-[9px] font-bold tracking-wider text-white">NOW</span>
        <span className="absolute top-3.5 text-[10px] font-semibold text-rose-700" style={{ left: pos(t.window_months) }}>
          {t.window_months}-month window
        </span>
        {dated.map((e, i) => (
          <div key={i} className="absolute -top-1.5 -translate-x-1/2" style={{ left: pos(e.months_ago as number) }}>
            <div className={`h-5 w-5 rounded-full border-[3px] border-white shadow-soft ${e.inside_window ? "bg-rose-600" : "bg-brand-600"}`} />
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap text-slate-700">
              {e.concept} · {e.stated_as}
            </span>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-xs text-slate-600">
        {t.events.length === 0 && <li>No mention in the clinical note: status {r.status}.</li>}
        {t.events.map((e, i) => (
          <li key={i} className="rounded-lg bg-canvas px-2 py-1">
            “{e.sentence}” →{" "}
            <b className="font-semibold text-navy-900">
              {e.negated
                ? "negated (event absent)"
                : e.months_ago === null
                  ? "no date stated, cannot place on the timeline"
                  : e.inside_window
                    ? "inside the window"
                    : "outside the window"}
            </b>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">
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
      <p className="rounded-2xl bg-violet-50 px-3 py-2 text-xs text-violet-700 ring-1 ring-violet-200">Self-verification: {v.corrections.join("; ")}</p>
    ) : null;
  }
  const passed = ver.status === "passed";
  return (
    <section className="rounded-2xl bg-gradient-to-br from-violet-50/70 to-white p-4 ring-1 ring-violet-100">
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-navy-900 uppercase">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-violet-100 text-violet-600">
          <Icon name="shield" className="h-3.5 w-3.5" />
        </span>
        Verification
        <span className={`rounded-full px-2 py-0.5 text-[10px] tracking-wider ${passed ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>
          {ver.status}
        </span>
      </h3>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        {ver.checks.map((c) => (
          <li key={c.check} className={`flex items-start gap-1.5 ${c.ok ? "text-slate-700" : "text-violet-700"}`}>
            <Icon name={c.ok ? "check" : "undo"} className={`mt-0.5 h-3 w-3 shrink-0 ${c.ok ? "text-emerald-500" : "text-violet-500"}`} strokeWidth={2.6} />
            {c.check}
          </li>
        ))}
      </ul>
      {v.corrections.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-violet-700">
          {v.corrections.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
