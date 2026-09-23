import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Summary } from "../api";
import type { Shared, Tab } from "../App";
import { Button, Card, CountUp, DECISION_META, Icon, type IconName } from "../components/ui";

function lab(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    const o = v as { value: number; unit: string };
    return `${o.value} ${o.unit}`;
  }
  return String(v);
}

function Kpi({
  label,
  value,
  tone = "text-navy-900",
  hint,
  icon,
  delay = 0,
}: {
  label: string;
  value: number | string;
  tone?: string;
  hint?: string;
  icon: IconName;
  delay?: number;
}) {
  return (
    <div className="surface surface-hover animate-rise px-4 py-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
        <Icon name={icon} className="h-4 w-4 text-slate-300" />
      </div>
      <p className={`mt-1 font-display text-3xl font-extrabold tabular-nums ${tone}`}>
        <CountUp value={value} />
      </p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

/** Abstract DNA helix drawn in SVG: decorative, no network images. */
function Helix() {
  const rungs = Array.from({ length: 14 }, (_, i) => i);
  return (
    <svg viewBox="0 0 320 360" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="hx-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fe39a" />
          <stop offset="1" stopColor="#1fb5c9" />
        </linearGradient>
        <linearGradient id="hx-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b86f0" />
          <stop offset="1" stopColor="#1d4f8f" />
        </linearGradient>
      </defs>
      {rungs.map((i) => {
        const y = 20 + i * 24;
        const phase = (i / 13) * Math.PI * 2.2;
        const x1 = 160 + Math.sin(phase) * 90;
        const x2 = 160 - Math.sin(phase) * 90;
        const depth = (Math.cos(phase) + 1) / 2;
        return (
          <g key={i} opacity={0.35 + depth * 0.65}>
            <line x1={x1} y1={y} x2={x2} y2={y} stroke="#c9dbf2" strokeWidth="3" strokeLinecap="round" />
            <circle cx={x1} cy={y} r={5 + depth * 4} fill="url(#hx-a)" />
            <circle cx={x2} cy={y} r={5 + (1 - depth) * 4} fill="url(#hx-b)" />
          </g>
        );
      })}
    </svg>
  );
}

const FEATURES: { title: string; body: string; icon: IconName; tab: Tab; cta: string }[] = [
  {
    title: "AI Screening",
    body: "A supervised team of agents parses protocols and reads patient evidence; the rule engine makes every decision.",
    icon: "pulse",
    tab: "Screening",
    cta: "Open screening console",
  },
  {
    title: "Evidence Traceability",
    body: "Every verdict links patient evidence to the exact protocol criterion and comparison that produced it.",
    icon: "link",
    tab: "Patient",
    cta: "Explore a patient",
  },
  {
    title: "Human Review",
    body: "Unresolved cases are escalated with ranked next-best-evidence, so reviewers know exactly what to collect.",
    icon: "clipboard",
    tab: "Review",
    cta: "Open review queue",
  },
  {
    title: "Trial Intelligence",
    body: "Query results in natural language, compare trials side by side and measure accuracy against labels.",
    icon: "sparkle",
    tab: "Ask",
    cta: "Ask Innovexa",
  },
];

export default function Dashboard({ s }: { s: Shared }) {
  const flagged = s.patients.filter((p) => p.anomaly?.outlier);
  const [sum, setSum] = useState<Summary | null>(null);
  useEffect(() => {
    api
      .summary()
      .then((x) => {
        setSum(x);
        // the summary call screens every trial on first load; refetch trials so their per-trial counts are current
        if (s.trials.length && s.trials.every((t) => t.screened.ELIGIBLE + t.screened.NEEDS_REVIEW + t.screened.NOT_ELIGIBLE === 0)) s.refresh();
      })
      .catch(() => setSum(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.trials.length, s.patients.length]);

  const mix = sum
    ? (["ELIGIBLE", "NOT_ELIGIBLE", "NEEDS_REVIEW"] as const).map((k) => ({ key: k, name: DECISION_META[k].label, value: sum[k], color: k === "NOT_ELIGIBLE" ? "#fda4af" : DECISION_META[k].hex }))
    : [];
  const mixTotal = mix.reduce((a, b) => a + b.value, 0);
  const perTrial = s.trials.map((t) => ({
    trial: t.id,
    Eligible: t.screened.ELIGIBLE,
    "Needs review": t.screened.NEEDS_REVIEW,
    "Not eligible": t.screened.NOT_ELIGIBLE,
  }));

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <section className="surface animate-rise relative overflow-hidden p-0">
        <div className="hero-grid absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-gradient-to-l from-brand-50 via-brand-50/60 to-transparent lg:block" aria-hidden="true" />
        <div className="relative grid items-center gap-6 p-6 sm:p-10 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <span className="eyebrow">Clinical trial intelligence</span>
            <h1 className="mt-4 text-4xl leading-[1.02] font-extrabold tracking-tight text-navy-900 uppercase sm:text-5xl xl:text-[3.6rem]">
              Clinical trial screening,
              <br />
              <span className="bg-gradient-to-r from-brand-600 to-aqua-500 bg-clip-text text-transparent">reimagined.</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600">
              Innovexa matches patients to trial protocols with a deterministic rule engine, then shows the evidence, the
              comparison and the next best step behind every decision.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button size="lg" icon="pulse" onClick={() => s.go("Screening")}>
                Start Screening
              </Button>
              <Button size="lg" variant="ghost" icon="grid" onClick={() => s.go("All trials")}>
                Explore Trials
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="shield" className="h-4 w-4 text-brand-600" /> Rules decide, AI explains
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="check" className="h-4 w-4 text-emerald-500" /> Self-verified verdicts
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="eye" className="h-4 w-4 text-aqua-500" /> No hidden reasoning
              </span>
            </div>
          </div>

          <div className="relative mx-auto hidden h-[22rem] w-full max-w-md md:block">
            <div className="absolute inset-0 animate-float">
              <Helix />
            </div>
            <div className="animate-pop absolute top-4 left-0 w-44 rounded-2xl bg-white/90 p-3.5 shadow-lift ring-1 ring-navy-900/5 backdrop-blur" style={{ animationDelay: "250ms" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Screened pairs</p>
              <p className="font-display text-2xl font-extrabold text-navy-900 tabular-nums">
                <CountUp value={sum?.screened_pairs ?? "…"} />
              </p>
              <p className="text-[11px] text-slate-500">patient × trial</p>
            </div>
            <div className="animate-pop absolute right-0 bottom-6 w-48 rounded-2xl bg-gradient-to-br from-navy-900 to-navy-700 p-3.5 text-white shadow-lift" style={{ animationDelay: "400ms" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60">Eligible matches</p>
              <p className="font-display text-3xl font-extrabold text-lime-400 tabular-nums">
                <CountUp value={sum?.ELIGIBLE ?? "…"} />
              </p>
              <p className="text-[11px] text-white/70">across {sum?.trials ?? "…"} active protocols</p>
            </div>
            <div className="animate-pop absolute right-6 top-10 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-soft ring-1 ring-amber-200" style={{ animationDelay: "550ms" }}>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              {sum?.NEEDS_REVIEW ?? "…"} awaiting review
            </div>
          </div>
        </div>
      </section>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <Kpi icon="user" label="Patients" value={sum?.patients ?? "…"} hint="synthetic" />
        <Kpi icon="file" label="Trials" value={sum?.trials ?? "…"} delay={40} />
        <Kpi icon="check" label="Eligible" value={sum?.ELIGIBLE ?? "…"} tone="text-emerald-600" hint="patient–trial pairs" delay={80} />
        <Kpi icon="x" label="Not eligible" value={sum?.NOT_ELIGIBLE ?? "…"} tone="text-rose-600" delay={120} />
        <Kpi icon="question" label="Needs review" value={sum?.NEEDS_REVIEW ?? "…"} tone="text-amber-600" delay={160} />
        <Kpi icon="alert" label="Implausible" value={sum?.implausible ?? "…"} tone="text-rose-700" hint="range guard" delay={200} />
        <Kpi icon="chart" label="Outliers" value={sum?.advisory_outliers ?? "…"} tone="text-amber-700" hint="advisory" delay={240} />
      </div>

      {/* ── Screening overview ── */}
      <section className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card title="Screening overview" subtitle="Current decision mix across every screened patient–trial pair.">
          {mixTotal > 0 ? (
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <div className="relative h-44 w-44 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={mix} dataKey="value" nameKey="name" innerRadius={58} outerRadius={80} paddingAngle={3} stroke="none" animationDuration={900}>
                      {mix.map((m) => (
                        <Cell key={m.key} fill={m.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2eaf5", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="font-display text-2xl font-extrabold tabular-nums">
                      <CountUp value={mixTotal} />
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500">decisions</p>
                  </div>
                </div>
              </div>
              <ul className="w-full space-y-2.5">
                {mix.map((m) => (
                  <li key={m.key} className={`rounded-2xl px-3.5 py-2.5 ring-1 ${DECISION_META[m.key].soft} ${DECISION_META[m.key].ring}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-semibold text-navy-900">
                        <Icon name={DECISION_META[m.key].icon} className={`h-4 w-4 ${DECISION_META[m.key].text}`} strokeWidth={2.4} />
                        {m.name}
                      </span>
                      <span className="font-display font-bold tabular-nums">{m.value}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${(m.value / mixTotal) * 100}%`, background: m.color }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="grid h-44 place-items-center text-sm text-slate-400">{sum ? "No screening results yet." : "Loading…"}</div>
          )}
        </Card>
        <Card title="Decisions by trial" subtitle="Stacked outcome counts per protocol.">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={perTrial} barSize={34} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <XAxis dataKey="trial" tick={{ fontSize: 11, fill: "#5b6f8c" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "#eef4fe" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2eaf5", fontSize: 12 }} />
                <Bar dataKey="Eligible" stackId="a" fill={DECISION_META.ELIGIBLE.hex} />
                <Bar dataKey="Needs review" stackId="a" fill={DECISION_META.NEEDS_REVIEW.hex} />
                <Bar dataKey="Not eligible" stackId="a" fill="#fda4af" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      {/* ── Feature cards ── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="eyebrow">Platform</span>
            <h2 className="mt-2 text-2xl font-extrabold uppercase tracking-tight text-navy-900 sm:text-3xl">
              One console for
              <br className="hidden sm:block" /> evidence-first screening
            </h2>
          </div>
          <p className="max-w-sm text-xs leading-relaxed text-slate-500">
            From protocol parsing to reviewer sign-off, every step is recorded, cited and auditable.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {FEATURES.map((f, i) => (
            <button
              key={f.title}
              onClick={() => s.go(f.tab)}
              className={`surface surface-hover animate-rise group flex flex-col p-5 text-left ${i === 0 ? "bg-gradient-to-br from-brand-50 to-white" : ""}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-xs text-slate-400">0{i + 1}</span>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-brand-600 shadow-soft ring-1 ring-navy-900/5 transition group-hover:bg-navy-900 group-hover:text-lime-400">
                  <Icon name={f.icon} className="h-[18px] w-[18px]" />
                </span>
              </div>
              <h3 className="mt-5 text-base font-bold text-navy-900">{f.title}</h3>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-500">{f.body}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600">
                {f.cta} <Icon name="arrowRight" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Guided demo ── */}
      <Card
        title="Guided demo"
        subtitle="Curated synthetic patients that show each outcome end to end."
        className="bg-gradient-to-r from-white to-brand-50/60"
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button icon="arrowRight" onClick={() => s.openPatient("P042")}>
            Open demo patient P042
          </Button>
          <Button variant="ghost" onClick={() => s.openPatient("P040")}>
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> P040 eligible
          </Button>
          <Button variant="ghost" onClick={() => s.openPatient("P041")}>
            <span className="h-2 w-2 rounded-full bg-rose-500" /> P041 not eligible
          </Button>
          <Button variant="ghost" onClick={() => s.openPatient("P043")}>
            <span className="h-2 w-2 rounded-full bg-amber-500" /> P043 needs review
          </Button>
          <Button variant="ghost" onClick={() => s.openPatient("P006")}>
            <span className="h-2 w-2 rounded-full bg-violet-500" /> P006 anomaly
          </Button>
        </div>
      </Card>

      {/* ── Trials ── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="eyebrow">Protocols</span>
            <h2 className="mt-2 text-2xl font-extrabold uppercase tracking-tight text-navy-900 sm:text-3xl">Active trials</h2>
          </div>
          <Button variant="ghost" icon="grid" onClick={() => s.go("All trials")}>
            Trial opportunity map
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {s.trials.map((t, i) => {
            const total = t.screened.ELIGIBLE + t.screened.NEEDS_REVIEW + t.screened.NOT_ELIGIBLE;
            const w = (n: number) => `${total ? (n / total) * 100 : 0}%`;
            return (
              <article key={t.id} className="surface surface-hover animate-rise flex flex-col p-5" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-brand-600">{t.id}</span>
                  <span className="text-[11px] text-slate-400">{t.condition}</span>
                </div>
                <h3 className="mt-3 text-sm font-bold leading-snug text-navy-900">{t.title}</h3>
                <p className="mt-2 text-xs text-slate-500">
                  {t.rules.length} rules · parsed by {t.parsed_by} · {t.patient_count} patients
                </p>
                <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <div className="bg-emerald-500 transition-[width] duration-1000" style={{ width: w(t.screened.ELIGIBLE) }} />
                  <div className="bg-amber-400 transition-[width] duration-1000" style={{ width: w(t.screened.NEEDS_REVIEW) }} />
                  <div className="bg-rose-300 transition-[width] duration-1000" style={{ width: w(t.screened.NOT_ELIGIBLE) }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium">
                  <span className="text-emerald-700">{t.screened.ELIGIBLE} eligible</span>
                  <span className="text-amber-700">{t.screened.NEEDS_REVIEW} review</span>
                  <span className="text-rose-700">{t.screened.NOT_ELIGIBLE} not</span>
                </div>
                <div className="mt-4 flex-1" />
                <Button size="sm" icon="pulse" onClick={() => s.go("Screening", t.id)}>
                  Screen patients
                </Button>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── Data quality ── */}
      <Card
        title={`Data quality flags (${flagged.length})`}
        subtitle="Implausible values (outside physiological range) become UNKNOWN in the rule engine and send the case to review. Isolation Forest outliers are advisory only and never change a verdict."
      >
        <div className="grid gap-2 md:grid-cols-2">
          {flagged.map((p) => (
            <div key={p.id} className="flex items-start gap-3 rounded-2xl bg-canvas px-3.5 py-2.5 text-sm ring-1 ring-navy-900/5">
              <span
                className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                  p.anomaly?.implausible ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                <Icon name="alert" className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => s.openPatient(p.id)} className="font-semibold text-navy-900 underline-offset-2 hover:text-brand-600 hover:underline">
                    {p.id}
                  </button>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${p.anomaly?.implausible ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>
                    {p.anomaly?.implausible ? "implausible" : "outlier"}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-slate-400">score {p.anomaly?.score}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{p.anomaly?.reasons.join("; ")}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Patient table ── */}
      <Card title={`Patients (${s.patients.length})`} subtitle="Synthetic patient registry. Select an ID to open the patient's trial opportunity map." pad="p-0 pt-5">
        <div className="max-h-[30rem] overflow-auto px-5 pb-4">
          <table className="table-clean w-full min-w-[56rem] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-100">
                {["ID", "Age", "Sex", "Conditions", "HbA1c", "eGFR", "BMI", "SBP", "Glucose", "Weight", "Note"].map((h) => (
                  <th key={h} className="py-2.5 pr-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.patients.map((p) => (
                <tr key={p.id} className="border-t border-slate-50 align-top transition hover:bg-brand-50/50">
                  <td className="py-2 pr-3 font-semibold whitespace-nowrap">
                    <button onClick={() => s.openPatient(p.id)} className="text-navy-900 hover:text-brand-600 hover:underline">
                      {p.id}
                    </button>{" "}
                    {p.anomaly?.outlier && (
                      <span title={p.anomaly.reasons.join("; ")} className="text-amber-500">
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{p.age ?? "—"}</td>
                  <td className="py-2 pr-3">{p.sex}</td>
                  <td className="py-2 pr-3 text-xs">{p.conditions.join(", ")}</td>
                  {["hba1c", "egfr", "bmi", "systolic_bp", "fasting_glucose", "weight"].map((k) => (
                    <td key={k} className="py-2 pr-3 text-xs whitespace-nowrap tabular-nums">
                      {lab(p.labs[k])}
                    </td>
                  ))}
                  <td className="max-w-xs py-2 text-xs text-slate-500">{p.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <NewTrial onCreated={s.refresh} />
    </div>
  );
}

function NewTrial({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    id: "T5-NEW",
    title: "New trial",
    condition: "Asthma",
    criteria_text: "Inclusion Criteria:\n1. Age 18 to 65 years.\n2. Diagnosis of asthma.\nExclusion Criteria:\n1. Currently pregnant.\n",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-4 rounded-[1.25rem] border-2 border-dashed border-haze bg-white/60 p-5 text-left transition hover:border-brand-500/40 hover:bg-white"
      >
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-navy-900 group-hover:text-lime-400">
          <Icon name="upload" className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-bold text-navy-900">Upload a new trial protocol</span>
          <span className="block text-xs text-slate-500">Paste inclusion and exclusion criteria; Innovexa parses them into validated rules.</span>
        </span>
      </button>
    );
  return (
    <Card title="Upload a new trial protocol" subtitle="Criteria are parsed into structured, validated rules before any patient is screened.">
      <div className="grid gap-3 md:grid-cols-3">
        {(["id", "title", "condition"] as const).map((k) => (
          <label key={k}>
            <span className="field-label">{k === "id" ? "Trial ID" : k}</span>
            <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={k} className="field" />
          </label>
        ))}
      </div>
      <label className="mt-3 block">
        <span className="field-label">Criteria text</span>
        <textarea
          value={form.criteria_text}
          onChange={(e) => setForm({ ...form, criteria_text: e.target.value })}
          rows={7}
          className="field font-mono text-xs leading-relaxed"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          disabled={busy}
          icon="sparkle"
          onClick={async () => {
            setBusy(true);
            try {
              const t = await api.createTrial(form);
              setMsg(`Parsed ${t.rules.length} rules (${t.parsed_by}).`);
              onCreated();
            } catch (e) {
              setMsg(String((e as Error).message));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Parsing…" : "Parse and save"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {msg && <span className="animate-fade text-sm text-slate-600">{msg}</span>}
      </div>
    </Card>
  );
}
