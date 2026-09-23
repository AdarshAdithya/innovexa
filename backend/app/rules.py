"""Deterministic rule engine. No LLM in this file: every decision is plain, testable Python."""
from __future__ import annotations

from typing import Any, Optional

from .models import CriterionResult, Decision, LabValue, Patient, Rule, Status

CANONICAL_UNITS = {
    "hba1c": "%", "egfr": "mL/min/1.73m2", "bmi": "kg/m2", "systolic_bp": "mmHg",
    "fasting_glucose": "mg/dL", "weight": "kg",
}

PLAUSIBLE_RANGES = {
    "age": (0, 120), "hba1c": (3, 20), "egfr": (1, 200), "bmi": (10, 80),
    "systolic_bp": (60, 260), "fasting_glucose": (20, 1000), "weight": (20, 350),
}

SYNONYMS = {
    "type 2 diabetes": ["type 2 diabetes", "type ii diabetes", "t2dm", "t2d", "diabetes mellitus type 2"],
    "hypertension": ["hypertension", "htn", "high blood pressure"],
    "chronic kidney disease": ["chronic kidney disease", "ckd"],
    "heart failure": ["heart failure", "chf", "hfref", "hfpef"],
    "kidney transplant": ["kidney transplant", "renal transplant"],
    "breast cancer": ["breast cancer", "breast carcinoma", "invasive ductal carcinoma"],
    "her2-positive": ["her2-positive", "her2 positive", "her2+"],
    "insulin": ["insulin"],
    "myocardial infarction": ["myocardial infarction", "heart attack", "stemi", "nstemi"],
}


def _norm_unit(u: Optional[str]) -> str:
    return (u or "").replace(" ", "").lower()


def convert(value: float, from_unit: Optional[str], field: str, to_unit: Optional[str] = None) -> Optional[float]:
    """Convert a lab value into the unit the rule uses (canonical unit by default)."""
    src = _norm_unit(from_unit) or _norm_unit(CANONICAL_UNITS.get(field))
    dst = _norm_unit(to_unit) or _norm_unit(CANONICAL_UNITS.get(field))
    if src == dst or not src or not dst:
        return value
    table = {
        ("mmol/l", "mg/dl"): lambda v: v * 18.0,
        ("mg/dl", "mmol/l"): lambda v: v / 18.0,
        ("lb", "kg"): lambda v: v * 0.45359237,
        ("lbs", "kg"): lambda v: v * 0.45359237,
        ("kg", "lb"): lambda v: v / 0.45359237,
        ("mmol/mol", "%"): lambda v: v / 10.929 + 2.15,
        ("%", "mmol/mol"): lambda v: (v - 2.15) * 10.929,
    }
    fn = table.get((src, dst))
    return fn(value) if fn else None


def terms_for(value: str) -> list[str]:
    v = value.lower().strip()
    for key, syns in SYNONYMS.items():
        if v == key or v in syns:
            return syns
    return [v]


def list_contains(items: list[str], value: str) -> bool:
    terms = terms_for(value)
    for item in items:
        low = item.lower()
        if any(t in low for t in terms):
            return True
    return False


def lab_value(patient: Patient, field: str) -> tuple[Optional[float], Optional[str]]:
    raw = patient.labs.get(field)
    if raw is None:
        return None, None
    if isinstance(raw, LabValue):
        return raw.value, raw.unit
    if isinstance(raw, dict):
        return raw.get("value"), raw.get("unit")
    return float(raw), None


def _compare(a: float, op: str, b: float) -> bool:
    return {">=": a >= b, "<=": a <= b, ">": a > b, "<": a < b, "==": a == b, "!=": a != b}[op]


def _result(rule: Rule, status: Status, value: Any = None, detail: str = "", **extra) -> CriterionResult:
    base = dict(field=rule.field, operator=rule.operator, threshold=None if rule.field == "group" else rule.value,
                unit=rule.unit)
    base.update(extra)
    return CriterionResult(rule_id=rule.id, kind=rule.kind, source_text=rule.source_text, section=rule.section,
                           status=status, patient_value=value, evaluated_by="rules", detail=detail, **base)


def _tf(ok: bool) -> str:
    return "TRUE" if ok else "FALSE"


def evaluate(rule: Rule, patient: Patient) -> CriterionResult:
    """Return whether the criterion statement is true for the patient (MET/NOT_MET/UNKNOWN)."""
    if rule.operator == "any_of" or rule.any_of:
        children = [evaluate(r, patient) for r in rule.any_of or []]
        statuses = [c.status for c in children]
        if Status.MET in statuses:
            status = Status.MET
        elif statuses and all(s == Status.NOT_MET for s in statuses):
            status = Status.NOT_MET
        else:
            status = Status.UNKNOWN
        shown = "; ".join(f"{c.source_text or c.rule_id}: {c.status.value}" for c in children)
        return _result(rule, status, shown, "any of: " + shown)

    field, op = rule.field, rule.operator

    if field == "notes":
        return _result(rule, Status.PENDING, None, "needs note review")

    if field in ("conditions", "medications"):
        items = getattr(patient, field) or []
        found = list_contains(items, str(rule.value))
        if op == "contains":
            status = Status.MET if found else Status.NOT_MET
        elif op == "not_contains":
            status = Status.NOT_MET if found else Status.MET
        else:
            return _result(rule, Status.UNKNOWN, items, f"operator {op} not valid for {field}")
        cmp = f'"{rule.value}" {"in" if op == "contains" else "not in"} {field} = {_tf(status == Status.MET)}'
        return _result(rule, status, items or "none recorded", observed=items, comparison=cmp)

    if field == "sex":
        if not patient.sex:
            return _result(rule, Status.UNKNOWN, None, "sex missing")
        pv = patient.sex[0].upper()
        rv = str(rule.value)[0].upper()
        ok = (pv == rv) if op == "==" else (pv != rv)
        return _result(rule, Status.MET if ok else Status.NOT_MET, pv, observed=pv,
                       comparison=f"sex {pv} {op} {rv} = {_tf(ok)}")

    if field == "pregnant":
        preg = patient.pregnant
        if preg is None and patient.sex and patient.sex[0].upper() == "M":
            preg = False
        if preg is None:
            return _result(rule, Status.UNKNOWN, None, "pregnancy status missing")
        target = _truthy(rule.value)
        ok = (preg == target) if op == "==" else (preg != target)
        return _result(rule, Status.MET if ok else Status.NOT_MET, preg, observed=preg,
                       comparison=f"pregnant {preg} {op} {target} = {_tf(ok)}")

    if field == "age":
        if patient.age is None:
            return _result(rule, Status.UNKNOWN, None, "age missing")
        return _numeric(rule, float(patient.age), None, "age")

    value, unit = lab_value(patient, field)
    if value is None:
        return _result(rule, Status.UNKNOWN, None, f"{field} missing from record")
    return _numeric(rule, value, unit, field)


def _numeric(rule: Rule, value: float, unit: Optional[str], field: str) -> CriterionResult:
    canon = convert(value, unit, field)
    shown = f"{value:g} {unit}" if unit else f"{value:g}"
    if canon is None:
        return _result(rule, Status.UNKNOWN, shown, f"cannot convert {unit} for {field}")
    lo, hi = PLAUSIBLE_RANGES.get(field, (float("-inf"), float("inf")))
    if not lo <= canon <= hi:
        return _result(rule, Status.UNKNOWN, shown, f"implausible {field} value {canon:g} (expected {lo}-{hi})")
    target = convert(float(rule.value), rule.unit, field) if rule.unit else float(rule.value)
    if target is None:
        return _result(rule, Status.UNKNOWN, shown, f"cannot convert rule unit {rule.unit}")
    if unit and _norm_unit(unit) != _norm_unit(CANONICAL_UNITS.get(field)):
        shown = f"{shown} (= {canon:.1f} {CANONICAL_UNITS.get(field)})"
    ok = _compare(round(canon, 6), rule.operator, round(target, 6))
    cu = "" if field == "age" else f" {CANONICAL_UNITS.get(field, '')}".rstrip()
    cmp = f"{canon:.4g}{cu} {rule.operator} {target:.4g}{cu} = {_tf(ok)}"
    return _result(rule, Status.MET if ok else Status.NOT_MET, shown, observed=round(canon, 3),
                   comparison=cmp, threshold=round(target, 3), unit=cu.strip() or None)


def _truthy(v: Any) -> bool:
    return v is True or str(v).lower() in ("true", "yes", "1")


def decide(results: list[CriterionResult]) -> Decision:
    if any(r.kind == "exclusion" and r.status == Status.MET for r in results):
        return Decision.NOT_ELIGIBLE
    if any(r.kind == "inclusion" and r.status == Status.NOT_MET for r in results):
        return Decision.NOT_ELIGIBLE
    if any(r.status in (Status.UNKNOWN, Status.PENDING) for r in results):
        return Decision.NEEDS_REVIEW
    if not results:
        return Decision.NEEDS_REVIEW
    return Decision.ELIGIBLE


def confidence(results: list[CriterionResult]) -> float:
    if not results:
        return 0.0
    known = sum(r.status in (Status.MET, Status.NOT_MET) for r in results)
    return round(known / len(results), 3)


def deciding(results: list[CriterionResult]) -> list[CriterionResult]:
    blockers = [r for r in results if (r.kind == "exclusion" and r.status == Status.MET)
                or (r.kind == "inclusion" and r.status == Status.NOT_MET)]
    if blockers:
        return blockers
    unknown = [r for r in results if r.status in (Status.UNKNOWN, Status.PENDING)]
    return unknown or results


NEGATE = {">=": "<", "<=": ">", ">": "<=", "<": ">=", "==": "!=", "!=": "=="}
PRETTY = {"hba1c": "HbA1c", "egfr": "eGFR", "bmi": "BMI", "systolic_bp": "systolic BP",
          "fasting_glucose": "fasting glucose", "weight": "weight", "age": "age"}


def counterfactuals(rules: list[Rule], results: list[CriterionResult]) -> list[str]:
    """If exactly one numeric rule blocks eligibility, say what value would change the verdict."""
    blockers = [r for r in results if (r.kind == "exclusion" and r.status == Status.MET)
                or (r.kind == "inclusion" and r.status == Status.NOT_MET)]
    if len(blockers) != 1 or any(r.status in (Status.UNKNOWN, Status.PENDING) for r in results):
        return []
    rule = next((r for r in rules if r.id == blockers[0].rule_id), None)
    if rule is None or rule.field not in PRETTY:
        return []
    op = rule.operator if rule.kind == "inclusion" else NEGATE.get(rule.operator, rule.operator)
    unit = f" {rule.unit or CANONICAL_UNITS.get(rule.field, '')}".rstrip() if rule.field != "age" else ""
    return [f"Would be eligible if {PRETTY[rule.field]} {op} {rule.value:g}{unit}"]


def _required(rule: Rule) -> str:
    """What the patient needs for this criterion to stop blocking eligibility."""
    name = PRETTY.get(rule.field, rule.field)
    unit = "" if rule.field == "age" else f" {rule.unit or CANONICAL_UNITS.get(rule.field, '')}".rstrip()
    if rule.field in PRETTY:
        op = rule.operator if rule.kind == "inclusion" else NEGATE.get(rule.operator, rule.operator)
        return f"{name} {op} {rule.value:g}{unit}"
    if rule.field in ("conditions", "medications"):
        want = rule.operator == "contains" if rule.kind == "inclusion" else rule.operator != "contains"
        return f"{'recorded' if want else 'no recorded'} {rule.field[:-1]} '{rule.value}'"
    if rule.field == "sex":
        return f"sex {'==' if rule.kind == 'inclusion' else '!='} {rule.value}"
    if rule.field == "pregnant":
        return "not pregnant" if rule.kind == "exclusion" else "pregnant"
    if rule.field == "notes":
        return ("criterion documented as absent" if rule.kind == "exclusion" else "criterion documented as present")
    return rule.source_text


def why_not(rules: list[Rule], results: list[CriterionResult]) -> list[dict]:
    """For each blocking criterion: observed value, requirement, exact comparison and a rule-derived counterfactual."""
    by_id = {r.id: r for r in rules}
    out = []
    for res in results:
        blocking = (res.kind == "exclusion" and res.status == Status.MET) or \
                   (res.kind == "inclusion" and res.status == Status.NOT_MET)
        rule = by_id.get(res.rule_id)
        if not blocking or rule is None:
            continue
        cf = None
        if rule.field in PRETTY and isinstance(rule.value, (int, float)):
            req = _required(rule)
            cf = (f"This criterion would be satisfied if {req}." if rule.kind == "inclusion"
                  else f"This exclusion would no longer apply if {req}.")
        out.append({"rule_id": res.rule_id, "section": res.section, "kind": res.kind, "criterion": res.source_text,
                    "observed": res.patient_value, "observed_value": res.observed, "required": _required(rule),
                    "comparison": res.comparison,
                    "counterfactual": cf})
    return out
