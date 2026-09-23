import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Metrics } from "../api";
import { Button, Card, ErrorBox, Icon, LoadingPanel, PageHeader, Ring, Spinner } from "../components/ui";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);
const SEV: Record<string, { label: string; cls: string }> = {
  safe: { label: "safe (sent to human review)", cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  missed_eligible: { label: "missed eligible patient", cls: "bg-sky-50 text-sky-900 ring-sky-200" },
  unsafe: { label: "unsafe (false eligible)", cls: "bg-rose-50 text-rose-900 ring-rose-200" },
  overconfident: { label: "overconfident exclusion", cls: "bg-slate-100 text-slate-800 ring-slate-200" },
};
const NICE: Record<string, string> = { ELIGIBLE: "Eligible", NOT_ELIGIBLE: "Not eligible", NEEDS_REVIEW: "Needs review" };

function Metric({ label, value, hint, ring, color = "#1f6fe0", delay = 0 }: { label: string; value: string; hint: string; ring?: number | null; color?: string; delay?: number }) {
  return (
    <div className="surface surface-hover animate-rise flex items-center gap-4 p-4" style={{ animationDelay: `${delay}ms` }}>
      {ring !== undefined && (
        <Ring value={ring ?? 0} size={56} stroke={6} color={color}>
          <span className="text-[10px] font-bold text-slate-500 tabular-nums">{ring === null ? "—" : `${Math.round(ring * 100)}`}</span>
        </Ring>
      )}
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold tracking-[0.1em] text-slate-500 uppercase">{label}</p>
        <p className="font-display text-2xl font-extrabold text-navy-900 tabular-nums">{value}</p>
        <p className="text-[11px] leading-snug text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

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

  if (!m) return busy ? <LoadingPanel label="Screening every patient against every trial…" /> : <ErrorBox error={error} />;
  const pass = m.accuracy >= m.target;
  const max = Math.max(...m.confusion_matrix.flat(), 1);
  const trialData = Object.entries(m.per_trial).map(([k, v]) => ({ trial: k, accuracy: +(v.accuracy * 100).toFixed(1), n: v.n }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Evaluation lab"
        title="Accuracy & evaluation"
        subtitle="Every patient screened against every trial and scored against independent ground-truth labels."
        right={
          <>
            <Button variant="ghost" icon="refresh" onClick={() => load(true)} disabled={busy}>
              Re-run evaluation
            </Button>
            <Button variant="ghost" icon="layers" onClick={() => load(true, true)} disabled={busy}>
              Compare with pure-LLM baseline
            </Button>
          </>
        }
      />
      <ErrorBox error={error} />
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {busy && <Spinner label="Evaluating…" />}
        <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-navy-900/5">
          Mode: {m.mode} · {m.seconds}s
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_2fr]">
        <section className="animate-rise relative overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 p-6 text-white shadow-lift">
          <div className="pointer-events-none absolute -right-16 -bottom-16 h-56 w-56 rounded-full bg-aqua-500/25 blur-3xl" aria-hidden="true" />
          <p className="text-[10.5px] font-bold tracking-[0.16em] text-white/60 uppercase">Accuracy</p>
          <div className="mt-3 flex items-center gap-5">
            <Ring value={m.accuracy} size={112} stroke={10} color={pass ? "#8fe39a" : "#fb7185"} track="rgb(255 255 255 / 0.12)">
              <span className="font-display text-xl font-extrabold tabular-nums">{pct(m.accuracy)}</span>
            </Ring>
            <div>
              <p className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${pass ? "bg-lime-400 text-navy-950" : "bg-rose-400 text-white"}`}>
                <Icon name={pass ? "check" : "x"} className="h-3.5 w-3.5" strokeWidth={2.6} />
                target {pct(m.target)} {pass ? "✓" : "✗"}
              </p>
              <p className="mt-2 text-sm text-white/80">
                {m.correct}/{m.n} labeled pairs
              </p>
            </div>
          </div>
        </section>
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Precision (eligible)" value={pct(m.precision)} ring={m.precision} hint="Of patients we call eligible, share truly eligible" delay={40} />
          <Metric label="Recall (eligible)" value={pct(m.recall)} ring={m.recall} color="#1fb5c9" hint="Of truly eligible patients, share we found" delay={80} />
          <Metric label="F1 (eligible) · macro F1" value={pct(m.f1)} ring={m.f1} color="#10b981" hint={`macro F1 across 3 classes: ${pct(m.macro_f1)}`} delay={120} />
          <Metric
            label="Explanation clarity"
            value={`${m.judge.avg_clarity ?? "—"} / 5`}
            ring={m.judge.avg_clarity !== null ? m.judge.avg_clarity / 5 : null}
            color="#8b5cf6"
            hint={`${m.judge.mode === "llm" ? "LLM-as-judge" : "rubric judge (no LLM)"} · ${m.judge.n} rationales`}
            delay={160}
          />
        </div>
      </div>

      {m.relevant && (
        <Card title="Condition-relevant pairs only" subtitle={m.relevant.description}>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Accuracy", pct(m.relevant.accuracy), `on ${m.relevant.n} pairs`],
              ["F1 (eligible)", pct(m.relevant.f1), ""],
              ["macro F1", pct(m.relevant.macro_f1), ""],
            ].map(([k, v, h]) => (
              <div key={k} className="rounded-2xl bg-canvas px-4 py-3">
                <p className="text-[10.5px] font-semibold tracking-[0.1em] text-slate-500 uppercase">{k}</p>
                <p className="font-display text-2xl font-extrabold tabular-nums">{v}</p>
                {h && <p className="text-[11px] text-slate-500">{h}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Hybrid vs pure LLM */}
      <Card
        title="Hybrid vs pure LLM"
        subtitle="Rules decide and the LLM reads, compared with an LLM deciding on its own."
        className="bg-gradient-to-br from-white to-brand-50/50"
      >
        {m.baseline ? (
          m.baseline.available ? (
            <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-2xl bg-white p-4 ring-2 ring-emerald-300">
                <p className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-widest text-emerald-700 uppercase">
                  <Icon name="shield" className="h-3.5 w-3.5" /> Hybrid: rules decide, LLM reads
                </p>
                <p className="mt-1 font-display text-4xl font-extrabold tabular-nums">{pct(m.accuracy)}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-50">
                  <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-1000" style={{ width: `${m.accuracy * 100}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  F1 {pct(m.f1)} · macro F1 {pct(m.macro_f1)}
                </p>
              </div>
              <div className="grid place-items-center">
                <span className="rounded-full bg-navy-900 px-3 py-1 font-display text-xs font-bold text-white">VS</span>
              </div>
              <div className="rounded-2xl bg-white p-4 ring-1 ring-navy-900/10">
                <p className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-widest text-slate-600 uppercase">
                  <Icon name="sparkle" className="h-3.5 w-3.5" /> Pure LLM, no rule engine
                </p>
                <p className="mt-1 font-display text-4xl font-extrabold text-slate-600 tabular-nums">{pct(m.baseline.accuracy)}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-slate-400 transition-[width] duration-1000" style={{ width: `${(m.baseline.accuracy ?? 0) * 100}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  F1 {pct(m.baseline.f1)} · macro F1 {pct(m.baseline.macro_f1)} · {m.baseline.n} pairs
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{m.baseline.reason}</p>
          )
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-navy-900/5">
            <p className="text-sm text-slate-600">Run the comparison to score a pure-LLM baseline on the same labeled pairs.</p>
            <Button icon="layers" onClick={() => load(true, true)} disabled={busy}>
              Compare with pure-LLM baseline
            </Button>
          </div>
        )}
      </Card>

      <p className="rounded-2xl bg-white/70 px-4 py-3 text-xs leading-relaxed text-slate-600 ring-1 ring-navy-900/5">
        Dataset: {m.dataset?.patients} synthetic patients × {m.dataset?.trials} trials = {m.dataset?.labeled_pairs} labeled
        pairs ({m.dataset && Object.entries(m.dataset.label_mix).map(([k, v]) => `${v} ${k}`).join(", ")}). Labels come from
        independent ground-truth functions in generate.py. Read the headline with care: most pairs are NOT_ELIGIBLE because
        the patient lacks the trial's condition, so the condition-relevant score and per-class F1 matter more. In offline
        mode the parser and note reader were written for these protocol phrasings; connect the event model and upload a new
        protocol to test generalisation. The offline clarity judge is a fixed rubric, not an independent model.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Confusion matrix" subtitle="Rows = expected, columns = predicted.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] border-separate border-spacing-1.5 text-center text-sm">
              <thead>
                <tr>
                  <th />
                  {m.labels.map((l) => (
                    <th key={l} className="pb-1 text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase">
                      {NICE[l]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.confusion_matrix.map((row, i) => (
                  <tr key={i}>
                    <th className="pr-2 text-right text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase">{NICE[m.labels[i]]}</th>
                    {row.map((c, j) => (
                      <td key={j}>
                        <div
                          className={`animate-pop rounded-2xl py-5 font-display text-lg font-extrabold tabular-nums transition hover:scale-[1.03] ${
                            i === j ? "text-emerald-950" : c ? "text-rose-950" : "text-slate-300"
                          }`}
                          style={{
                            animationDelay: `${(i * 3 + j) * 40}ms`,
                            background: i === j ? `rgba(16,185,129,${0.12 + (0.55 * c) / max})` : c ? `rgba(244,63,94,${0.15 + (0.55 * c) / max})` : "#f3f7fc",
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
          </div>
          <table className="table-clean mt-4 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-2">Class</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1</th>
                <th>Support</th>
              </tr>
            </thead>
            <tbody>
              {m.labels.map((l) => (
                <tr key={l} className="border-t border-slate-50">
                  <td className="py-2 font-semibold text-navy-900">{NICE[l]}</td>
                  <td className="tabular-nums">{pct(m.per_class[l].precision)}</td>
                  <td className="tabular-nums">{pct(m.per_class[l].recall)}</td>
                  <td className="tabular-nums">{pct(m.per_class[l].f1)}</td>
                  <td className="tabular-nums">{m.per_class[l].support}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Accuracy by trial" subtitle="Share of labeled pairs predicted correctly per protocol.">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={trialData} barSize={40} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="acc-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#3b86f0" />
                    <stop offset="1" stopColor="#0b2447" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8f0fa" />
                <XAxis dataKey="trial" tick={{ fontSize: 11, fill: "#5b6f8c" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#eef4fe" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2eaf5", fontSize: 12 }} />
                <Bar dataKey="accuracy" fill="url(#acc-bar)" radius={[10, 10, 4, 4]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            Clarity scores:
            {Object.entries(m.judge.distribution).map(([k, v]) => (
              <span key={k} className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700 ring-1 ring-violet-100">
                {k}★ {v}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {m.core && m.stress && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Core benchmark" subtitle={m.core.description}>
            <div className="flex items-center gap-4">
              <Ring value={m.core.accuracy} size={64} stroke={7} color="#10b981">
                <Icon name="check" className="h-4 w-4 text-emerald-500" strokeWidth={2.6} />
              </Ring>
              <div>
                <p className="font-display text-3xl font-extrabold text-emerald-600 tabular-nums">{pct(m.core.accuracy)}</p>
                <p className="text-xs text-slate-500">
                  {m.core.correct}/{m.core.n} pairs
                </p>
              </div>
            </div>
          </Card>
          <Card title="Hard-case stress set" subtitle={m.stress.description}>
            <div className="flex items-center gap-4">
              <Ring value={m.stress.accuracy} size={64} stroke={7} color="#f59e0b">
                <Icon name="flask" className="h-4 w-4 text-amber-500" />
              </Ring>
              <div>
                <p className="font-display text-3xl font-extrabold text-amber-600 tabular-nums">{pct(m.stress.accuracy)}</p>
                <p className="text-xs text-slate-500">
                  {m.stress.correct}/{m.stress.n} pairs
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card title={`Mismatches (${m.mismatches.length})`} subtitle="Pairs where the prediction differs from the label.">
        {m.failure_summary && m.mismatches.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {Object.entries(m.failure_summary).map(([k, v]) => (
              <span key={k} className={`rounded-full px-2.5 py-0.5 font-semibold ring-1 ${SEV[k]?.cls ?? "bg-slate-100 ring-slate-200"}`}>
                {v} {SEV[k]?.label ?? k}
              </span>
            ))}
          </div>
        )}
        {m.mismatches.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <Icon name="check" className="h-4 w-4" /> No mismatches against the labeled set.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-clean w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-2">Patient</th>
                  <th>Trial</th>
                  <th>Expected</th>
                  <th>Predicted</th>
                  <th>Severity</th>
                  <th>Root cause (label note)</th>
                </tr>
              </thead>
              <tbody>
                {m.mismatches.map((x) => (
                  <tr key={x.patient_id + x.trial_id} className="border-t border-slate-50 align-top">
                    <td className="py-2 font-semibold">{x.patient_id}</td>
                    <td className="font-mono text-xs">{x.trial_id}</td>
                    <td className="text-xs">{x.expected}</td>
                    <td className="text-xs font-semibold text-rose-700">{x.predicted}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ${SEV[x.severity]?.cls ?? "ring-transparent"}`}>
                        {SEV[x.severity]?.label ?? x.severity}
                      </span>
                    </td>
                    <td className="text-xs text-slate-600">{x.label_comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
