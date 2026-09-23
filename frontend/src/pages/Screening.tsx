import { useRef, useState } from "react";
import { api, streamScreen, type TraceEvent, type Verdict } from "../api";
import type { Shared } from "../App";
import TracePanel from "../components/TracePanel";
import { Button, Card, ConfidenceBar, DECISION_META, DecisionBadge, EmptyState, ErrorBox, Icon, PageHeader, Spinner } from "../components/ui";

export default function Screening({ s, onTrial }: { s: Shared; onTrial: (id: string) => void }) {
  const trialId = s.selectedTrial;
  const trial = s.trials.find((t) => t.id === trialId);
  const verdicts = s.verdicts[trialId] ?? [];
  const [busy, setBusy] = useState<"" | "fast" | "agent">("");
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [patient, setPatient] = useState("");
  const abort = useRef<AbortController | null>(null);

  async function fast() {
    setBusy("fast");
    setError(null);
    try {
      s.setVerdicts(trialId, await api.screen(trialId, patient ? [patient] : undefined));
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
        patient ? [patient] : null,
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
  const inclusion = trial?.rules.filter((r) => r.kind === "inclusion").length ?? 0;
  const exclusion = trial?.rules.filter((r) => r.kind === "exclusion").length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Screening console"
        title="Clinical Screening"
        subtitle="Evaluate patient evidence against protocol criteria. The rule engine decides; agents gather, verify and explain."
        right={busy && <Spinner label={busy === "agent" ? "Agent screening…" : "Screening…"} />}
      />
      <ErrorBox error={error} />

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
        {/* ── Left: selection ── */}
        <aside className="space-y-4">
          <Card title="Screening setup" pad="p-4">
            <label className="block">
              <span className="field-label">Trial protocol</span>
              <select value={trialId} onChange={(e) => onTrial(e.target.value)} className="field">
                {s.trials.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id} — {t.condition}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="field-label">Patients</span>
              <select value={patient} onChange={(e) => setPatient(e.target.value)} className="field">
                <option value="">All {s.patients.length} patients</option>
                {s.patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex flex-col gap-2">
              <Button onClick={agent} disabled={!!busy || !trialId} icon="sparkle" size="lg" className="whitespace-normal text-center leading-tight">
                Run Clinical Screening Agent
              </Button>
              <Button variant="ghost" onClick={fast} disabled={!!busy || !trialId} icon="bolt">
                Fast Pipeline
              </Button>
              {busy === "agent" && (
                <Button variant="danger" onClick={() => abort.current?.abort()} icon="stop">
                  Stop
                </Button>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              The agent streams a structured action trace. The fast pipeline runs the same rule engine without the trace.
            </p>
          </Card>

          {trial && (
            <Card pad="p-4" className="bg-gradient-to-br from-navy-900 to-navy-700 text-white">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-lime-400">{trial.id}</span>
                <Icon name="file" className="h-4 w-4 text-white/50" />
              </div>
              <p className="mt-3 text-sm leading-snug font-semibold">{trial.title}</p>
              <p className="mt-1 text-xs text-white/60">{trial.condition}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Rules", trial.rules.length],
                  ["Include", inclusion],
                  ["Exclude", exclusion],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-xl bg-white/10 px-1 py-2">
                    <dd className="font-display text-lg font-bold tabular-nums">{v}</dd>
                    <dt className="text-[10px] tracking-wider text-white/60 uppercase">{k}</dt>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[11px] text-white/50">parsed by {trial.parsed_by}</p>
            </Card>
          )}
        </aside>

        {/* ── Center: results ── */}
        <div className="min-w-0">
          <Card
            title={`Screening Results (${verdicts.length})`}
            subtitle="Select a patient to open the full evidence record."
            pad="p-0 pt-5"
            right={
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                {(["ELIGIBLE", "NEEDS_REVIEW", "NOT_ELIGIBLE"] as const).map((k) => (
                  <span key={k} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ${DECISION_META[k].badge}`}>
                    <span className="tabular-nums">{counts[k]}</span> {DECISION_META[k].label.toLowerCase()}
                  </span>
                ))}
              </div>
            }
          >
            <div className="px-5">
              {verdicts.length > 0 && (
                <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  {(["ELIGIBLE", "NEEDS_REVIEW", "NOT_ELIGIBLE"] as const).map((k) => (
                    <div key={k} className="transition-[width] duration-700" style={{ width: `${(counts[k] / verdicts.length) * 100}%`, background: k === "NOT_ELIGIBLE" ? "#fda4af" : DECISION_META[k].hex }} />
                  ))}
                </div>
              )}
            </div>
            {verdicts.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState icon="pulse" title="No screening results yet">
                  Run the Clinical Screening Agent or the fast pipeline to evaluate patients against this protocol.
                </EmptyState>
              </div>
            ) : (
              <div className="max-h-[36rem] overflow-auto px-5 pb-4">
                <table className="table-clean w-full min-w-[36rem] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-slate-100">
                      <th className="py-2.5 pr-2">Patient</th>
                      <th className="py-2.5 pr-2">Decision</th>
                      <th className="py-2.5 pr-2">Confidence</th>
                      <th className="py-2.5">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verdicts.map((v) => (
                      <tr
                        key={v.patient_id}
                        onClick={() => s.open(v)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), s.open(v))}
                        tabIndex={0}
                        aria-label={`Open evidence for ${v.patient_id}`}
                        className="animate-fade group cursor-pointer border-t border-slate-50 align-top transition hover:bg-brand-50/60 focus:bg-brand-50/60 focus:outline-none"
                      >
                        <td className="py-2.5 pr-2 font-semibold whitespace-nowrap text-navy-900">
                          {v.patient_id}{" "}
                          {v.flags.length > 0 && (
                            <span title={v.flags.join("\n")} className="text-amber-500">
                              ⚠
                            </span>
                          )}
                          {v.corrections.length > 0 && (
                            <span title={v.corrections.join("\n")} className="text-violet-500">
                              {" "}
                              ↺
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-2">
                          <DecisionBadge d={v.decision} />
                        </td>
                        <td className="py-2.5 pr-2">
                          <ConfidenceBar value={v.confidence} />
                        </td>
                        <td className="py-2.5 text-xs leading-relaxed text-slate-600">
                          <span className="flex items-start justify-between gap-2">
                            <span>
                              {v.decision === "ELIGIBLE"
                                ? v.rationale.split(": ")[1]?.split(".")[0] ?? v.rationale
                                : v.rationale.split(". ").slice(1, 2).join("") || v.rationale}
                            </span>
                            <Icon name="arrowRight" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* ── Right: live agent trace ── */}
        <div className="min-w-0 lg:col-span-2 xl:col-span-1">
          <Card
            title="Live agent trace"
            subtitle="Structured actions from the Clinical Screening Supervisor."
            right={
              busy === "agent" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-600">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-brand-500" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
                  </span>
                  Live
                </span>
              ) : undefined
            }
          >
            <TracePanel events={events} running={busy === "agent"} />
          </Card>
        </div>
      </div>
    </div>
  );
}
