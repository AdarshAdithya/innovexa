import { useEffect, useRef } from "react";
import type { TraceEvent } from "../api";

const STYLE: Record<string, { icon: string; cls: string }> = {
  plan: { icon: "🗺", cls: "text-slate-100" },
  thought: { icon: "💭", cls: "text-slate-400 italic" },
  tool_call: { icon: "🔧", cls: "text-sky-300 font-mono" },
  tool_result: { icon: "↳", cls: "text-slate-500 font-mono" },
  verify: { icon: "✔", cls: "text-emerald-400" },
  correction: { icon: "↺", cls: "text-violet-300 font-semibold" },
  escalate: { icon: "🙋", cls: "text-amber-300" },
  final: { icon: "■", cls: "text-white font-semibold" },
  error: { icon: "✖", cls: "text-rose-400" },
  done: { icon: "✓", cls: "text-emerald-300 font-semibold" },
};

function summarize(e: TraceEvent): string {
  if (e.type === "tool_result" && e.data?.result !== undefined) {
    const r = e.data.result as unknown;
    if (Array.isArray(r)) {
      const counts: Record<string, number> = {};
      r.forEach((x: { status?: string }) => (counts[x.status ?? "?"] = (counts[x.status ?? "?"] ?? 0) + 1));
      return `${e.content}: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`;
    }
    if (r && typeof r === "object" && "rules" in (r as object)) {
      return `${e.content}: ${(r as { rules: unknown[] }).rules.length} rules`;
    }
  }
  if (e.type === "tool_call" && e.data?.args && Object.keys(e.data.args).length) {
    return `${e.content}(${JSON.stringify(e.data.args)})`;
  }
  return e.content;
}

export default function TracePanel({ events, running }: { events: TraceEvent[]; running: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [events.length]);
  const corrections = events.filter((e) => e.type === "correction").length;
  const escalations = events.filter((e) => e.type === "escalate").length;
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-500">
        <span>{events.length} steps</span>
        <span>· {corrections} corrections</span>
        <span>· {escalations} escalations</span>
        {running && <span className="animate-pulse text-sky-700">● live</span>}
      </div>
      <div className="h-[28rem] overflow-y-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed">
        {events.length === 0 && <p className="text-slate-500">Run the agent to watch it reason step by step.</p>}
        {events.map((e, i) => {
          const s = STYLE[e.type] ?? { icon: "·", cls: "text-slate-300" };
          const first = e.type === "plan";
          return (
            <div key={i} className={first && i > 0 ? "mt-2 border-t border-slate-800 pt-2" : ""}>
              <span className="mr-1.5">{s.icon}</span>
              {e.patient_id && first && <span className="mr-1 font-semibold text-sky-300">[{e.patient_id}]</span>}
              <span className={s.cls}>
                {summarize(e)}
              </span>
            </div>
          );
        })}
        <div ref={end} />
      </div>
    </div>
  );
}
