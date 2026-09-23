import { useCallback, useEffect, useState } from "react";
import { api, type Patient, type Trial, type Verdict } from "./api";
import PatientDrawer from "./components/PatientDrawer";
import { ErrorBox, Icon, type IconName } from "./components/ui";
import Accuracy from "./pages/Accuracy";
import Ask from "./pages/Ask";
import Cohorts from "./pages/Cohorts";
import Dashboard from "./pages/Dashboard";
import Grid from "./pages/Grid";
import PatientMap from "./pages/PatientMap";
import Review from "./pages/Review";
import Screening from "./pages/Screening";

const TABS = ["Dashboard", "Patient", "Screening", "All trials", "Review", "Ask", "Accuracy", "Cohorts"] as const;
export type Tab = (typeof TABS)[number];

const TAB_ICON: Record<Tab, IconName> = {
  Dashboard: "dashboard",
  Patient: "user",
  Screening: "pulse",
  "All trials": "grid",
  Review: "clipboard",
  Ask: "sparkle",
  Accuracy: "target",
  Cohorts: "cluster",
};

export interface Shared {
  trials: Trial[];
  patients: Patient[];
  verdicts: Record<string, Verdict[]>;
  setVerdicts: (trialId: string, v: Verdict[]) => void;
  open: (v: Verdict, onChanged?: (v: Verdict) => void) => void;
  go: (t: Tab, trialId?: string) => void;
  openPatient: (pid: string) => void;
  selectedTrial: string;
  refresh: () => void;
}

function Logo() {
  return (
    <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-[14px] bg-gradient-to-br from-navy-900 via-navy-800 to-brand-600 shadow-glow">
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true">
        <path d="M10 6c7 4.5 5 15.5 12 20M22 6c-7 4.5-5 15.5-12 20" stroke="#8fe39a" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M11.5 11h9M11.5 21h9" stroke="#fff" strokeOpacity=".75" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [trials, setTrials] = useState<Trial[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [verdicts, setAll] = useState<Record<string, Verdict[]>>({});
  const [drawer, setDrawer] = useState<{ v: Verdict; onChanged?: (v: Verdict) => void } | null>(null);
  const [patientId, setPatientId] = useState("P042");
  const [selectedTrial, setSelectedTrial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<string>("");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([api.trials(), api.patients()])
      .then(([t, p]) => {
        setTrials(t);
        setPatients(p);
        setSelectedTrial((s) => s || t[0]?.id || "");
        setError(null);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    refresh();
    api.health().then((h) => setMode(h.mode === "llm" ? `LLM: ${h.llm_model}` : "offline mode")).catch(() => {});
  }, [refresh]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const changeTab = (t: Tab) => {
    setTab(t);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const shared: Shared = {
    trials,
    patients,
    verdicts,
    setVerdicts: (id, v) => setAll((all) => ({ ...all, [id]: v })),
    open: (v, onChanged) => setDrawer({ v, onChanged }),
    go: (t, trialId) => {
      if (trialId) setSelectedTrial(trialId);
      changeTab(t);
    },
    openPatient: (pid) => {
      setPatientId(pid);
      changeTab("Patient");
    },
    selectedTrial,
    refresh,
  };

  return (
    <div className="relative min-h-screen">
      {/* soft ambient background */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-gradient-to-b from-brand-100/70 to-transparent blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[28rem] w-[28rem] rounded-full bg-aqua-100/50 blur-3xl" />
      </div>

      <header
        className={`sticky top-0 z-30 transition-all duration-300 ${
          scrolled ? "border-b border-navy-900/5 bg-white/75 shadow-[0_8px_30px_-18px_rgb(11_36_71/0.35)] backdrop-blur-xl" : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-[88rem] items-center gap-4 px-4 py-3 sm:px-6">
          <button onClick={() => changeTab("Dashboard")} className="flex items-center gap-3 rounded-2xl text-left" aria-label="Innovexa home">
            <Logo />
            <div className="leading-tight">
              <p className="font-display text-[17px] font-extrabold tracking-[0.14em] text-navy-900">INNOVEXA</p>
              <p className="hidden text-[11px] font-medium text-slate-500 sm:block">Evidence-first clinical trial intelligence</p>
            </div>
          </button>

          <nav aria-label="Primary" className="ml-auto hidden items-center gap-0.5 rounded-full border border-navy-900/5 bg-white/70 p-1 shadow-soft backdrop-blur xl:flex">
            {TABS.map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => changeTab(t)}
                  aria-current={active ? "page" : undefined}
                  className={`group inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-all duration-200 ${
                    active ? "bg-navy-900 text-white shadow-[0_6px_16px_-6px_rgb(11_36_71/0.6)]" : "text-slate-600 hover:bg-brand-50 hover:text-navy-900"
                  }`}
                >
                  <Icon name={TAB_ICON[t]} className={`h-3.5 w-3.5 transition ${active ? "text-lime-400" : "text-slate-400 group-hover:text-brand-600"}`} />
                  {t}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 xl:ml-2">
            {mode && (
              <span className="hidden items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-navy-900/5 md:inline-flex">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-emerald-400" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {mode}
              </span>
            )}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="grid h-10 w-10 place-items-center rounded-full bg-white text-navy-900 shadow-soft ring-1 ring-navy-900/5 xl:hidden"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
            >
              <Icon name={menuOpen ? "close" : "menu"} className="h-5 w-5" />
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav aria-label="Primary mobile" className="animate-rise mx-4 mb-3 grid grid-cols-2 gap-1.5 rounded-3xl border border-navy-900/5 bg-white/95 p-2 shadow-lift backdrop-blur sm:grid-cols-4 xl:hidden">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => changeTab(t)}
                aria-current={tab === t ? "page" : undefined}
                className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                  tab === t ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-brand-50"
                }`}
              >
                <Icon name={TAB_ICON[t]} className={`h-4 w-4 ${tab === t ? "text-lime-400" : "text-slate-400"}`} />
                {t}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-[88rem] space-y-5 px-4 pt-4 pb-16 sm:px-6">
        <ErrorBox error={error} />
        <div key={tab} className="animate-fade">
          {tab === "Dashboard" && <Dashboard s={shared} />}
          {tab === "Patient" && <PatientMap s={shared} patientId={patientId} onPatient={setPatientId} />}
          {tab === "Screening" && <Screening s={shared} onTrial={setSelectedTrial} />}
          {tab === "All trials" && <Grid s={shared} />}
          {tab === "Accuracy" && <Accuracy />}
          {tab === "Ask" && <Ask />}
          {tab === "Cohorts" && <Cohorts patients={patients} />}
          {tab === "Review" && <Review s={shared} />}
        </div>
      </main>

      <footer className="border-t border-navy-900/5 bg-white/50">
        <div className="mx-auto flex max-w-[88rem] flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-slate-500 sm:px-6">
          <span className="font-display font-bold tracking-[0.14em] text-navy-900">INNOVEXA</span>
          <span>Rules decide, AI explains · synthetic data · a screening aid, not a diagnostic tool</span>
        </div>
      </footer>

      {drawer && (
        <PatientDrawer
          verdict={drawer.v}
          patient={patients.find((p) => p.id === drawer.v.patient_id)}
          onClose={() => setDrawer(null)}
          onChanged={(v) => {
            setAll((all) => ({
              ...all,
              [v.trial_id]: (all[v.trial_id] ?? []).map((x) => (x.patient_id === v.patient_id ? v : x)),
            }));
            drawer.onChanged?.(v);
            refresh();
          }}
        />
      )}
    </div>
  );
}
