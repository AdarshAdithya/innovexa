import { useCallback, useEffect, useState } from "react";
import { api, type OpportunityMap, type Verdict } from "../api";
import type { Shared } from "../App";
import { SummaryChips } from "../components/Evidence";
import { Button, Card, DECISION_META, DecisionBadge, ErrorBox, Icon, PageHeader, Ring, Skeleton, Spinner, fmtValue } from "../components/ui";

const EDGE: Record<string, string> = {
  ELIGIBLE: "ring-emerald-300 hover:ring-emerald-400",
  NOT_ELIGIBLE: "ring-rose-200 hover:ring-rose-300",
  NEEDS_REVIEW: "ring-amber-300 hover:ring-amber-400",
};
const DEMO = ["P042", "P040", "P041", "P043", "P006", "P007"];
const LAB_LABEL: Record<string, string> = {
  hba1c: "HbA1c",
  egfr: "eGFR",
  bmi: "BMI",
  systolic_bp: "Systolic BP",
  fasting_glucose: "Glucose",
  weight: "Weight",
};

function lab(v: unknown): string {
  if (v === null || v === undefined) return "missing";
  if (typeof v === "object") {
    const o = v as { value: number; unit: string };
    return `${o.value} ${o.unit}`;
  }
  return String(v);
}

export default function PatientMap({ s, patientId, onPatient }: { s: Shared; patientId: string; onPatient: (id: string) => void }) {
  const [map, setMap] = useState<OpportunityMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    setError(null);
    api
      .opportunities(patientId)
      .then(setMap)
      .catch((e) => setError(String(e.message)))
      .finally(() => setBusy(false));
  }, [patientId]);

  useEffect(() => load(), [load]);

  async function reset() {
    await api.resetPatient(patientId).catch((e) => setError(String(e.message)));
    load();
    s.refresh();
  }

  const openVerdict = (v: Verdict) => s.open(v, () => load());
  const p = map?.patient;
  const counts = { ELIGIBLE: 0, NOT_ELIGIBLE: 0, NEEDS_REVIEW: 0 };
  map?.trials.forEach((t) => counts[t.decision]++);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Patient intelligence"
        title="Trial opportunity map"
        subtitle="One patient screened against every active protocol, with the evidence that decides each match."
        right={busy && <Spinner label="Screening against every trial…" />}
      />

      <Card pad="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="w-full sm:w-auto sm:min-w-80">
            <span className="field-label">Patient</span>
            <select value={patientId} onChange={(e) => onPatient(e.target.value)} className="field">
              {s.patients.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.id} · {pt.age ?? "?"}y {pt.sex} · {pt.conditions.slice(0, 2).join(", ")}
                  {DEMO.includes(pt.id) ? "  ★ demo" : ""}
                </option>
              ))}
            </select>
          </label>
          <Button variant="ghost" icon="refresh" onClick={load} disabled={busy}>
            Re-screen all trials
          </Button>
          <Button variant="ghost" icon="undo" onClick={reset} disabled={busy}>
            Reset to benchmark record
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <span className="mr-1">Demo patients:</span>
          {[
            ["P042", "one of each outcome"],
            ["P040", "eligible"],
            ["P041", "not eligible"],
            ["P043", "needs review"],
            ["P006", "implausible HbA1c"],
            ["P007", "contradiction"],
          ].map(([id, what]) => (
            <button
              key={id}
              onClick={() => onPatient(id)}
              className={`rounded-full px-2.5 py-1 font-medium ring-1 transition ${
                patientId === id ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-600 ring-navy-900/10 hover:bg-brand-50"
              }`}
            >
              <b>{id}</b> {what}
            </button>
          ))}
        </div>
      </Card>
      <ErrorBox error={error} />

      {!map && busy && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96" />
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
        </div>
      )}

      {p && map && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="surface animate-rise overflow-hidden">
            <div className="bg-gradient-to-br from-navy-900 to-navy-700 p-5 text-white">
              <div className="flex items-center gap-3">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 font-display text-lg font-extrabold text-lime-400 ring-1 ring-white/15">
                  {p.id.replace(/\D/g, "").slice(-3)}
                </span>
                <div>
                  <p className="text-[10px] font-bold tracking-[0.16em] text-white/60 uppercase">Patient</p>
                  <p className="font-display text-2xl font-extrabold">{p.id}</p>
                  <p className="text-sm text-white/75">
                    {p.age ?? "?"} years · {p.sex} · pregnant: {fmtValue(p.pregnant)}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {(["ELIGIBLE", "NEEDS_REVIEW", "NOT_ELIGIBLE"] as const).map((k) => (
                  <div key={k} className="rounded-xl bg-white/10 py-2">
                    <p className="font-display text-xl font-bold tabular-nums" style={{ color: k === "NOT_ELIGIBLE" ? "#fda4af" : k === "ELIGIBLE" ? "#8fe39a" : "#fcd34d" }}>
                      {counts[k]}
                    </p>
                    <p className="text-[9.5px] tracking-wider text-white/60 uppercase">{DECISION_META[k].label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="field-label">Conditions</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.conditions.length ? (
                    p.conditions.map((c) => (
                      <span key={c} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600">
                        {c}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">no conditions</span>
                  )}
                </div>
              </div>
              <div>
                <p className="field-label">Medications</p>
                <p className="text-xs text-slate-600">{p.medications.join(", ") || "none"}</p>
              </div>
              <dl className="grid grid-cols-2 gap-2">
                {["hba1c", "egfr", "bmi", "systolic_bp", "fasting_glucose", "weight"].map((k) => {
                  const missing = p.labs[k] === undefined || p.labs[k] === null;
                  return (
                    <div key={k} className={`rounded-xl px-3 py-2 ${missing ? "bg-amber-50 ring-1 ring-amber-100" : "bg-canvas"}`}>
                      <dt className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{LAB_LABEL[k]}</dt>
                      <dd className={`font-display text-sm font-bold ${missing ? "text-amber-700" : "text-navy-900 tabular-nums"}`}>{lab(p.labs[k])}</dd>
                    </div>
                  );
                })}
              </dl>
              {map.anomaly?.outlier && (
                <p
                  className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${
                    map.anomaly.implausible ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                  }`}
                >
                  <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {map.anomaly.implausible ? "Implausible value" : "Advisory outlier (Isolation Forest)"}: {map.anomaly.reasons.join("; ")}
                  </span>
                </p>
              )}
              <div>
                <p className="field-label">Clinical note</p>
                <p className="rounded-xl bg-canvas px-3 py-2 text-sm leading-relaxed text-slate-700 italic">{p.notes || "—"}</p>
              </div>
            </div>
          </section>

          <div className="min-w-0 lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              {map.trials.map((t, i) => (
                <button
                  key={t.trial_id}
                  onClick={() => openVerdict(t.verdict)}
                  className={`surface animate-rise group flex flex-col p-4 text-left ring-2 transition duration-300 hover:-translate-y-0.5 hover:shadow-lift ${EDGE[t.decision]}`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-brand-600">{t.trial_id}</span>
                      <p className="mt-2 font-display text-base leading-snug font-bold text-navy-900">{t.condition}</p>
                      <p className="line-clamp-1 text-[11px] text-slate-400">{t.title}</p>
                    </div>
                    <DecisionBadge d={t.decision} />
                  </div>
                  <div className="mt-3 flex w-full items-center gap-3">
                    <Ring value={t.completeness} size={44} stroke={5} color={DECISION_META[t.decision].hex}>
                      <span className="text-[10px] font-bold tabular-nums">{Math.round(t.completeness * 100)}%</span>
                    </Ring>
                    <SummaryChips s={t} />
                  </div>
                  {t.decision === "NOT_ELIGIBLE" && t.why_not[0] && (
                    <div className="mt-3 w-full rounded-xl bg-rose-50/70 px-3 py-2 text-xs text-rose-900">
                      <p>
                        <b>Blocked by</b> [{t.why_not[0].section}] {t.why_not[0].criterion}
                        {t.why_not.length > 1 && ` +${t.why_not.length - 1} more`}
                      </p>
                      {t.why_not[0].counterfactual && (
                        <p className="mt-1 flex items-start gap-1 text-brand-600">
                          <Icon name="sparkle" className="mt-0.5 h-3 w-3 shrink-0" /> {t.why_not[0].counterfactual}
                        </p>
                      )}
                    </div>
                  )}
                  {t.decision === "NEEDS_REVIEW" && t.next_best_evidence[0] && (
                    <div className="mt-3 w-full rounded-xl bg-navy-900 px-3 py-2 text-xs text-white">
                      <p className="text-[9.5px] font-bold tracking-widest text-lime-400 uppercase">
                        Next best evidence · {t.next_best_evidence[0].impact}
                      </p>
                      <p className="mt-0.5 font-semibold">{t.next_best_evidence[0].request}</p>
                    </div>
                  )}
                  {t.decision === "ELIGIBLE" && (
                    <p className="mt-3 flex w-full items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                      <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.6} /> All {t.total} criteria satisfied.
                    </p>
                  )}
                  <span className="mt-auto flex items-center gap-1 pt-3 text-[11px] font-semibold text-slate-400 transition group-hover:text-brand-600">
                    Open evidence <Icon name="arrowRight" className="h-3 w-3 transition group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
