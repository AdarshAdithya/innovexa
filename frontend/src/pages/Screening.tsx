import { useRef, useState } from "react";
import { api, streamScreen, type TraceEvent, type Verdict } from "../api";
import type { Shared } from "../App";
import TracePanel from "../components/TracePanel";
import { Button, Card, ConfidenceBar, DecisionBadge, ErrorBox, Spinner } from "../components/ui";

export default function Screening({ s, onTrial }: { s: Shared; onTrial: (id: string) => void }) {
  const trialId = s.selectedTrial;
  const trial = s.trials.find((t) => t.id === trialId);
  const verdicts = s.verdicts[trialId] ?? [];
  const [busy, setBusy] = useState<"" | "fast" | "agent">("");
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const abort = useRef<AbortController | null>(null);

  async function fast() {
    setBusy("fast");
    setError(null);
    try {
      s.setVerdicts(trialId, await api.screen(trialId));
      s.refresh();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy("");
    }
  }

  async function agent() {
    setBusy("agent");
    setError(null);
    setEvents([]);
    const got: Verdict[] = [];
    abort.current = new AbortController();
    try {
      await streamScreen(
        trialId,
        null,
        (e) => {
          setEvents((all) => [...all, e]);
          if (e.type === "final" && e.data?.verdict) {
            got.push(e.data.verdict);
            s.setVerdicts(trialId, [...got]);
          }
        },
        abort.current.signal,
      );
      s.refresh();
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(String((e as Error).message));
    } finally {
      setBusy("");
    }
  }

  const counts = { ELIGIBLE: 0, NOT_ELIGIBLE: 0, NEEDS_REVIEW: 0 };
  verdicts.forEach((v) => counts[v.decision]++);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={trialId}
            onChange={(e) => onTrial(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {s.trials.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} — {t.condition}
              </option>
            ))}
          </select>
          <Button onClick={agent} disabled={!!busy || !trialId}>
            Run agent (live trace)
          </Button>
          <Button variant="ghost" onClick={fast} disabled={!!busy || !trialId}>
            Fast pipeline
          </Button>
          {busy === "agent" && (
            <Button variant="ghost" onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          )}
          {busy && <Spinner label={busy === "agent" ? "Agent screening…" : "Screening…"} />}
        </div>
        {trial && <p className="mt-2 text-sm text-slate-600">{trial.title}</p>}
      </Card>
      <ErrorBox error={error} />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card
            title={`Results (${verdicts.length})`}
            right={
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-700">{counts.ELIGIBLE} eligible</span>
                <span className="text-amber-700">{counts.NEEDS_REVIEW} review</span>
                <span className="text-rose-700">{counts.NOT_ELIGIBLE} not eligible</span>
              </div>
            }
          >
            {verdicts.length === 0 ? (
              <p className="text-sm text-slate-500">No results yet. Run the agent or the fast pipeline.</p>
            ) : (
              <div className="max-h-[32rem] overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-1 pr-2">Patient</th>
                      <th className="py-1 pr-2">Decision</th>
                      <th className="py-1 pr-2">Confidence</th>
                      <th className="py-1">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verdicts.map((v) => (
                      <tr
                        key={v.patient_id}
                        onClick={() => s.open(v)}
                        className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50"
                      >
                        <td className="py-1.5 pr-2 font-medium">
                          {v.patient_id} {v.flags.length > 0 && <span title={v.flags.join("\n")}>⚠</span>}
                          {v.corrections.length > 0 && <span title={v.corrections.join("\n")}> ↺</span>}
                        </td>
                        <td className="py-1.5 pr-2">
                          <DecisionBadge d={v.decision} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <ConfidenceBar value={v.confidence} />
                        </td>
                        <td className="py-1.5 text-xs text-slate-600">{v.decision === "ELIGIBLE" ? v.rationale.split(": ")[1]?.split(".")[0] ?? v.rationale : v.rationale.split(". ").slice(1, 2).join("") || v.rationale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card title="Agent reasoning">
            <TracePanel events={events} running={busy === "agent"} />
          </Card>
        </div>
      </div>
    </div>
  );
}
