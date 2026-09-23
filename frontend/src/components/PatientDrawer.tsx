import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Patient, type Ranking, type Verdict } from "../api";
import {
  CriteriaEvidence,
  NextBestEvidence,
  ProvenanceGraph,
  TemporalTimeline,
  VerdictBanner,
  VerificationPanel,
  WhyNotPanel,
} from "./Evidence";
import EvidenceForm from "./EvidenceForm";
import { DecisionBadge, Icon, fmtValue, type IconName } from "./ui";

const LAB_LABEL: Record<string, string> = {
  hba1c: "HbA1c",
  egfr: "eGFR",
  bmi: "BMI",
  systolic_bp: "Systolic BP",
  fasting_glucose: "Fasting glucose",
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

function Section({ id, title, icon, children }: { id: string; title: string; icon: IconName; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-40">
      <h3 className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-navy-900 uppercase">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function PatientDrawer({
  verdict: initial,
  patient: initialPatient,
  onClose,
  onChanged,
}: {
  verdict: Verdict;
  patient: Patient | undefined;
  onClose: () => void;
  onChanged?: (v: Verdict) => void;
}) {
  const [verdict, setVerdict] = useState(initial);
  const [patient, setPatient] = useState(initialPatient);
  const [rank, setRank] = useState<Ranking[] | null>(null);
  const [previous, setPrevious] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLElement>(null);

  useEffect(() => {
    setVerdict(initial);
    setPrevious(null);
  }, [initial]);

  useEffect(() => {
    if (initialPatient) setPatient(initialPatient);
  }, [initialPatient]);

  useEffect(() => {
    setRank(null);
    api.rankings(verdict.patient_id).then(setRank).catch(() => setRank([]));
  }, [verdict.patient_id, verdict.decision]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function rescreen() {
    try {
      const [v] = await api.screen(verdict.trial_id, [verdict.patient_id]);
      const ps = await api.patients();
      setPrevious(verdict);
      setVerdict(v);
      setPatient(ps.find((p) => p.id === v.patient_id));
      onChanged?.(v);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  const timelines = verdict.results.filter((r) => r.temporal);
  const jump = (id: string) => scroller.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const nav: [string, string][] = [
    ["pd-overview", "Overview"],
    ["pd-evidence", "Evidence"],
    ["pd-criteria", "Screening results"],
    ["pd-clinical", "Clinical data"],
    ["pd-notes", "Notes"],
    ["pd-trials", "Trials"],
  ];

  return (
    <div className="animate-fade fixed inset-0 z-40 flex justify-end bg-navy-950/30 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        ref={scroller}
        role="dialog"
        aria-modal="true"
        aria-label={`Screening evidence for ${verdict.patient_id} in ${verdict.trial_id}`}
        className="animate-slide-in h-full w-full max-w-3xl overflow-y-auto bg-canvas shadow-2xl sm:rounded-l-[2rem]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* sticky header */}
        <div className="sticky top-0 z-10 border-b border-navy-900/5 bg-white/90 px-5 pt-5 pb-3 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-navy-900 to-brand-600 font-display text-sm font-bold text-white">
              {verdict.patient_id.replace(/\D/g, "").slice(-3) || "P"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold tracking-[0.16em] text-slate-500 uppercase">Screening evidence</p>
              <h2 className="font-display text-xl font-extrabold text-navy-900">
                {verdict.patient_id} <span className="text-slate-300">×</span> {verdict.trial_id}
              </h2>
              {patient && (
                <p className="truncate text-sm text-slate-500">
                  {patient.age ?? "?"} y · {patient.sex ?? "?"} · {patient.conditions.join(", ") || "no conditions"}
                </p>
              )}
            </div>
            <DecisionBadge d={verdict.decision} />
            <button
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-500 ring-1 ring-navy-900/10 transition hover:bg-brand-50 hover:text-navy-900"
              aria-label="Close"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
          <nav aria-label="Drawer sections" className="-mx-1 mt-3 flex gap-1 overflow-x-auto pb-1">
            {nav.map(([id, label]) => (
              <button
                key={id}
                onClick={() => jump(id)}
                className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-navy-900/5 transition hover:bg-navy-900 hover:text-white"
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="space-y-6 p-5">
          <div id="pd-overview" className="scroll-mt-40 space-y-3">
            {previous && previous.decision !== verdict.decision && (
              <div className="animate-pop flex flex-wrap items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-navy-900 ring-1 ring-brand-100">
                <Icon name="refresh" className="h-4 w-4 text-brand-600" />
                Re-screened with the new evidence: <DecisionBadge d={previous.decision} />
                <Icon name="arrowRight" className="h-3.5 w-3.5 text-slate-400" />
                <DecisionBadge d={verdict.decision} />
              </div>
            )}
            {error && <p className="text-sm text-rose-700">{error}</p>}

            <VerdictBanner v={verdict} />

            {verdict.flags.length > 0 && (
              <div className="space-y-1.5">
                {verdict.flags.map((f) => (
                  <div key={f} className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3.5 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                    <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {f}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div id="pd-evidence" className="scroll-mt-40 space-y-6">
            <NextBestEvidence items={verdict.next_best_evidence}>
              <EvidenceForm patientId={verdict.patient_id} items={verdict.next_best_evidence} onSaved={rescreen} />
            </NextBestEvidence>

            <WhyNotPanel items={verdict.why_not} />

            <div className="surface p-4">
              <ProvenanceGraph v={verdict} />
            </div>

            {timelines.length > 0 && (
              <Section id="pd-temporal" title="Temporal reasoning" icon="clock">
                <div className="space-y-2">
                  {timelines.map((r) => (
                    <TemporalTimeline key={r.rule_id} r={r} />
                  ))}
                </div>
              </Section>
            )}

            <Section id="pd-rationale" title="Rationale" icon="note">
              <p className="rounded-2xl bg-white p-4 text-sm leading-relaxed text-navy-900 ring-1 ring-navy-900/5">{verdict.rationale}</p>
              {verdict.citations.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  Cited protocol sections:
                  {verdict.citations.map((c) => (
                    <span key={c} className="rounded-full bg-white px-2 py-0.5 font-mono text-[10.5px] text-slate-600 ring-1 ring-navy-900/10">
                      {c}
                    </span>
                  ))}
                </p>
              )}
            </Section>

            <VerificationPanel v={verdict} />
          </div>

          <Section id="pd-criteria" title={`All criteria (${verdict.results.length})`} icon="clipboard">
            <CriteriaEvidence results={verdict.results} />
          </Section>

          {patient && (
            <Section id="pd-clinical" title="Clinical data" icon="heart">
              <div className="surface space-y-4 p-4">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    ["Age", patient.age ?? "—"],
                    ["Sex", patient.sex ?? "—"],
                    ["Pregnant", fmtValue(patient.pregnant)],
                  ].map(([k, val]) => (
                    <div key={k as string} className="rounded-xl bg-canvas px-3 py-2">
                      <dt className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{k}</dt>
                      <dd className="font-display text-sm font-bold text-navy-900">{val}</dd>
                    </div>
                  ))}
                  {Object.entries(patient.labs).map(([k, val]) => (
                    <div key={k} className="rounded-xl bg-canvas px-3 py-2">
                      <dt className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{LAB_LABEL[k] ?? k}</dt>
                      <dd className={`font-display text-sm font-bold tabular-nums ${val === null || val === undefined ? "text-amber-600" : "text-navy-900"}`}>{lab(val)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="field-label">Conditions</p>
                    <div className="flex flex-wrap gap-1.5">
                      {patient.conditions.length ? (
                        patient.conditions.map((c) => (
                          <span key={c} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600">
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">none</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="field-label">Medications</p>
                    <div className="flex flex-wrap gap-1.5">
                      {patient.medications.length ? (
                        patient.medications.map((m) => (
                          <span key={m} className="inline-flex items-center gap-1 rounded-full bg-aqua-100/70 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                            <Icon name="pill" className="h-3 w-3" /> {m}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">none</span>
                      )}
                    </div>
                  </div>
                </div>
                {patient.anomaly?.outlier && (
                  <div
                    className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${
                      patient.anomaly.implausible ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                    }`}
                  >
                    <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <b>{patient.anomaly.implausible ? "Implausible value" : "Advisory outlier (Isolation Forest)"}:</b> {patient.anomaly.reasons.join("; ")}
                    </span>
                  </div>
                )}
              </div>
            </Section>
          )}

          {patient && (
            <Section id="pd-notes" title="Clinical note (synthetic, untrusted input)" icon="note">
              <p className="rounded-2xl bg-white p-4 text-sm leading-relaxed text-slate-700 italic ring-1 ring-navy-900/5">{patient.notes || "—"}</p>
            </Section>
          )}

          <Section id="pd-trials" title="Best-matching trials" icon="target">
            {!rank ? (
              <div className="space-y-2">
                <div className="skeleton h-10" />
                <div className="skeleton h-10" />
              </div>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {rank.map((r, i) => (
                  <li key={r.trial_id} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 ring-1 ring-navy-900/5">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-canvas font-mono text-[11px] font-semibold text-slate-500">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-navy-900">{r.trial_id}</span>{" "}
                      <span className="text-xs text-slate-500">text similarity {r.similarity.toFixed(2)}</span>
                      <span className="mt-1 block h-1 w-full max-w-40 overflow-hidden rounded-full bg-mist">
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.max(0, Math.min(1, r.similarity)) * 100}%` }} />
                      </span>
                    </span>
                    <DecisionBadge d={r.decision} />
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </aside>
    </div>
  );
}
