from __future__ import annotations

import hashlib
from typing import Optional

from . import db, evidence, ml, notes
from .explainer import check_note_rule, explain
from .models import CriterionResult, Patient, Rule, Status, Trial, Verdict
from .parser import criteria_hash, parse_criteria
from .rules import confidence, counterfactuals, decide, evaluate, why_not

_anomaly_cache: dict[str, dict] = {}
_rate_cache: dict[str, dict] = {}


def anomaly_flags(patients: Optional[list[Patient]] = None) -> dict[str, dict]:
    patients = patients or db.get_patients()
    key = hashlib.sha256("".join(p.model_dump_json() for p in patients).encode()).hexdigest()
    if key not in _anomaly_cache:
        _anomaly_cache.clear()
        _anomaly_cache[key] = ml.anomalies(patients)
    return _anomaly_cache[key]


def evaluate_rules(rules: list[Rule], patient: Patient) -> list[CriterionResult]:
    results = []
    for rule in rules:
        r = evaluate(rule, patient)
        if r.status in (Status.MET, Status.NOT_MET):
            conflict = notes.contradiction(rule, patient)
            if conflict:
                r.status, r.evaluated_by, r.detail = Status.UNKNOWN, "rules+note-check", f"contradiction: {conflict}"
        results.append(r)
    return results


def offline_results(rules: list[Rule], patient: Patient) -> list[CriterionResult]:
    """Rule engine plus the deterministic note reader; never calls an LLM."""
    by_id = {r.id: r for r in rules}
    out = []
    for r in evaluate_rules(rules, patient):
        if r.status == Status.PENDING:
            status, ev = notes.check_note_rule_heuristic(by_id[r.rule_id], patient)
            r = r.model_copy(update={"status": status, "patient_value": ev, "evaluated_by": "note-reader"})
        out.append(r)
    return out


def cohort_rates(trial: Trial, rules: list[Rule]) -> dict[str, dict]:
    patients = db.get_patients()
    key = criteria_hash(trial) + trial.id + hashlib.sha256(
        "".join(p.model_dump_json() for p in patients).encode()).hexdigest()
    if key not in _rate_cache:
        if len(_rate_cache) > 32:
            _rate_cache.clear()
        _rate_cache[key] = evidence.block_rates([offline_results(rules, p) for p in patients])
    return _rate_cache[key]


def resolve_notes(rules: list[Rule], patient: Patient, results: list[CriterionResult]) -> list[CriterionResult]:
    by_id = {r.id: r for r in rules}
    return [check_note_rule(by_id[r.rule_id], patient) if r.status == Status.PENDING else r for r in results]


def build_verdict(trial: Trial, rules: list[Rule], patient: Patient, results: list[CriterionResult],
                  flags: Optional[dict] = None) -> Verdict:
    decision = decide(results)
    v = Verdict(patient_id=patient.id, trial_id=trial.id, decision=decision, results=results,
                confidence=confidence(results), citations=sorted({r.section for r in results if r.section}))
    info = (flags or {}).get(patient.id)
    if info and info["implausible"]:
        v.flags.append("implausible value: " + "; ".join(r for r in info["reasons"] if "plausible" in r))
    elif info and info["outlier"]:
        v.flags.append("outlier (advisory, Isolation Forest): " + ("; ".join(info["reasons"]) or f"score {info['score']}"))
    if any("contradiction" in r.detail for r in results):
        v.flags.append("contradiction between structured data and notes")
    v.counterfactuals = counterfactuals(rules, results)
    v.why_not = why_not(rules, results)
    v.evidence_summary = evidence.summary(results)
    if decision.value == "NEEDS_REVIEW":
        v.next_best_evidence = evidence.next_best_evidence(results, cohort_rates(trial, rules))
    v.rationale, v.corrections = explain(v)
    return v


def screen_one(trial: Trial, patient: Patient, rules: Optional[list[Rule]] = None,
               flags: Optional[dict] = None, save: bool = True) -> Verdict:
    rules = rules if rules is not None else parse_criteria(trial)[0]
    results = resolve_notes(rules, patient, evaluate_rules(rules, patient))
    v = build_verdict(trial, rules, patient, results, flags)
    if save:
        db.save_verdict(v, "pipeline")
    return v


def screen(trial_id: str, patient_ids: Optional[list[str]] = None) -> list[Verdict]:
    trial = db.get_trial(trial_id)
    if trial is None:
        raise KeyError(f"unknown trial {trial_id}")
    all_patients = db.get_patients()
    patients = [p for p in all_patients if not patient_ids or p.id in set(patient_ids)]
    rules, _ = parse_criteria(trial)
    flags = anomaly_flags(all_patients)
    return [screen_one(trial, p, rules, flags) for p in patients]


def opportunities(patient_id: str) -> dict:
    """Screen one patient against every trial: the trial opportunity map."""
    patient = db.get_patient(patient_id)
    if patient is None:
        raise KeyError(f"unknown patient {patient_id}")
    flags = anomaly_flags()
    rows = []
    for trial in db.get_trials():
        v = screen_one(trial, patient, flags=flags)
        rows.append({"trial_id": trial.id, "title": trial.title, "condition": trial.condition,
                     "decision": v.decision.value, "confidence": v.confidence, **v.evidence_summary,
                     "next_best_evidence": v.next_best_evidence, "why_not": v.why_not,
                     "verdict": v.model_dump(mode="json")})
    order = {"ELIGIBLE": 0, "NEEDS_REVIEW": 1, "NOT_ELIGIBLE": 2}
    rows.sort(key=lambda r: (order[r["decision"]], -r["passed"]))
    return {"patient": patient.model_dump(), "anomaly": flags.get(patient.id), "trials": rows}
