import { useEffect, useState } from "react";
import { api, type ReviewItem } from "../api";
import { Button, Card, DecisionBadge, ErrorBox, Spinner } from "../components/ui";

export default function Review() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = () => api.review().then(setItems).catch((e) => setError(String(e.message)));
  useEffect(() => {
    load();
  }, []);

  async function decide(it: ReviewItem, decision: string) {
    const key = it.patient_id + it.trial_id;
    await api.submitReview({ patient_id: it.patient_id, trial_id: it.trial_id, decision, note: notes[key] ?? "" });
    load();
  }

  if (error) return <ErrorBox error={error} />;
  if (!items) return <Spinner />;
  return (
    <Card title={`Human review queue (${items.filter((i) => !i.reviewed).length} open)`}>
      <p className="mb-3 text-xs text-slate-500">
        Cases the agent escalated: unknown criteria, contradictions or flagged data. A reviewer's decision is recorded in the
        audit log; it does not overwrite the system verdict, so accuracy stays honest.
      </p>
      {items.length === 0 && <p className="text-sm text-slate-500">Nothing to review. Screen a trial first.</p>}
      <div className="space-y-2">
        {items.map((it) => {
          const key = it.patient_id + it.trial_id;
          return (
            <div key={key} className={`rounded-lg border p-3 ${it.reviewed ? "border-slate-100 opacity-60" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{it.patient_id}</span>
                <span className="font-mono text-xs text-slate-500">{it.trial_id}</span>
                <DecisionBadge d={it.decision} />
                {it.reviewed && (
                  <span className="text-xs text-slate-600">
                    reviewed → {it.reviewed.decision} {it.reviewed.note && `(${it.reviewed.note})`}
                  </span>
                )}
              </div>
              {it.unknown.length > 0 && <p className="mt-1 text-xs text-amber-800">Unknown: {it.unknown.join("; ")}</p>}
              {it.flags.length > 0 && <p className="mt-1 text-xs text-slate-600">Flags: {it.flags.join("; ")}</p>}
              {!it.reviewed && it.decision === "NEEDS_REVIEW" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={notes[key] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [key]: e.target.value })}
                    placeholder="reviewer note"
                    maxLength={500}
                    className="min-w-48 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  />
                  <Button onClick={() => decide(it, "ELIGIBLE")}>Approve</Button>
                  <Button variant="ghost" onClick={() => decide(it, "NOT_ELIGIBLE")}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
