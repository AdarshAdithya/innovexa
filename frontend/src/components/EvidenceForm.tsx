import { useState } from "react";
import { api, type EvidenceRequest, type EvidenceUpdate } from "../api";
import { Button, Icon } from "./ui";

const UNITS: Record<string, string[]> = {
  hba1c: ["%", "mmol/mol"],
  egfr: ["mL/min/1.73m2"],
  bmi: ["kg/m2"],
  systolic_bp: ["mmHg"],
  fasting_glucose: ["mg/dL", "mmol/L"],
  weight: ["kg", "lb"],
};

/** Records newly obtained evidence for a NEEDS_REVIEW case, then lets the caller re-screen. */
export default function EvidenceForm({
  patientId,
  items,
  onSaved,
}: {
  patientId: string;
  items: EvidenceRequest[];
  onSaved: () => void;
}) {
  const labItems = items.filter((i) => i.field && UNITS[i.field]);
  const noteItems = items.filter((i) => !i.field || !UNITS[i.field]);
  const [labs, setLabs] = useState<Record<string, { value: string; unit: string }>>(
    Object.fromEntries(labItems.map((i) => [i.field as string, { value: "", unit: UNITS[i.field as string][0] }])),
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const body: EvidenceUpdate = {};
    const entered = Object.entries(labs).filter(([, v]) => v.value.trim() !== "");
    if (entered.length) {
      body.labs = Object.fromEntries(entered.map(([k, v]) => [k, { value: Number(v.value), unit: v.unit }]));
    }
    if (note.trim()) body.notes_append = note.trim();
    if (!body.labs && !body.notes_append) {
      setMsg("Enter at least one piece of evidence.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api.addEvidence(patientId, body);
      setNote("");
      onSaved();
    } catch (e) {
      setMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-white p-4 text-navy-900 shadow-soft">
      <p className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-navy-900 uppercase">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-lime-200 text-navy-900">
          <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
        Provide the missing evidence
      </p>
      {labItems.map((i) => {
        const f = i.field as string;
        return (
          <label key={f} className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="w-32 font-mono text-xs font-semibold text-slate-600">{f}</span>
            <input
              type="number"
              step="any"
              value={labs[f]?.value ?? ""}
              onChange={(e) => setLabs({ ...labs, [f]: { ...labs[f], value: e.target.value } })}
              className="field w-28 py-1.5"
              placeholder="value"
            />
            <select
              value={labs[f]?.unit}
              onChange={(e) => setLabs({ ...labs, [f]: { ...labs[f], unit: e.target.value } })}
              className="field w-auto py-1.5"
            >
              {UNITS[f].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
        );
      })}
      {noteItems.length > 0 && (
        <label className="mt-1 block text-sm">
          <span className="field-label">Clinical note addendum</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={'e.g. "Not on dialysis." or "Myocardial infarction 4 years ago."'}
            className="field"
          />
        </label>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={busy} icon="refresh">
          {busy ? "Saving…" : "Save evidence & re-screen"}
        </Button>
        {msg && <span className="text-xs text-rose-700">{msg}</span>}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Added to the synthetic record and logged in the audit trail. Notes are treated as untrusted text.
      </p>
    </div>
  );
}
