"""Accuracy against hand-checked labels, plus explanation-clarity scores and an optional pure-LLM baseline."""
from __future__ import annotations

import json
import time

from . import config, db, llm
from .judge import judge
from .parser import parse_criteria
from .screening import anomaly_flags, screen_one
from .security import GUARD, untrusted

CLASSES = ["ELIGIBLE", "NOT_ELIGIBLE", "NEEDS_REVIEW"]


def load_labels() -> dict[tuple[str, str], dict]:
    data = json.loads((config.DATA_DIR / "labels.json").read_text())
    return {(d["patient_id"], d["trial_id"]): d for d in data}


def score(pairs: list[tuple[str, str]]) -> dict:
    """pairs: (expected, predicted)."""
    n = len(pairs)
    correct = sum(e == p for e, p in pairs)
    matrix = [[sum(1 for e, p in pairs if e == a and p == b) for b in CLASSES] for a in CLASSES]
    per_class = {}
    for c in CLASSES:
        tp = sum(e == c and p == c for e, p in pairs)
        fp = sum(e != c and p == c for e, p in pairs)
        fn = sum(e == c and p != c for e, p in pairs)
        per_class[c] = {"precision": round(tp / (tp + fp), 3) if tp + fp else None,
                        "recall": round(tp / (tp + fn), 3) if tp + fn else None, "support": tp + fn}
    for c in CLASSES:
        pc = per_class[c]
        p_, r_ = pc["precision"], pc["recall"]
        pc["f1"] = round(2 * p_ * r_ / (p_ + r_), 3) if p_ and r_ else (0.0 if pc["support"] else None)
    tp = per_class["ELIGIBLE"]
    f1s = [per_class[c]["f1"] for c in CLASSES if per_class[c]["support"]]
    return {"n": n, "correct": correct, "accuracy": round(correct / n, 4) if n else 0.0,
            "precision": tp["precision"], "recall": tp["recall"], "f1": tp["f1"],
            "macro_f1": round(sum(f1s) / len(f1s), 3) if f1s else None, "labels": CLASSES,
            "confusion_matrix": matrix, "per_class": per_class}


def run(refresh: bool = False, with_baseline: bool = False) -> dict:
    cached = db.kv_get("metrics")
    if cached and not refresh and (not with_baseline or cached.get("baseline")):
        return cached
    t0 = time.time()
    labels = load_labels()
    trials = {t.id: t for t in db.benchmark_trials()}
    patients = {p.id: p for p in db.benchmark_patients()}
    flags = anomaly_flags(list(patients.values()))
    pairs, relevant, mismatches, judged, per_trial = [], [], [], [], {}
    for tid, trial in trials.items():
        rules, _ = parse_criteria(trial)
        for pid, patient in patients.items():
            lab = labels.get((pid, tid))
            v = screen_one(trial, patient, rules, flags, save=False)
            if len(judged) < (40 if llm.llm_available() else 10_000):
                judged.append(judge(v))
            if lab is None:
                continue
            exp, got = lab["expected"], v.decision.value
            pairs.append((exp, got))
            if lab.get("relevant"):
                relevant.append((exp, got))
            per_trial.setdefault(tid, []).append((exp, got))
            if exp != got:
                mismatches.append({"patient_id": pid, "trial_id": tid, "expected": exp, "predicted": got,
                                   "label_comment": lab["comment"], "rationale": v.rationale})
    out = score(pairs)
    out["per_trial"] = {tid: {"accuracy": score(p)["accuracy"], "n": len(p)} for tid, p in per_trial.items()}
    out["relevant"] = {**score(relevant), "description": "pairs where the patient has the trial's target condition"}
    out["mismatches"] = mismatches
    out["judge"] = {"avg_clarity": round(sum(j["score"] for j in judged) / len(judged), 2) if judged else None,
                    "n": len(judged), "mode": judged[0]["judge"] if judged else None,
                    "distribution": {s: sum(j["score"] == s for j in judged) for s in range(1, 6)},
                    "samples": judged[:5]}
    out["mode"] = "llm" if llm.llm_available() else "offline (deterministic parser + note reader)"
    out["dataset"] = {"patients": len(patients), "trials": len(trials), "labeled_pairs": len(labels),
                      "label_mix": {c: sum(v["expected"] == c for v in labels.values()) for c in CLASSES},
                      "source": "synthetic, backend/data/generate.py (labels from independent ground-truth functions)"}
    out["seconds"] = round(time.time() - t0, 2)
    out["target"] = 0.85
    out["baseline"] = baseline(labels, trials, patients) if with_baseline else (cached or {}).get("baseline")
    db.kv_set("metrics", out)
    return out


BASELINE_PROMPT = """Decide if this patient is eligible for the clinical trial.
Answer ELIGIBLE, NOT_ELIGIBLE, or NEEDS_REVIEW (if data is missing, contradictory, or implausible).
Trial criteria:
{criteria}
Patient record (JSON):
{patient}
Reply with JSON only: {{"decision": "..."}}"""


def baseline(labels, trials, patients) -> dict:
    """Pure-LLM approach with no rule engine, for comparison against the hybrid system."""
    if not llm.llm_available():
        return {"available": False, "reason": "no LLM configured (set LLM_BASE_URL and LLM_MODEL)"}
    pairs = []
    for (pid, tid), lab in labels.items():
        raw = llm.complete(GUARD, BASELINE_PROMPT.format(criteria=untrusted(trials[tid].criteria_text),
                                                         patient=untrusted(patients[pid].model_dump_json())))
        try:
            got = str(llm.extract_json(raw)["decision"]).upper()
        except (ValueError, KeyError, TypeError):
            got = "NEEDS_REVIEW"
        pairs.append((lab["expected"], got if got in CLASSES else "NEEDS_REVIEW"))
    return {"available": True, **score(pairs)}
