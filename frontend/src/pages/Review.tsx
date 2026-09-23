import { useEffect, useState } from "react";
import { api, type ReviewItem } from "../api";
import type { Shared } from "../App";
import { Button, CountUp, DecisionBadge, EmptyState, ErrorBox, Icon, LoadingPanel, PageHeader } from "../components/ui";

type Filter = "open" | "all" | "reviewed";

const IMPACT: Record<string, string> = {
  HIGH: "bg-rose-600 text-white",
  MEDIUM: "bg-amber-400 text-amber-950",
  LOW: "bg-slate-200 text-slate-700",
};

export default function Review({ s }: { s: Shared }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const load = () => api.review().then(setItems).catch((e) => setError(String(e.message)));
  useEffect(() => {
    load();
  }, []);

  async function recheck(it: ReviewItem) {
    const [v] = await api.screen(it.trial_id, [it.patient_id]);
    s.open(v, () => load());
    load();
  }

  async function decide(it: ReviewItem, decision: string) {
    const key = it.patient_id + it.trial_id;
    await api.submitReview({ patient_id: it.patient_id, trial_id: it.trial_id, decision, note: notes[key] ?? "" });
    load();
  }

  if (error) return <ErrorBox error={error} />;
  if (!items) return <LoadingPanel label="Loading review queue…" />;
  items.sort((a, b) => Number(b.decision === "NEEDS_REVIEW") - Number(a.decision === "NEEDS_REVIEW"));

  const isOpen = (i: ReviewItem) => !i.reviewed && i.decision === "NEEDS_REVIEW";
  const open = items.filter(isOpen).length;
  const reviewed = items.filter((i) => i.reviewed).length;
  const highImpact = items.filter((i) => isOpen(i) && i.next_best_evidence?.some((n) => n.impact === "HIGH")).length;
  const needle = q.trim().toLowerCase();
  const shown = items.filter(
    (i) =>
      (filter === "all" || (filter === "open" ? isOpen(i) : !!i.reviewed)) &&
      (!needle || i.patient_id.toLowerCase().includes(needle) || i.trial_id.toLowerCase().includes(needle)),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Clinical operations"
        title="Human review queue"
        subtitle="Cases the agent escalated: unknown criteria, contradictions or flagged data. A reviewer's decision is recorded in the audit log; it does not overwrite the system verdict, so accuracy stays honest."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: "Open reviews", v: open, cls: "text-amber-600", icon: "clipboard" as const },
          { k: "High-impact evidence", v: highImpact, cls: "text-rose-600", icon: "alert" as const },
          { k: "Reviewed", v: reviewed, cls: "text-emerald-600", icon: "check" as const },
          { k: "In queue", v: items.length, cls: "text-navy-900", icon: "layers" as const },
        ].map((x, i) => (
          <div key={x.k} className="surface animate-rise px-4 py-3.5" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] font-semibold tracking-[0.1em] text-slate-500 uppercase">{x.k}</p>
              <Icon name={x.icon} className="h-4 w-4 text-slate-300" />
            </div>
            <p className={`font-display text-3xl font-extrabold tabular-nums ${x.cls}`}>
              <CountUp value={x.v} />
            </p>
          </div>
        ))}
      </div>

      <div className="surface flex flex-wrap items-center gap-3 p-2 pl-4">
        <div className="relative min-w-48 flex-1">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-0 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search patient or trial ID"
            aria-label="Search review queue"
            className="w-full bg-transparent py-2 pr-2 pl-6 text-sm placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <div className="flex gap-1 rounded-full bg-canvas p-1" role="tablist" aria-label="Filter review items">
          {(
            [
              ["all", `All ${items.length}`],
              ["open", `Open ${open}`],
              ["reviewed", `Reviewed ${reviewed}`],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === k ? "bg-navy-900 text-white shadow-soft" : "text-slate-600 hover:bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 && (
        <EmptyState icon="clipboard" title="Nothing to review">
          Screen a trial first.
        </EmptyState>
      )}
      {items.length > 0 && shown.length === 0 && <EmptyState icon="filter" title="No items match this filter" />}

      <div className="grid gap-3 xl:grid-cols-2">
        {shown.map((it, idx) => {
          const key = it.patient_id + it.trial_id;
          const urgent = isOpen(it) && it.next_best_evidence?.some((n) => n.impact === "HIGH");
          return (
            <article
              key={key}
              className={`surface animate-rise relative overflow-hidden p-4 transition ${it.reviewed ? "opacity-70" : ""}`}
              style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 h-1 ${it.reviewed ? "bg-slate-200" : urgent ? "bg-gradient-to-r from-rose-500 to-amber-400" : isOpen(it) ? "bg-amber-400" : "bg-slate-200"}`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-canvas font-display text-xs font-bold text-navy-900 ring-1 ring-navy-900/5">
                  {it.patient_id.replace(/\D/g, "").slice(-3)}
                </span>
                <div className="min-w-0">
                  <p className="font-display font-bold text-navy-900">{it.patient_id}</p>
                  <p className="font-mono text-[11px] text-slate-500">{it.trial_id}</p>
                </div>
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                  {urgent && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-rose-700 uppercase ring-1 ring-rose-200">Urgent</span>}
                  <DecisionBadge d={it.decision} />
                </span>
              </div>
              {it.reviewed && (
                <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800 ring-1 ring-emerald-100">
                  <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.6} />
                  reviewed → {it.reviewed.decision} {it.reviewed.note && `(${it.reviewed.note})`}
                </p>
              )}
              {it.next_best_evidence?.length > 0 ? (
                <div className="mt-3 rounded-2xl bg-canvas p-3">
                  <p className="mb-1.5 text-[10px] font-bold tracking-widest text-navy-900 uppercase">Next best evidence</p>
                  <ol className="space-y-1">
                    {it.next_best_evidence.map((n) => (
                      <li key={n.rule_id} className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700">
                        <span className={`rounded-full px-1.5 py-px text-[9.5px] font-bold tracking-wider ${IMPACT[n.impact]}`}>{n.impact}</span>
                        <span className="font-medium text-navy-900">{n.request}</span>
                        <span className="text-slate-400">[{n.section}]</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                it.unknown.length > 0 && (
                  <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-100">
                    <b>Unresolved:</b> {it.unknown.join("; ")}
                  </p>
                )
              )}
              {it.flags.length > 0 && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-600">
                  <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>Flags: {it.flags.join("; ")}</span>
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" icon="eye" onClick={() => recheck(it)}>
                  Open evidence / re-check
                </Button>
                <Button variant="ghost" size="sm" icon="user" onClick={() => s.openPatient(it.patient_id)}>
                  Patient map
                </Button>
              </div>
              {isOpen(it) && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <input
                    value={notes[key] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [key]: e.target.value })}
                    placeholder="Reviewer note"
                    aria-label={`Reviewer note for ${it.patient_id} ${it.trial_id}`}
                    maxLength={500}
                    className="field min-w-48 flex-1 py-1.5"
                  />
                  <Button variant="success" size="sm" icon="check" onClick={() => decide(it, "ELIGIBLE")}>
                    Approve
                  </Button>
                  <Button variant="danger" size="sm" icon="x" onClick={() => decide(it, "NOT_ELIGIBLE")}>
                    Reject
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
