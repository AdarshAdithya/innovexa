import { useState } from "react";
import { api, type QueryResult } from "../api";
import { Button, DecisionBadge, Icon } from "../components/ui";

const EXAMPLES = [
  "How many patients are potentially eligible for Trial T2?",
  "Why is P042 in review?",
  "Which criteria are most frequently failing?",
  "Which patients over 60 are eligible for the diabetes trial?",
  "Who needs review for the kidney trial?",
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
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="surface animate-rise relative overflow-hidden p-6 sm:p-10">
        <div className="hero-grid absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-aqua-100 blur-3xl" aria-hidden="true" />
        <div className="relative text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-navy-900 to-brand-600 text-lime-400 shadow-glow">
            <Icon name="sparkle" className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-navy-900 uppercase sm:text-4xl">Ask Innovexa</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">Query your screening results in natural language.</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
            }}
            className="mx-auto mt-6 flex max-w-2xl items-center gap-2 rounded-full bg-white p-1.5 pl-5 text-left shadow-lift ring-1 ring-navy-900/5 focus-within:ring-2 focus-within:ring-brand-500/40"
          >
            <Icon name="search" className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={500}
              aria-label="Ask a question"
              placeholder="e.g. which patients over 60 are eligible for the diabetes trial"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm placeholder:text-slate-400 focus:outline-none"
            />
            <Button disabled={busy} icon={busy ? undefined : "send"}>
              {busy ? "Thinking…" : "Ask"}
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                onClick={() => ask(e)}
                disabled={busy}
                className="rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-navy-900/8 transition hover:-translate-y-px hover:bg-brand-50 hover:text-brand-600 hover:ring-brand-100 disabled:opacity-60"
              >
                {e}
              </button>
            ))}
          </div>
          <p className="mx-auto mt-5 max-w-2xl text-[11px] leading-relaxed text-slate-400">
            Questions become a validated filter over saved screening results, or a deterministic intent (explain a patient,
            most-failing criteria). The model never runs SQL. The dashboard screens every trial on first load.
          </p>
        </div>
      </section>

      {busy && (
        <div className="surface animate-rise flex items-center gap-3 p-4">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Icon name="sparkle" className="h-4 w-4" />
          </span>
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 w-2/3" />
            <div className="skeleton h-3 w-1/3" />
          </div>
        </div>
      )}

      {log.map((r, i) => (
        <article key={log.length - i} className="surface animate-rise space-y-3 p-5">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-navy-900 px-4 py-2 text-sm font-medium text-white">{r.question}</p>
          </div>
          {"error" in r ? (
            <p className="flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" /> {r.error}
            </p>
          ) : (
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-navy-900 to-brand-600 text-lime-400">
                <Icon name="sparkle" className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="rounded-2xl rounded-tl-md bg-canvas px-4 py-2.5 text-sm leading-relaxed text-navy-900">{r.answer}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="rounded-full bg-white px-2 py-0.5 font-mono ring-1 ring-navy-900/10">filter {JSON.stringify(r.filter)}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-navy-900/10">parsed by {r.parsed_by}</span>
                </p>
                {r.table && r.table.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-navy-900/5">
                    <table className="w-full text-left text-sm">
                      <tbody>
                        {r.table.map((t) => (
                          <tr key={t.trial_id + t.section} className="border-t border-slate-50 first:border-0">
                            <td className="py-2 pl-3 font-mono text-xs text-brand-600">{t.trial_id}</td>
                            <td className="px-2 text-xs text-slate-500">{t.section}</td>
                            <td className="px-2">{t.criterion}</td>
                            <td className="pr-3 text-right font-display font-bold tabular-nums">{t.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {r.rows.length > 0 && (
                  <div className="mt-3 max-h-96 overflow-auto rounded-2xl ring-1 ring-navy-900/5">
                    <table className="w-full text-left text-sm">
                      <tbody>
                        {r.rows.map((row) => (
                          <tr key={row.patient_id + row.trial_id} className="border-t border-slate-50 first:border-0">
                            <td className="py-2 pl-3 font-semibold text-navy-900">{row.patient_id}</td>
                            <td className="px-2 font-mono text-xs text-brand-600">{row.trial_id}</td>
                            <td className="px-2 text-xs whitespace-nowrap">
                              {row.age} y · {row.sex}
                            </td>
                            <td className="px-2">
                              <DecisionBadge d={row.decision} />
                            </td>
                            <td className="pr-3 text-xs text-amber-700">{row.flags.join("; ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
