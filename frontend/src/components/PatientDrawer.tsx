import { useEffect, useState } from "react";
import { api, type Patient, type Ranking, type Verdict } from "../api";
import { ConfidenceBar, DecisionBadge, StatusPill, fmtValue } from "./ui";

export default function PatientDrawer({
  verdict,
  patient,
  onClose,
}: {
  verdict: Verdict;
  patient: Patient | undefined;
  onClose: () => void;
}) {
  const [rank, setRank] = useState<Ranking[] | null>(null);

  useEffect(() => {
    setRank(null);
    api.rankings(verdict.patient_id).then(setRank).catch(() => setRank([]));
  }, [verdict.patient_id]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {verdict.patient_id} <span className="text-slate-400">→</span> {verdict.trial_id}
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

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <DecisionBadge d={verdict.decision} />
          <ConfidenceBar value={verdict.confidence} />
        </div>

        {verdict.flags.length > 0 && (
          <div className="mb-4 space-y-1">
            {verdict.flags.map((f) => (
              <div key={f} className="rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-900 ring-1 ring-amber-200">
                ⚠ {f}
              </div>
            ))}
          </div>
        )}

        <h3 className="mb-1 text-sm font-semibold text-slate-700">Rationale</h3>
        <p className="mb-2 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">{verdict.rationale}</p>
        {verdict.citations.length > 0 && (
          <p className="mb-4 text-xs text-slate-500">Cited protocol sections: {verdict.citations.join(" · ")}</p>
        )}
        {verdict.counterfactuals.length > 0 && (
          <p className="mb-4 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">💡 {verdict.counterfactuals.join("; ")}</p>
        )}
        {verdict.corrections.length > 0 && (
          <p className="mb-4 text-xs text-violet-700">Self-verification: {verdict.corrections.join("; ")}</p>
        )}

        <h3 className="mb-2 text-sm font-semibold text-slate-700">Criteria</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 pr-2">Section</th>
                <th className="py-1 pr-2">Criterion</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2">Patient value</th>
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
                  <td className="py-1.5 text-xs text-slate-500">{r.evaluated_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-5 mb-2 text-sm font-semibold text-slate-700">Best-matching trials</h3>
        {!rank ? (
          <p className="text-sm text-slate-400">Ranking…</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {rank.map((r) => (
              <li key={r.trial_id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-slate-50">
                <span>
                  <span className="font-medium">{r.trial_id}</span>{" "}
                  <span className="text-xs text-slate-500">similarity {r.similarity.toFixed(2)}</span>
                </span>
                <DecisionBadge d={r.decision} />
              </li>
            ))}
          </ol>
        )}

        {patient && (
          <>
            <h3 className="mt-5 mb-1 text-sm font-semibold text-slate-700">Clinical note (synthetic)</h3>
            <p className="rounded-lg bg-slate-50 p-3 text-sm italic text-slate-700">{patient.notes || "—"}</p>
          </>
        )}
      </aside>
    </div>
  );
}
