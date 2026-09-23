import { useState } from "react";
import { api } from "../api";
import type { Shared } from "../App";
import { Button, Card, DECISION_META, ErrorBox, Icon, PageHeader, Spinner } from "../components/ui";

const CELL: Record<string, string> = {
  ELIGIBLE: "bg-emerald-500 text-white shadow-[0_4px_12px_-4px_rgb(16_185_129/0.7)] hover:bg-emerald-600",
  NOT_ELIGIBLE: "bg-rose-50 text-rose-500 ring-1 ring-rose-100 hover:bg-rose-100",
  NEEDS_REVIEW: "bg-amber-300 text-amber-950 hover:bg-amber-400",
};
const SHORT: Record<string, "check" | "x" | "question"> = { ELIGIBLE: "check", NOT_ELIGIBLE: "x", NEEDS_REVIEW: "question" };

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
  const colCount = (tid: string, d: string) => s.verdicts[tid]?.filter((v) => v.decision === d).length ?? 0;
  const anyScreened = s.trials.some((t) => (s.verdicts[t.id]?.length ?? 0) > 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Trial opportunity map"
        title="All trials"
        subtitle="Every patient against every protocol. Each cell opens the full evidence record behind the decision."
        right={
          <>
            {busy && <Spinner label="Screening all trials…" />}
            <Button onClick={screenAll} disabled={busy} icon="pulse">
              Screen all trials
            </Button>
          </>
        }
      />
      <ErrorBox error={error} />

      <Card
        title="Patient × trial matrix"
        subtitle={anyScreened ? "Hover a cell for the rationale; select it for details." : "Run “Screen all trials” to fill the matrix."}
        right={
          <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            {(["ELIGIBLE", "NEEDS_REVIEW", "NOT_ELIGIBLE"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={`grid h-5 w-5 place-items-center rounded-md ${CELL[k]}`}>
                  <Icon name={SHORT[k]} className="h-3 w-3" strokeWidth={3} />
                </span>
                {DECISION_META[k].label}
              </span>
            ))}
          </div>
        }
        pad="p-0 pt-5"
      >
        <p className="sr-only">✓ eligible · ? needs review · ✕ not eligible. Click a cell for details.</p>
        <div className="max-h-[70vh] overflow-auto px-5 pb-5">
          <table className="border-separate border-spacing-1 text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-white pr-3 text-left text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase">Patient</th>
                {s.trials.map((t) => (
                  <th key={t.id} className="bg-white px-1 pb-2 text-center align-bottom">
                    <span className="block font-mono text-[11px] font-semibold text-navy-900">{t.id}</span>
                    <span className="block max-w-24 truncate text-[10px] font-normal text-slate-400">{t.condition}</span>
                    {s.verdicts[t.id]?.length ? (
                      <span className="mt-1 flex justify-center gap-1 text-[10px] font-semibold tabular-nums">
                        <span className="text-emerald-600">{colCount(t.id, "ELIGIBLE")}</span>
                        <span className="text-amber-600">{colCount(t.id, "NEEDS_REVIEW")}</span>
                        <span className="text-rose-500">{colCount(t.id, "NOT_ELIGIBLE")}</span>
                      </span>
                    ) : null}
                  </th>
                ))}
                <th className="bg-white pl-3 text-left text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase">Conditions</th>
              </tr>
            </thead>
            <tbody>
              {s.patients.map((p) => (
                <tr key={p.id} className="group">
                  <td className="sticky left-0 z-[5] bg-white pr-3 font-semibold whitespace-nowrap text-navy-900 group-hover:text-brand-600">{p.id}</td>
                  {s.trials.map((t) => {
                    const v = find(t.id, p.id);
                    return (
                      <td key={t.id} className="p-0">
                        <button
                          disabled={!v}
                          onClick={() => v && s.open(v)}
                          title={v?.rationale}
                          aria-label={v ? `${p.id} × ${t.id}: ${DECISION_META[v.decision].label}` : `${p.id} × ${t.id}: not screened`}
                          className={`grid h-8 w-20 place-items-center rounded-lg text-xs font-semibold transition duration-150 enabled:hover:scale-[1.06] ${
                            v ? CELL[v.decision] : "bg-canvas text-slate-300"
                          }`}
                        >
                          {v ? <Icon name={SHORT[v.decision]} className="h-3.5 w-3.5" strokeWidth={3} /> : "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="pl-3 text-xs whitespace-nowrap text-slate-500">{p.conditions.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
