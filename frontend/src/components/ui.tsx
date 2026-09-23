import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Decision, Status } from "../api";

/* ───────────────────────── Icons (inline stroke SVG, no dependency) ───────────────────────── */

const PATHS = {
  check: "M5 12.5l4.2 4.2L19 7",
  x: "M6 6l12 12M18 6L6 18",
  question: "M9.2 9.3a2.9 2.9 0 015.6 1c0 2-2.8 2.4-2.8 4.2M12 17.6h.01",
  alert: "M12 8.5v4.5M12 16.5h.01M10.3 3.9L2.6 17.4A2 2 0 004.3 20.4h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowUpRight: "M7 17L17 7M8 7h9v9",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.5-3.5",
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0",
  pulse: "M3 12h4l2.5-6 5 12 2.5-6H21",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  clipboard: "M9 4h6v3H9zM8 5.5H6.5A1.5 1.5 0 005 7v12.5A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5V7a1.5 1.5 0 00-1.5-1.5H16M9 13l2 2 4-4",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  target: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01",
  layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  dna: "M7 3c0 6 10 6 10 12s-10 6-10 6M17 3c0 6-10 6-10 12M8.5 6h7M8.5 18h7M10 9.5h4M10 14.5h4",
  shield: "M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3zM8.8 12l2.2 2.2 4.3-4.4",
  file: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5M9 13h6M9 17h4",
  flask: "M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 006 21h12a1.7 1.7 0 001.5-2.5L14 9V3M7.5 14h9",
  stop: "M7 7h10v10H7z",
  bolt: "M13 2L4.5 13.5H12L11 22l8.5-11.5H12L13 2z",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  undo: "M4 9h11a5 5 0 010 10h-4M8 5L4 9l4 4",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  send: "M4 12l16-8-6 16-2.5-6.5L4 12z",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  note: "M5 4h14v12l-4 4H5zM15 20v-4h4M8.5 9h7M8.5 12.5h5",
  pill: "M10.5 20.5a5 5 0 01-7-7l6-6a5 5 0 017 7l-6 6zM7 10l7 7",
  heart: "M12 20s-7.5-4.6-9.2-9.4C1.6 7.1 4 4 7.3 4c2 0 3.4 1 4.7 2.6C13.3 5 14.7 4 16.7 4 20 4 22.4 7.1 21.2 10.6 19.5 15.4 12 20 12 20z",
  cluster: "M6 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18 10a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM9 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM7.5 7.5L8.5 16M8 6l7.5 1.5M16.5 9.5L10.8 17",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  chevronDown: "M6 9l6 6 6-6",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  filter: "M4 5h16l-6 8v6l-4-2v-4L4 5z",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-4 w-4", strokeWidth = 1.8 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ───────────────────────── Decision + status ───────────────────────── */

export const DECISION_META: Record<Decision, { label: string; icon: IconName; badge: string; dot: string; text: string; soft: string; ring: string; hex: string }> = {
  ELIGIBLE: {
    label: "Eligible",
    icon: "check",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
    text: "text-emerald-600",
    soft: "bg-emerald-50",
    ring: "ring-emerald-200",
    hex: "#10b981",
  },
  NOT_ELIGIBLE: {
    label: "Not eligible",
    icon: "x",
    badge: "bg-rose-50 text-rose-700 ring-rose-200",
    dot: "bg-rose-500",
    text: "text-rose-600",
    soft: "bg-rose-50",
    ring: "ring-rose-200",
    hex: "#f43f5e",
  },
  NEEDS_REVIEW: {
    label: "Needs review",
    icon: "question",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
    dot: "bg-amber-500",
    text: "text-amber-600",
    soft: "bg-amber-50",
    ring: "ring-amber-200",
    hex: "#f59e0b",
  },
};

export function DecisionBadge({ d }: { d: Decision | null | undefined }) {
  if (!d) return <span className="text-xs text-slate-400">not screened</span>;
  const m = DECISION_META[d];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${m.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  MET: "text-emerald-700 bg-emerald-50 ring-emerald-200",
  NOT_MET: "text-slate-600 bg-slate-100 ring-slate-200",
  UNKNOWN: "text-amber-800 bg-amber-50 ring-amber-200",
  PENDING: "text-sky-700 bg-sky-50 ring-sky-200",
};

export function StatusPill({ s }: { s: Status }) {
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide ring-1 ${STATUS_STYLE[s]}`}>
      {s}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? "from-emerald-400 to-emerald-500" : pct >= 70 ? "from-amber-300 to-amber-500" : "from-rose-400 to-rose-500";
  return (
    <div className="flex items-center gap-2" aria-label={`confidence ${pct}%`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-xs font-medium tabular-nums text-slate-600">{pct}%</span>
    </div>
  );
}

/* ───────────────────────── Layout primitives ───────────────────────── */

export function Card({
  title,
  children,
  right,
  subtitle,
  className = "",
  pad = "p-5",
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  pad?: string;
}) {
  const flush = pad.startsWith("p-0");
  return (
    <section className={`surface animate-rise ${pad} ${className}`}>
      {(title || right) && (
        <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${flush ? "px-5" : ""}`}>
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-bold text-navy-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="animate-rise flex flex-wrap items-end justify-between gap-4 pt-2 pb-1">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <span className="eyebrow mb-3">{eyebrow}</span>}
        <h1 className="text-3xl font-extrabold uppercase leading-[1.05] tracking-tight text-navy-900 sm:text-[2.5rem]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
      {label}
    </div>
  );
}

/** Shimmering placeholder block while data loads. */
export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function LoadingPanel({ label }: { label?: string }) {
  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <Spinner label={label} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="animate-rise flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error}. Is the backend running on port 8000?</span>
    </div>
  );
}

export function EmptyState({ icon = "sparkle", title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-haze bg-canvas/60 px-6 py-12 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white text-brand-600 shadow-sm ring-1 ring-haze">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-navy-900">{title}</p>
      {children && <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{children}</p>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  icon,
  size = "md",
  className = "",
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "soft" | "success" | "danger";
  icon?: IconName;
  size?: "sm" | "md" | "lg";
}) {
  const cls = {
    primary:
      "bg-navy-900 text-white shadow-[0_8px_20px_-8px_rgb(11_36_71/0.55)] hover:bg-navy-800 disabled:bg-slate-300 disabled:shadow-none",
    ghost: "border border-[#d6e2f0] bg-white text-navy-900 hover:border-brand-500/40 hover:bg-brand-50 disabled:text-slate-400 disabled:hover:bg-white",
    soft: "bg-brand-50 text-brand-600 hover:bg-brand-100 disabled:text-slate-400",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300",
    danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:text-slate-400",
  }[variant];
  const sz = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-sm" }[size];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition duration-200 active:scale-[0.97] disabled:cursor-not-allowed ${sz} ${cls} ${className}`}
    >
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </button>
  );
}

/* ───────────────────────── Motion helpers ───────────────────────── */

/** Eases a number from its previous value to the new one. Non-numbers render as-is. */
export function CountUp({ value, duration = 900, format }: { value: number | string; duration?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState<number>(typeof value === "number" ? 0 : 0);
  const from = useRef(0);
  useEffect(() => {
    if (typeof value !== "number") return;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  if (typeof value !== "number") return <>{value}</>;
  return <>{format ? format(shown) : Math.round(shown).toLocaleString()}</>;
}

/** Circular progress ring (value 0..1). */
export function Ring({
  value,
  size = 64,
  stroke = 7,
  color = "#1f6fe0",
  track = "#e8f0fa",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(Math.max(0, Math.min(1, value))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.join(", ") || "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
