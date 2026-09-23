import { useEffect, useState } from "react";
import { api, type Patient, type Ranking, type Verdict } from "../api";
import {
  NextBestEvidence,
  ProvenanceGraph,
  TemporalTimeline,
  VerdictBanner,
  VerificationPanel,
  WhyNotPanel,
} from "./Evidence";
import EvidenceForm from "./EvidenceForm";
import { DecisionBadge, StatusPill, fmtValue } from "./ui";

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

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-3xl space-y-5 overflow-y-auto bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Screening evidence</p>
            <h2 className="text-lg font-semibold">
              {verdict.patient_id} <span className="text-slate-400">×</span> {verdict.trial_id}
            </h2>
            {patient && (
              <p className="text-sm text-slate-500">
                {patient.age ?? "?"} y · {patient.sex ?? "?"} · {patient.conditions.join(", ") || "no conditions"}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>

        {previous && previous.decision !== verdict.decision && (
          <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-200">
            Re-screened with the new evidence: <DecisionBadge d={previous.decision} /> →{" "}
            <DecisionBadge d={verdict.decision} />
          </div>
        )}
        {error && <p className="text-sm text-rose-700">{error}</p>}

        <VerdictBanner v={verdict} />

        {verdict.flags.length > 0 && (
          <div className="space-y-1">
            {verdict.flags.map((f) => (
              <div key={f} className="rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-900 ring-1 ring-amber-200">
                ⚠ {f}
              </div>
            ))}
          </div>
        )}

        <NextBestEvidence items={verdict.next_best_evidence}>
          <EvidenceForm patientId={verdict.patient_id} items={verdict.next_best_evidence} onSaved={rescreen} />
        </NextBestEvidence>

        <WhyNotPanel items={verdict.why_not} />

        <ProvenanceGraph v={verdict} />

        {timelines.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-800">Temporal reasoning</h3>
            {timelines.map((r) => (
              <TemporalTimeline key={r.rule_id} r={r} />
            ))}
          </section>
        )}

        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-800">Rationale</h3>
          <p className="rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">{verdict.rationale}</p>
          {verdict.citations.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">Cited protocol sections: {verdict.citations.join(" · ")}</p>
          )}
        </section>

        <VerificationPanel v={verdict} />

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">All criteria</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1 pr-2">Section</th>
                  <th className="py-1 pr-2">Criterion</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1 pr-2">Patient value</th>
                  <th className="py-1 pr-2">Comparison</th>
                  <th className="py-1">By</th>
                </tr>
              </thead>
              <tbody>
                {verdict.results.map((r) => (
                  <tr key={r.rule_id} className="border-t border-slate-100 align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-xs text-slate-500">{r.section}</td>
                    <td className="py-1.5 pr-2">
                      {r.source_text}
                      {r.detail && r.status === "UNKNOWN" && <div className="text-xs text-amber-700">{r.detail}</div>}
                    </td>
                    <td className="py-1.5 pr-2">
                      <StatusPill s={r.status} />
                    </td>
                    <td className="py-1.5 pr-2 text-xs text-slate-700">{fmtValue(r.patient_value)}</td>
                    <td className="py-1.5 pr-2 font-mono text-[11px] text-slate-600">{r.comparison ?? "—"}</td>
                    <td className="py-1.5 text-xs text-slate-500">{r.evaluated_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Best-matching trials</h3>
          {!rank ? (
            <p className="text-sm text-slate-400">Ranking…</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {rank.map((r) => (
                <li key={r.trial_id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-slate-50">
                  <span>
                    <span className="font-medium">{r.trial_id}</span>{" "}
                    <span className="text-xs text-slate-500">text similarity {r.similarity.toFixed(2)}</span>
                  </span>
                  <DecisionBadge d={r.decision} />
                </li>
              ))}
            </ol>
          )}
        </section>

        {patient && (
          <section>
            <h3 className="mb-1 text-sm font-semibold text-slate-800">Clinical note (synthetic, untrusted input)</h3>
            <p className="rounded-lg bg-slate-50 p-3 text-sm italic text-slate-700">{patient.notes || "—"}</p>
          </section>
        )}
      </aside>
    </div>
  );
}
