import { useCallback, useEffect, useState } from "react";
import { api, type OpportunityMap, type Verdict } from "../api";
import type { Shared } from "../App";
import { SummaryChips } from "../components/Evidence";
import { Button, Card, DecisionBadge, ErrorBox, Spinner, fmtValue } from "../components/ui";

const EDGE: Record<string, string> = {
  ELIGIBLE: "border-emerald-400",
  NOT_ELIGIBLE: "border-rose-300",
  NEEDS_REVIEW: "border-amber-400",
};
const DEMO = ["P042", "P040", "P041", "P043", "P006", "P007"];

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

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600">Patient</label>
          <select
            value={patientId}
            onChange={(e) => onPatient(e.target.value)}
            className="w-full max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm sm:w-auto"
          >
            {s.patients.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.id} · {pt.age ?? "?"}y {pt.sex} · {pt.conditions.slice(0, 2).join(", ")}
                {DEMO.includes(pt.id) ? "  ★ demo" : ""}
              </option>
            ))}
          </select>
          <Button variant="ghost" onClick={load} disabled={busy}>
            Re-screen all trials
          </Button>
          <Button variant="ghost" onClick={reset} disabled={busy}>
            Reset to benchmark record
          </Button>
          {busy && <Spinner label="Screening against every trial…" />}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Demo patients: P042 (one of each outcome), P040 eligible, P041 not eligible, P043 needs review, P006 implausible
          HbA1c, P007 contradiction.
        </p>
      </Card>
      <ErrorBox error={error} />

      {p && map && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={`Patient ${p.id}`}>
            <p className="text-sm">
              {p.age ?? "?"} years · {p.sex} · pregnant: {fmtValue(p.pregnant)}
            </p>
            <p className="mt-1 text-sm text-slate-700">{p.conditions.join(", ") || "no conditions"}</p>
            <p className="text-xs text-slate-500">Medications: {p.medications.join(", ") || "none"}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {["hba1c", "egfr", "bmi", "systolic_bp", "fasting_glucose", "weight"].map((k) => (
                <div key={k} className="flex justify-between border-b border-slate-100 py-0.5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className={p.labs[k] === undefined || p.labs[k] === null ? "text-amber-700" : "tabular-nums"}>
                    {lab(p.labs[k])}
                  </dd>
                </div>
              ))}
            </dl>
            {map.anomaly?.outlier && (
              <p
                className={`mt-3 rounded px-2 py-1 text-xs ${
                  map.anomaly.implausible ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"
                }`}
              >
                {map.anomaly.implausible ? "Implausible value" : "Advisory outlier (Isolation Forest)"}:{" "}
                {map.anomaly.reasons.join("; ")}
              </p>
            )}
            <h4 className="mt-3 text-xs font-semibold uppercase text-slate-500">Clinical note</h4>
            <p className="text-sm italic text-slate-700">{p.notes || "—"}</p>
          </Card>

          <div className="lg:col-span-2">
            <Card title="Trial opportunity map">
              <div className="grid gap-3 sm:grid-cols-2">
                {map.trials.map((t) => (
                  <button
                    key={t.trial_id}
                    onClick={() => openVerdict(t.verdict)}
                    className={`rounded-xl border-2 bg-white p-3 text-left transition hover:shadow-md ${EDGE[t.decision]}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs text-slate-500">{t.trial_id}</p>
                        <p className="text-sm font-semibold leading-snug">{t.condition}</p>
                      </div>
                      <DecisionBadge d={t.decision} />
                    </div>
                    <div className="mt-2">
                      <SummaryChips s={t} />
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full bg-slate-700" style={{ width: `${t.completeness * 100}%` }} />
                    </div>
                    {t.decision === "NOT_ELIGIBLE" && t.why_not[0] && (
                      <p className="mt-2 text-xs text-rose-800">
                        Blocked by [{t.why_not[0].section}] {t.why_not[0].criterion}
                        {t.why_not.length > 1 && ` +${t.why_not.length - 1} more`}
                        {t.why_not[0].counterfactual && (
                          <span className="block text-sky-800">{t.why_not[0].counterfactual}</span>
                        )}
                      </p>
                    )}
                    {t.decision === "NEEDS_REVIEW" && t.next_best_evidence[0] && (
                      <p className="mt-2 text-xs text-amber-900">
                        <b>Next best evidence ({t.next_best_evidence[0].impact}):</b> {t.next_best_evidence[0].request}
                      </p>
                    )}
                    {t.decision === "ELIGIBLE" && (
                      <p className="mt-2 text-xs text-emerald-800">All {t.total} criteria satisfied.</p>
                    )}
                    <p className="mt-2 text-[11px] text-slate-400">Click for evidence →</p>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
