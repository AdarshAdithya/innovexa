import { useCallback, useEffect, useState } from "react";
import { api, type Patient, type Trial, type Verdict } from "./api";
import PatientDrawer from "./components/PatientDrawer";
import { ErrorBox } from "./components/ui";
import Accuracy from "./pages/Accuracy";
import Ask from "./pages/Ask";
import Cohorts from "./pages/Cohorts";
import Dashboard from "./pages/Dashboard";
import Grid from "./pages/Grid";
import Review from "./pages/Review";
import Screening from "./pages/Screening";

const TABS = ["Dashboard", "Screening", "All trials", "Accuracy", "Ask", "Cohorts", "Review"] as const;
export type Tab = (typeof TABS)[number];

export interface Shared {
  trials: Trial[];
  patients: Patient[];
  verdicts: Record<string, Verdict[]>;
  setVerdicts: (trialId: string, v: Verdict[]) => void;
  open: (v: Verdict) => void;
  go: (t: Tab, trialId?: string) => void;
  selectedTrial: string;
  refresh: () => void;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [trials, setTrials] = useState<Trial[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [verdicts, setAll] = useState<Record<string, Verdict[]>>({});
  const [drawer, setDrawer] = useState<Verdict | null>(null);
  const [selectedTrial, setSelectedTrial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<string>("");

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

  const shared: Shared = {
    trials,
    patients,
    verdicts,
    setVerdicts: (id, v) => setAll((all) => ({ ...all, [id]: v })),
    open: setDrawer,
    go: (t, trialId) => {
      if (trialId) setSelectedTrial(trialId);
      setTab(t);
    },
    selectedTrial,
    refresh,
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">CT</span>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Trial Eligibility Screener</h1>
              <p className="text-[11px] text-slate-500">
                Rules decide · AI explains · synthetic data only{mode && ` · ${mode}`}
              </p>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  tab === t ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
        <ErrorBox error={error} />
        {tab === "Dashboard" && <Dashboard s={shared} />}
        {tab === "Screening" && <Screening s={shared} onTrial={setSelectedTrial} />}
        {tab === "All trials" && <Grid s={shared} />}
        {tab === "Accuracy" && <Accuracy />}
        {tab === "Ask" && <Ask />}
        {tab === "Cohorts" && <Cohorts patients={patients} />}
        {tab === "Review" && <Review />}
      </main>

      {drawer && (
        <PatientDrawer
          verdict={drawer}
          patient={patients.find((p) => p.id === drawer.patient_id)}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}
