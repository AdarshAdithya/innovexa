import { useState } from "react";
import { api, type QueryResult } from "../api";
import { Button, Card, DecisionBadge } from "../components/ui";

const EXAMPLES = [
  "Which patients over 60 are eligible for the diabetes trial?",
  "Who needs review for the kidney trial?",
  "Show women eligible for the breast cancer trial",
  "Which screened patients have flags?",
];

export default function Ask() {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<(QueryResult | { error: string; question: string })[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    if (!question.trim()) return;
    setBusy(true);
    setQ("");
    try {
      const r = await api.query(question);
      setLog((l) => [r, ...l]);
    } catch (e) {
      setLog((l) => [{ error: String((e as Error).message), question }, ...l]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Ask about the cohort">
        <p className="mb-3 text-xs text-slate-500">
          Questions are turned into a validated filter over saved screening results. The model never runs SQL. Screen
          trials first so there are results to search.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={500}
            placeholder="e.g. which patients over 60 are eligible for the diabetes trial"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <Button disabled={busy}>{busy ? "Thinking…" : "Ask"}</Button>
        </form>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => ask(e)} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200">
              {e}
            </button>
          ))}
        </div>
      </Card>

      {log.map((r, i) => (
        <Card key={i}>
          <p className="text-sm font-medium">🧑 {r.question}</p>
          {"error" in r ? (
            <p className="mt-2 text-sm text-rose-700">{r.error}</p>
          ) : (
            <>
              <p className="mt-2 text-sm">🤖 {r.answer}</p>
              <p className="text-xs text-slate-500">
                filter {JSON.stringify(r.filter)} · parsed by {r.parsed_by}
              </p>
              {r.rows.length > 0 && (
                <table className="mt-2 w-full text-left text-sm">
                  <tbody>
                    {r.rows.map((row) => (
                      <tr key={row.patient_id + row.trial_id} className="border-t border-slate-100">
                        <td className="py-1 font-medium">{row.patient_id}</td>
                        <td className="font-mono text-xs">{row.trial_id}</td>
                        <td className="text-xs">
                          {row.age} y · {row.sex}
                        </td>
                        <td>
                          <DecisionBadge d={row.decision} />
                        </td>
                        <td className="text-xs text-amber-700">{row.flags.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </Card>
      ))}
    </div>
  );
}
