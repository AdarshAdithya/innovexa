import { useEffect, useState } from "react";
import { CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Cohorts as C, type Patient } from "../api";
import { Card, ErrorBox, Spinner } from "../components/ui";

const COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2"];

export default function Cohorts({ patients }: { patients: Patient[] }) {
  const [c, setC] = useState<C | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.cohorts().then(setC).catch((e) => setError(String(e.message)));
  }, []);
  if (error) return <ErrorBox error={error} />;
  if (!c) return <Spinner />;
  const byId = Object.fromEntries(patients.map((p) => [p.id, p]));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card title={`K-Means cohorts (k=${c.k}, silhouette ${c.silhouette})`}>
          <div className="h-96">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" name="PC1" tick={{ fontSize: 11 }} />
                <YAxis type="number" dataKey="y" name="PC2" tick={{ fontSize: 11 }} />
                <Tooltip
                  content={({ payload }) => {
                    const pt = payload?.[0]?.payload as C["points"][number] | undefined;
                    if (!pt) return null;
                    const p = byId[pt.patient_id];
                    return (
                      <div className="rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow">
                        <b>{pt.patient_id}</b> · cohort {pt.cluster}
                        {p && <div>{p.age} y · {p.conditions.join(", ")}</div>}
                        {pt.excluded_from_fit && <div className="text-rose-600">implausible data, not used to fit</div>}
                      </div>
                    );
                  }}
                />
                <Legend />
                {c.clusters.map((cl) => (
                  <Scatter
                    key={cl.id}
                    name={`Cohort ${cl.id}: ${cl.label}`}
                    data={c.points.filter((p) => p.cluster === cl.id)}
                    fill={COLORS[cl.id % COLORS.length]}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {c.note} Axes are the first two principal components of standardized age and labs. With 30 patients the clusters
            are descriptive, not predictive.
          </p>
        </Card>
      </div>
      <Card title="Cohort profiles">
        <div className="space-y-3">
          {c.clusters.map((cl) => (
            <div key={cl.id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold" style={{ color: COLORS[cl.id % COLORS.length] }}>
                Cohort {cl.id} · {cl.size} patients
              </p>
              <p className="text-xs text-slate-600">{cl.label}</p>
              <p className="mt-1 text-xs tabular-nums text-slate-500">
                {Object.entries(cl.means)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
