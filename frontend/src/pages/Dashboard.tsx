import { useState } from "react";
import { api } from "../api";
import type { Shared } from "../App";
import { Button, Card } from "../components/ui";

function lab(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    const o = v as { value: number; unit: string };
    return `${o.value} ${o.unit}`;
  }
  return String(v);
}

export default function Dashboard({ s }: { s: Shared }) {
  const flagged = s.patients.filter((p) => p.anomaly?.outlier);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {s.trials.map((t) => (
          <Card key={t.id}>
            <p className="font-mono text-xs text-slate-500">{t.id}</p>
            <h3 className="mt-1 text-sm font-semibold leading-snug">{t.title}</h3>
            <p className="mt-2 text-xs text-slate-500">
              {t.rules.length} rules · parsed by {t.parsed_by} · {t.patient_count} patients
            </p>
            <div className="mt-2 flex gap-3 text-xs">
              <span className="text-emerald-700">{t.screened.ELIGIBLE} eligible</span>
              <span className="text-amber-700">{t.screened.NEEDS_REVIEW} review</span>
              <span className="text-rose-700">{t.screened.NOT_ELIGIBLE} not</span>
            </div>
            <div className="mt-3">
              <Button onClick={() => s.go("Screening", t.id)}>Screen</Button>
            </div>
          </Card>
        ))}
      </div>

      <Card title={`Data quality flags (${flagged.length})`}>
        <p className="mb-3 text-xs text-slate-500">
          Implausible values (outside physiological range) become UNKNOWN in the rule engine and send the case to review.
          Isolation Forest outliers are advisory only and never change a verdict.
        </p>
        <div className="space-y-2">
          {flagged.map((p) => (
            <div key={p.id} className="flex flex-wrap items-start gap-2 text-sm">
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${p.anomaly?.implausible ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>
                {p.anomaly?.implausible ? "implausible" : "outlier"}
              </span>
              <span className="font-medium">{p.id}</span>
              <span className="text-slate-600">{p.anomaly?.reasons.join("; ")}</span>
              <span className="text-xs text-slate-400">score {p.anomaly?.score}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title={`Patients (${s.patients.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                {["ID", "Age", "Sex", "Conditions", "HbA1c", "eGFR", "BMI", "SBP", "Glucose", "Weight", "Note"].map((h) => (
                  <th key={h} className="py-1 pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.patients.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 pr-3 font-medium">
                    {p.id} {p.anomaly?.outlier && <span title={p.anomaly.reasons.join("; ")}>⚠</span>}
                  </td>
                  <td className="py-1.5 pr-3">{p.age ?? "—"}</td>
                  <td className="py-1.5 pr-3">{p.sex}</td>
                  <td className="py-1.5 pr-3 text-xs">{p.conditions.join(", ")}</td>
                  {["hba1c", "egfr", "bmi", "systolic_bp", "fasting_glucose", "weight"].map((k) => (
                    <td key={k} className="py-1.5 pr-3 text-xs tabular-nums">{lab(p.labs[k])}</td>
                  ))}
                  <td className="max-w-xs py-1.5 text-xs text-slate-500">{p.notes}</td>
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
      <Button variant="ghost" onClick={() => setOpen(true)}>
        + Upload a new trial protocol
      </Button>
    );
  return (
    <Card title="New trial">
      <div className="grid gap-2 md:grid-cols-3">
        {(["id", "title", "condition"] as const).map((k) => (
          <input
            key={k}
            value={form[k]}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            placeholder={k}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        ))}
      </div>
      <textarea
        value={form.criteria_text}
        onChange={(e) => setForm({ ...form, criteria_text: e.target.value })}
        rows={7}
        className="mt-2 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button
          disabled={busy}
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
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </Card>
  );
}
