import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Metrics } from "../api";
import { Button, Card, ErrorBox, Spinner } from "../components/ui";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);
const SEV: Record<string, { label: string; cls: string }> = {
  safe: { label: "safe (sent to human review)", cls: "bg-amber-100 text-amber-900" },
  missed_eligible: { label: "missed eligible patient", cls: "bg-sky-100 text-sky-900" },
  unsafe: { label: "unsafe (false eligible)", cls: "bg-rose-100 text-rose-900" },
  overconfident: { label: "overconfident exclusion", cls: "bg-slate-200 text-slate-800" },
};
const NICE: Record<string, string> = { ELIGIBLE: "Eligible", NOT_ELIGIBLE: "Not eligible", NEEDS_REVIEW: "Needs review" };

export default function Accuracy() {
  const [m, setM] = useState<Metrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (refresh = false, baseline = false) => {
    setBusy(true);
    setError(null);
    api
      .metrics(refresh, baseline)
      .then(setM)
      .catch((e) => setError(String(e.message)))
      .finally(() => setBusy(false));
  };
  useEffect(() => load(), []);

  if (!m) return busy ? <Spinner label="Screening every patient against every trial…" /> : <ErrorBox error={error} />;
  const pass = m.accuracy >= m.target;
  const max = Math.max(...m.confusion_matrix.flat(), 1);

  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <p className="text-xs uppercase text-slate-500">Accuracy</p>
          <p className={`text-4xl font-bold tabular-nums ${pass ? "text-emerald-600" : "text-rose-600"}`}>{pct(m.accuracy)}</p>
          <p className="text-xs text-slate-500">
            {m.correct}/{m.n} labeled pairs · target {pct(m.target)} {pass ? "✓" : "✗"}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-slate-500">Precision (eligible)</p>
          <p className="text-3xl font-bold tabular-nums">{pct(m.precision)}</p>
          <p className="text-xs text-slate-500">Of patients we call eligible, share truly eligible</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-slate-500">Recall (eligible)</p>
          <p className="text-3xl font-bold tabular-nums">{pct(m.recall)}</p>
          <p className="text-xs text-slate-500">Of truly eligible patients, share we found</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-slate-500">F1 (eligible) · macro F1</p>
          <p className="text-3xl font-bold tabular-nums">{pct(m.f1)}</p>
          <p className="text-xs text-slate-500">macro F1 across 3 classes: {pct(m.macro_f1)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-slate-500">Explanation clarity</p>
          <p className="text-3xl font-bold tabular-nums">{m.judge.avg_clarity ?? "—"} / 5</p>
          <p className="text-xs text-slate-500">
            {m.judge.mode === "llm" ? "LLM-as-judge" : "rubric judge (no LLM)"} · {m.judge.n} rationales
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => load(true)} disabled={busy}>
          Re-run evaluation
        </Button>
        <Button variant="ghost" onClick={() => load(true, true)} disabled={busy}>
          Compare with pure-LLM baseline
        </Button>
        {busy && <Spinner label="Evaluating…" />}
        <span className="text-xs text-slate-500">Mode: {m.mode} · {m.seconds}s</span>
      </div>

      {m.relevant && (
        <Card title="Condition-relevant pairs only">
          <div className="flex flex-wrap items-baseline gap-6 text-sm">
            <span>
              Accuracy <b className="text-2xl tabular-nums">{pct(m.relevant.accuracy)}</b> on {m.relevant.n} pairs
            </span>
            <span>F1 (eligible) <b>{pct(m.relevant.f1)}</b></span>
            <span>macro F1 <b>{pct(m.relevant.macro_f1)}</b></span>
            <span className="text-xs text-slate-500">{m.relevant.description}</span>
          </div>
        </Card>
      )}

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
        Dataset: {m.dataset?.patients} synthetic patients × {m.dataset?.trials} trials = {m.dataset?.labeled_pairs} labeled
        pairs ({m.dataset && Object.entries(m.dataset.label_mix).map(([k, v]) => `${v} ${k}`).join(", ")}). Labels come from
        independent ground-truth functions in generate.py. Read the headline with care: most pairs are NOT_ELIGIBLE because
        the patient lacks the trial's condition, so the condition-relevant score and per-class F1 matter more. In offline
        mode the parser and note reader were written for these protocol phrasings; connect the event model and upload a new
        protocol to test generalisation. The offline clarity judge is a fixed rubric, not an independent model.
      </p>

      {m.baseline && (
        <Card title="Hybrid vs pure-LLM baseline">
          {m.baseline.available ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-xs uppercase text-emerald-800">Hybrid: rules decide, LLM reads</p>
                <p className="text-2xl font-bold tabular-nums">{pct(m.accuracy)}</p>
                <p className="text-xs">F1 {pct(m.f1)} · macro F1 {pct(m.macro_f1)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-3">
                <p className="text-xs uppercase text-slate-600">Pure LLM, no rule engine</p>
                <p className="text-2xl font-bold tabular-nums">{pct(m.baseline.accuracy)}</p>
                <p className="text-xs">
                  F1 {pct(m.baseline.f1)} · macro F1 {pct(m.baseline.macro_f1)} · {m.baseline.n} pairs
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{m.baseline.reason}</p>
          )}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Confusion matrix (rows = expected, columns = predicted)">
          <table className="w-full text-center text-sm">
            <thead>
              <tr>
                <th />
                {m.labels.map((l) => (
                  <th key={l} className="pb-1 text-xs font-medium text-slate-500">{NICE[l]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.confusion_matrix.map((row, i) => (
                <tr key={i}>
                  <th className="pr-2 text-right text-xs font-medium text-slate-500">{NICE[m.labels[i]]}</th>
                  {row.map((c, j) => (
                    <td key={j} className="p-1">
                      <div
                        className={`rounded-md py-3 font-semibold tabular-nums ${i === j ? "text-emerald-950" : c ? "text-rose-950" : "text-slate-400"}`}
                        style={{
                          background: i === j ? `rgba(16,185,129,${0.15 + (0.6 * c) / max})` : c ? `rgba(244,63,94,${0.2 + (0.6 * c) / max})` : "#f8fafc",
                        }}
                      >
                        {c}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <table className="mt-3 w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th>Class</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1</th>
                <th>Support</th>
              </tr>
            </thead>
            <tbody>
              {m.labels.map((l) => (
                <tr key={l}>
                  <td>{NICE[l]}</td>
                  <td>{pct(m.per_class[l].precision)}</td>
                  <td>{pct(m.per_class[l].recall)}</td>
                  <td>{pct(m.per_class[l].f1)}</td>
                  <td>{m.per_class[l].support}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Accuracy by trial">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={Object.entries(m.per_trial).map(([k, v]) => ({ trial: k, accuracy: +(v.accuracy * 100).toFixed(1) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="trial" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Bar dataKey="accuracy" fill="#0f172a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Clarity scores:{" "}
            {Object.entries(m.judge.distribution)
              .map(([k, v]) => `${k}★ ${v}`)
              .join(" · ")}
          </p>
        </Card>
      </div>

      {m.core && m.stress && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Core benchmark">
            <p className="text-3xl font-bold tabular-nums text-emerald-600">{pct(m.core.accuracy)}</p>
            <p className="text-xs text-slate-500">
              {m.core.correct}/{m.core.n} pairs · {m.core.description}
            </p>
          </Card>
          <Card title="Hard-case stress set">
            <p className="text-3xl font-bold tabular-nums text-amber-600">{pct(m.stress.accuracy)}</p>
            <p className="text-xs text-slate-500">
              {m.stress.correct}/{m.stress.n} pairs · {m.stress.description}
            </p>
          </Card>
        </div>
      )}

      <Card title={`Mismatches (${m.mismatches.length})`}>
        {m.failure_summary && m.mismatches.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {Object.entries(m.failure_summary).map(([k, v]) => (
              <span key={k} className={`rounded-full px-2 py-0.5 font-semibold ${SEV[k]?.cls ?? "bg-slate-100"}`}>
                {v} {SEV[k]?.label ?? k}
              </span>
            ))}
          </div>
        )}
        {m.mismatches.length === 0 ? (
          <p className="text-sm text-slate-500">No mismatches against the labeled set.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th>Patient</th>
                <th>Trial</th>
                <th>Expected</th>
                <th>Predicted</th>
                <th>Severity</th>
                <th>Root cause (label note)</th>
              </tr>
            </thead>
            <tbody>
              {m.mismatches.map((x) => (
                <tr key={x.patient_id + x.trial_id} className="border-t border-slate-100 align-top">
                  <td className="py-1">{x.patient_id}</td>
                  <td>{x.trial_id}</td>
                  <td>{x.expected}</td>
                  <td className="text-rose-700">{x.predicted}</td>
                  <td>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${SEV[x.severity]?.cls ?? ""}`}>
                      {SEV[x.severity]?.label ?? x.severity}
                    </span>
                  </td>
                  <td className="text-xs text-slate-600">{x.label_comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
