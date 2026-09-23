"""ML features: anomaly detection, cohort clustering, trial ranking.

None of these change an eligibility decision on their own. The only thing that affects a
verdict is the deterministic physiological range check in rules.py; Isolation Forest adds an
advisory multivariate outlier flag with human-readable reasons.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler

from .models import Patient
from .rules import CANONICAL_UNITS, PLAUSIBLE_RANGES, PRETTY, convert, lab_value

FEATURES = ["age", "hba1c", "egfr", "bmi", "systolic_bp", "fasting_glucose", "weight"]


def _row(p: Patient) -> list[float]:
    row = []
    for f in FEATURES:
        if f == "age":
            row.append(float(p.age) if p.age is not None else np.nan)
            continue
        v, u = lab_value(p, f)
        c = convert(v, u, f) if v is not None else None
        row.append(c if c is not None else np.nan)
    return row


def _matrix(patients: list[Patient]) -> np.ndarray:
    return np.array([_row(p) for p in patients], dtype=float)


def range_violations(p: Patient) -> list[str]:
    out = []
    for f, v in zip(FEATURES, _row(p)):
        lo, hi = PLAUSIBLE_RANGES[f]
        if not np.isnan(v) and not lo <= v <= hi:
            out.append(f"{PRETTY.get(f, f)} {v:g} {CANONICAL_UNITS.get(f, '')} outside plausible range {lo}-{hi}".strip())
    return out


def anomalies(patients: list[Patient]) -> dict[str, dict]:
    X = _matrix(patients)
    med = np.nanmedian(X, axis=0)
    Xi = np.where(np.isnan(X), med, X)
    scaler = StandardScaler().fit(Xi)
    Z = scaler.transform(Xi)
    forest = IsolationForest(n_estimators=300, contamination=0.07, random_state=42).fit(Z)
    scores = -forest.score_samples(Z)
    flags = forest.predict(Z) == -1
    out = {}
    for i, p in enumerate(patients):
        reasons = range_violations(p)
        z = Z[i]
        top = [FEATURES[j] for j in np.argsort(-np.abs(z))[:2] if abs(z[j]) >= 2.0 and not np.isnan(X[i, j])]
        for f in top:
            j = FEATURES.index(f)
            direction = "high" if z[j] > 0 else "low"
            reasons.append(f"{PRETTY.get(f, f)} unusually {direction} ({X[i, j]:.1f}, z={z[j]:+.1f})")
        out[p.id] = {
            "implausible": bool(range_violations(p)),
            "outlier": bool(flags[i]) or bool(range_violations(p)),
            "score": round(float(scores[i]), 3),
            "reasons": list(dict.fromkeys(reasons)),
        }
    return out


def cohorts(patients: list[Patient], k: int | None = None) -> dict:
    X = _matrix(patients)
    med = np.nanmedian(X, axis=0)
    Xi = np.where(np.isnan(X), med, X)
    keep = np.array([not range_violations(p) for p in patients])
    Z = StandardScaler().fit_transform(Xi)
    best = None
    for kk in ([k] if k else [2, 3, 4]):
        km = KMeans(n_clusters=kk, n_init=10, random_state=42).fit(Z[keep])
        s = silhouette_score(Z[keep], km.labels_)
        if best is None or s > best[1]:
            best = (km, s, kk)
    km, sil, kk = best
    labels = km.predict(Z)
    xy = PCA(n_components=2, random_state=42).fit_transform(Z)
    clusters = []
    for c in range(kk):
        idx = labels == c
        means = Xi[idx].mean(axis=0)
        zc = Z[idx].mean(axis=0)
        traits = [f"{'high' if zc[j] > 0 else 'low'} {PRETTY.get(FEATURES[j], FEATURES[j])}"
                  for j in np.argsort(-np.abs(zc))[:2]]
        clusters.append({"id": c, "size": int(idx.sum()), "label": ", ".join(traits),
                         "means": {f: round(float(m), 1) for f, m in zip(FEATURES, means)}})
    points = [{"patient_id": p.id, "cluster": int(labels[i]), "x": round(float(xy[i, 0]), 3),
               "y": round(float(xy[i, 1]), 3), "excluded_from_fit": bool(not keep[i])}
              for i, p in enumerate(patients)]
    return {"k": kk, "silhouette": round(float(sil), 3), "clusters": clusters, "points": points,
            "note": "k chosen by silhouette score; implausible records excluded from fitting."}


def profile_text(p: Patient) -> str:
    return " ".join([f"age {p.age}", f"sex {p.sex}", *p.conditions, *p.medications, p.notes])


@lru_cache(maxsize=8)
def _trial_vec(texts: tuple[str, ...]):
    vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english")
    return vec, vec.fit_transform(list(texts))


def rank_trials(p: Patient, trials, verdicts: dict[str, str]) -> list[dict]:
    texts = tuple(f"{t.title} {t.condition} {t.criteria_text}" for t in trials)
    vec, mat = _trial_vec(texts)
    sims = cosine_similarity(vec.transform([profile_text(p)]), mat)[0]
    weight = {"ELIGIBLE": 1.0, "NEEDS_REVIEW": 0.5, "NOT_ELIGIBLE": 0.0}
    out = []
    for t, s in zip(trials, sims):
        d = verdicts.get(t.id)
        score = 0.7 * weight.get(d, 0.25) + 0.3 * float(s)
        out.append({"trial_id": t.id, "title": t.title, "similarity": round(float(s), 3), "decision": d,
                    "score": round(score, 3)})
    return sorted(out, key=lambda r: -r["score"])
