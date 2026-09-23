import { useEffect, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Cohorts as C, type Patient } from "../api";
import { Card, ErrorBox, Icon, LoadingPanel, PageHeader } from "../components/ui";

const COLORS = ["#1f6fe0", "#db2777", "#10b981", "#f59e0b", "#7c3aed", "#1fb5c9"];

export default function Cohorts({ patients }: { patients: Patient[] }) {
  const [c, setC] = useState<C | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  useEffect(() => {
    api.cohorts().then(setC).catch((e) => setError(String(e.message)));
  }, []);
  if (error) return <ErrorBox error={error} />;
  if (!c) return <LoadingPanel label="Clustering patients…" />;
  const byId = Object.fromEntries(patients.map((p) => [p.id, p]));
  const toggle = (id: number) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const excluded = c.points.filter((p) => p.excluded_from_fit).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Patient intelligence"
        title="Patient cohorts"
        subtitle="K-Means clustering over standardized age and labs, projected onto two principal components."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Cohorts (k)", c.k],
          ["Silhouette", c.silhouette],
          ["Patients plotted", c.points.length],
          ["Excluded from fit", excluded],
        ].map(([k, v], i) => (
          <div key={k as string} className="surface animate-rise px-4 py-3.5" style={{ animationDelay: `${i * 50}ms` }}>
            <p className="text-[10.5px] font-semibold tracking-[0.1em] text-slate-500 uppercase">{k}</p>
            <p className="font-display text-3xl font-extrabold text-navy-900 tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Card
            title={`K-Means cohorts (k=${c.k}, silhouette ${c.silhouette})`}
            subtitle="Select a cohort to show or hide it."
            right={
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Toggle cohorts">
                {c.clusters.map((cl) => {
                  const off = hidden.has(cl.id);
                  return (
                    <button
                      key={cl.id}
                      onClick={() => toggle(cl.id)}
                      aria-pressed={!off}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${
                        off ? "bg-white text-slate-400 ring-slate-200" : "bg-white text-navy-900 ring-navy-900/10 hover:bg-canvas"
                      }`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: off ? "#cbd5e1" : COLORS[cl.id % COLORS.length] }} />
                      Cohort {cl.id}
                    </button>
                  );
                })}
              </div>
            }
          >
            <div className="h-[26rem] rounded-2xl bg-canvas/70 p-2">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dbe7f5" />
                  <XAxis type="number" dataKey="x" name="PC1" tick={{ fontSize: 11, fill: "#5b6f8c" }} axisLine={false} tickLine={false} />
                  <YAxis type="number" dataKey="y" name="PC2" tick={{ fontSize: 11, fill: "#5b6f8c" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3", stroke: "#94a3b8" }}
                    content={({ payload }) => {
                      const pt = payload?.[0]?.payload as C["points"][number] | undefined;
                      if (!pt) return null;
                      const p = byId[pt.patient_id];
                      return (
                        <div className="rounded-xl bg-white px-3 py-2 text-xs shadow-lift ring-1 ring-navy-900/5">
                          <b className="text-navy-900">{pt.patient_id}</b> · cohort {pt.cluster}
                          {p && (
                            <div className="text-slate-600">
                              {p.age} y · {p.conditions.join(", ")}
                            </div>
                          )}
                          {pt.excluded_from_fit && <div className="text-rose-600">implausible data, not used to fit</div>}
                        </div>
                      );
                    }}
                  />
                  {c.clusters
                    .filter((cl) => !hidden.has(cl.id))
                    .map((cl) => (
                      <Scatter
                        key={cl.id}
                        name={`Cohort ${cl.id}: ${cl.label}`}
                        data={c.points.filter((p) => p.cluster === cl.id)}
                        fill={COLORS[cl.id % COLORS.length]}
                        fillOpacity={0.85}
                        animationDuration={700}
                      />
                    ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              {c.note} Axes are the first two principal components of standardized age and labs. With 30 patients the clusters
              are descriptive, not predictive.
            </p>
          </Card>
        </div>
        <Card title="Cohort profiles" subtitle="Mean values per cluster.">
          <div className="space-y-3">
            {c.clusters.map((cl, i) => {
              const color = COLORS[cl.id % COLORS.length];
              return (
                <div
                  key={cl.id}
                  className={`animate-rise rounded-2xl bg-canvas p-3.5 ring-1 ring-navy-900/5 transition ${hidden.has(cl.id) ? "opacity-50" : ""}`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-xl text-white" style={{ background: color }}>
                      <Icon name="cluster" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-navy-900">
                        Cohort {cl.id} · {cl.size} patients
                      </p>
                      <p className="text-xs text-slate-600">{cl.label}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {Object.entries(cl.means).map(([k, v]) => (
                      <span key={k} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 tabular-nums ring-1 ring-navy-900/5">
                        <span className="text-slate-400">{k}</span> {v}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
