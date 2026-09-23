import { useState } from "react";
import { api } from "../api";
import type { Shared } from "../App";
import { Button, Card, ErrorBox, Spinner } from "../components/ui";

const CELL: Record<string, string> = {
  ELIGIBLE: "bg-emerald-500 text-white",
  NOT_ELIGIBLE: "bg-rose-100 text-rose-700",
  NEEDS_REVIEW: "bg-amber-300 text-amber-950",
};
const SHORT: Record<string, string> = { ELIGIBLE: "✓", NOT_ELIGIBLE: "✕", NEEDS_REVIEW: "?" };

export default function Grid({ s }: { s: Shared }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function screenAll() {
    setBusy(true);
    setError(null);
    try {
      for (const t of s.trials) s.setVerdicts(t.id, await api.screen(t.id));
      s.refresh();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const find = (tid: string, pid: string) => s.verdicts[tid]?.find((v) => v.patient_id === pid);

  return (
    <div className="space-y-4">
      <Card
        title="Patient × trial grid"
        right={
          <div className="flex items-center gap-3">
            {busy && <Spinner label="Screening all trials…" />}
            <Button onClick={screenAll} disabled={busy}>
              Screen all trials
            </Button>
          </div>
        }
      >
        <ErrorBox error={error} />
        <p className="mb-3 text-xs text-slate-500">✓ eligible · ? needs review · ✕ not eligible. Click a cell for details.</p>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                <th className="pr-3 text-left text-xs text-slate-500">Patient</th>
                {s.trials.map((t) => (
                  <th key={t.id} className="px-1 pb-1 text-center font-mono text-[11px] text-slate-600">
                    {t.id}
                  </th>
                ))}
                <th className="pl-3 text-left text-xs text-slate-500">Conditions</th>
              </tr>
            </thead>
            <tbody>
              {s.patients.map((p) => (
                <tr key={p.id}>
                  <td className="pr-3 font-medium">{p.id}</td>
                  {s.trials.map((t) => {
                    const v = find(t.id, p.id);
                    return (
                      <td key={t.id} className="p-0.5">
                        <button
                          disabled={!v}
                          onClick={() => v && s.open(v)}
                          title={v?.rationale}
                          className={`h-7 w-20 rounded text-xs font-semibold ${v ? CELL[v.decision] : "bg-slate-100 text-slate-300"}`}
                        >
                          {v ? SHORT[v.decision] : "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="pl-3 text-xs text-slate-500">{p.conditions.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
