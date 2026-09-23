import { useEffect, useRef } from "react";
import type { TraceEvent } from "../api";
import { Icon, type IconName } from "./ui";

const STATUS: Record<string, { icon: IconName; cls: string; label: string }> = {
  complete: { icon: "check", cls: "bg-emerald-500 text-white", label: "complete" },
  passed: { icon: "check", cls: "bg-emerald-500 text-white", label: "passed" },
  corrected: { icon: "undo", cls: "bg-violet-500 text-white", label: "corrected" },
  failed: { icon: "x", cls: "bg-rose-500 text-white", label: "failed" },
};

const AGENT: Record<string, { cls: string; icon: IconName }> = {
  "Protocol Agent": { cls: "bg-sky-50 text-sky-700 ring-sky-200", icon: "file" },
  "Patient Evidence Agent": { cls: "bg-indigo-50 text-indigo-700 ring-indigo-200", icon: "user" },
  "Safety / Consistency Agent": { cls: "bg-amber-50 text-amber-800 ring-amber-200", icon: "shield" },
  "Decision Agent": { cls: "bg-navy-900 text-white ring-navy-900", icon: "target" },
  "Verification Agent": { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: "check" },
  "Explanation Agent": { cls: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200", icon: "note" },
  "Next-Best-Evidence Agent": { cls: "bg-orange-50 text-orange-700 ring-orange-200", icon: "search" },
  planner: { cls: "bg-slate-100 text-slate-500 ring-slate-200", icon: "layers" },
  supervisor: { cls: "bg-slate-100 text-slate-600 ring-slate-200", icon: "layers" },
};

export default function TracePanel({ events, running }: { events: TraceEvent[]; running: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [events.length]);
  const corrections = events.filter((e) => e.status === "corrected").length;
  const escalations = events.filter((e) => e.type === "escalate").length;
  const finals = events.filter((e) => e.type === "final").length;
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        {[
          { k: "screened", v: finals, cls: "text-navy-900" },
          { k: "corrections", v: corrections, cls: "text-violet-600" },
          { k: "escalated", v: escalations, cls: "text-amber-600" },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl bg-canvas px-2 py-2 ring-1 ring-navy-900/5">
            <p className={`font-display text-lg font-bold tabular-nums ${x.cls}`}>{x.v}</p>
            <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">{x.k}</p>
          </div>
        ))}
      </div>
      <div
        className="h-[32rem] overflow-y-auto rounded-2xl bg-gradient-to-b from-canvas to-white p-3 ring-1 ring-navy-900/5"
        aria-live="polite"
        aria-busy={running}
      >
        {events.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white text-brand-600 shadow-soft ring-1 ring-navy-900/5">
              <Icon name="layers" className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-navy-900">Workflow timeline</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Run the Clinical Screening Agent to stream its structured action trace (no hidden reasoning is shown).
            </p>
          </div>
        )}
        <ol className="relative">
          {events.map((e, i) => {
            const st = STATUS[e.status ?? "complete"] ?? STATUS.complete;
            const planner = e.agent === "planner";
            const isLast = i === events.length - 1;
            const live = running && isLast;
            if (e.type === "plan") {
              return (
                <li key={i} className={`animate-rise ${i > 0 ? "mt-4" : ""}`}>
                  <div className="flex items-start gap-2 rounded-xl bg-navy-900 px-3 py-2 text-white shadow-soft">
                    <Icon name="pulse" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime-400" />
                    <span className="text-xs leading-relaxed font-semibold">{e.content}</span>
                  </div>
                </li>
              );
            }
            if (e.type === "done") {
              return (
                <li key={i} className="animate-rise mt-3">
                  <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800 ring-1 ring-emerald-200">
                    <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.6} />
                    <span className="text-xs leading-relaxed font-semibold">{e.content}</span>
                  </div>
                </li>
              );
            }
            const ag = e.agent ? (AGENT[e.agent] ?? { cls: "bg-slate-100 text-slate-600 ring-slate-200", icon: "layers" as IconName }) : null;
            const final = e.type === "final";
            const escalate = e.type === "escalate";
            return (
              <li key={i} className="animate-rise relative flex gap-3 pt-2.5 pl-1">
                {/* connector line */}
                <span className="absolute top-0 bottom-0 left-[13px] w-px bg-haze" aria-hidden="true" />
                <span className="relative z-[1] mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center">
                  {live && <span className="absolute inset-0 animate-ping-soft rounded-full bg-brand-500/60" />}
                  <span
                    className={`relative grid h-[18px] w-[18px] place-items-center rounded-full ring-2 ring-white ${
                      planner ? "bg-slate-300 text-white" : escalate ? "bg-amber-500 text-white" : st.cls
                    }`}
                    title={st.label}
                  >
                    <Icon name={escalate ? "alert" : st.icon} className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                </span>
                <div
                  className={`min-w-0 flex-1 rounded-xl px-2.5 py-1.5 ${
                    final ? "bg-white shadow-soft ring-1 ring-navy-900/5" : escalate ? "bg-amber-50/70 ring-1 ring-amber-200" : ""
                  }`}
                >
                  {ag && (
                    <span className={`mb-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold ring-1 ${ag.cls}`}>
                      <Icon name={ag.icon} className="h-2.5 w-2.5" strokeWidth={2.2} />
                      {e.agent}
                    </span>
                  )}
                  <p className={`text-[12px] leading-relaxed break-words ${planner ? "text-slate-400" : "text-slate-700"}`}>
                    {planner ? `calls ${e.content}` : e.content}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        {running && (
          <div className="mt-3 flex items-center gap-2 pl-1 text-xs text-brand-600">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-brand-100">
              <span className="skeleton block h-full w-full rounded-full" />
            </span>
            working…
          </div>
        )}
        <div ref={end} />
      </div>
    </div>
  );
}
