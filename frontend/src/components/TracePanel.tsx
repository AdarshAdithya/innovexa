import { useEffect, useRef } from "react";
import type { TraceEvent } from "../api";

const STATUS: Record<string, { icon: string; cls: string }> = {
  complete: { icon: "✓", cls: "text-emerald-400" },
  passed: { icon: "✓", cls: "text-emerald-400" },
  corrected: { icon: "↺", cls: "text-violet-300" },
  failed: { icon: "✖", cls: "text-rose-400" },
};

const AGENT_COLOR: Record<string, string> = {
  "Protocol Agent": "bg-sky-900 text-sky-200",
  "Patient Evidence Agent": "bg-indigo-900 text-indigo-200",
  "Safety / Consistency Agent": "bg-amber-900 text-amber-200",
  "Decision Agent": "bg-slate-700 text-white",
  "Verification Agent": "bg-emerald-900 text-emerald-200",
  "Explanation Agent": "bg-fuchsia-900 text-fuchsia-200",
  "Next-Best-Evidence Agent": "bg-orange-900 text-orange-200",
  planner: "bg-slate-800 text-slate-400",
  supervisor: "bg-slate-800 text-slate-300",
};

export default function TracePanel({ events, running }: { events: TraceEvent[]; running: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [events.length]);
  const corrections = events.filter((e) => e.status === "corrected").length;
  const escalations = events.filter((e) => e.type === "escalate").length;
  const finals = events.filter((e) => e.type === "final").length;
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-500">
        <span>{finals} screened</span>
        <span>· {corrections} corrections</span>
        <span>· {escalations} escalated</span>
        {running && <span className="animate-pulse text-sky-700">● live</span>}
      </div>
      <div className="h-[30rem] overflow-y-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed">
        {events.length === 0 && (
          <p className="text-slate-500">
            Run the Clinical Screening Agent to stream its structured action trace (no hidden reasoning is shown).
          </p>
        )}
        {events.map((e, i) => {
          const st = STATUS[e.status ?? "complete"] ?? STATUS.complete;
          const first = e.type === "plan";
          const planner = e.agent === "planner";
          return (
            <div key={i} className={first && i > 0 ? "mt-2 border-t border-slate-800 pt-2" : ""}>
              {first ? (
                <span className="font-semibold text-sky-300">▶ {e.content}</span>
              ) : e.type === "done" ? (
                <span className="font-semibold text-emerald-300">■ {e.content}</span>
              ) : (
                <span className={planner ? "text-slate-500" : "text-slate-200"}>
                  <span className={`mr-1 ${st.cls}`}>{st.icon}</span>
                  {e.agent && (
                    <span className={`mr-1.5 rounded px-1 py-px text-[10px] ${AGENT_COLOR[e.agent] ?? "bg-slate-800"}`}>
                      {e.agent}
                    </span>
                  )}
                  {planner ? `calls ${e.content}` : e.content}
                </span>
              )}
            </div>
          );
        })}
        <div ref={end} />
      </div>
    </div>
  );
}
