import { useState } from "react";
import { api, type EvidenceRequest, type EvidenceUpdate } from "../api";
import { Button } from "./ui";

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
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Provide the missing evidence</p>
      {labItems.map((i) => {
        const f = i.field as string;
        return (
          <label key={f} className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="w-32 text-slate-700">{f}</span>
            <input
              type="number"
              step="any"
              value={labs[f]?.value ?? ""}
              onChange={(e) => setLabs({ ...labs, [f]: { ...labs[f], value: e.target.value } })}
              className="w-28 rounded-lg border border-slate-300 px-2 py-1"
              placeholder="value"
            />
            <select
              value={labs[f]?.unit}
              onChange={(e) => setLabs({ ...labs, [f]: { ...labs[f], unit: e.target.value } })}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1"
            >
              {UNITS[f].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
        );
      })}
      {noteItems.length > 0 && (
        <label className="block text-sm">
          <span className="text-slate-700">Clinical note addendum</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={'e.g. "Not on dialysis." or "Myocardial infarction 4 years ago."'}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
          />
        </label>
      )}
      <div className="mt-2 flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save evidence & re-screen"}
        </Button>
        {msg && <span className="text-xs text-rose-700">{msg}</span>}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Added to the synthetic record and logged in the audit trail. Notes are treated as untrusted text.
      </p>
    </div>
  );
}
