"""LLM-facing language work: note-based criteria, rationales. Each has an offline fallback."""
from __future__ import annotations

import json

from . import llm, notes
from .models import CriterionResult, Decision, Patient, Rule, Status, Verdict
from .rules import deciding
from .security import GUARD, looks_like_injection, untrusted

NOTE_PROMPT = """Criterion ({kind}): "{criterion}"
Does the patient's clinical note show this criterion statement is TRUE?
Handle negation ("no history of X" means X is absent) and time windows carefully.
If the note does not mention it, answer UNKNOWN. Never guess.
Patient note:
{note}
Reply with JSON only: {{"status": "MET"|"NOT_MET"|"UNKNOWN", "evidence": "<quote from note or 'not mentioned'>"}}"""

EXPLAIN_PROMPT = """Write a 3 to 5 sentence rationale for a clinical-trial screening decision.
The decision is final and was made by a rule engine: {decision}. Do not contradict it.
Name each deciding criterion, the patient's value, and cite its protocol section in brackets like [Inclusion 3].
Criteria results (JSON):
{results}
Write plain text only, no lists."""

DECISION_WORDS = {
    Decision.ELIGIBLE: ("eligible",),
    Decision.NOT_ELIGIBLE: ("not eligible", "ineligible", "excluded", "does not meet", "fails"),
    Decision.NEEDS_REVIEW: ("review", "unknown", "cannot be determined", "missing", "unclear"),
}


def check_note_rule(rule: Rule, patient: Patient) -> CriterionResult:
    base = dict(rule_id=rule.id, kind=rule.kind, source_text=rule.source_text, section=rule.section)
    if looks_like_injection(patient.notes):
        return CriterionResult(**base, status=Status.UNKNOWN, patient_value="note flagged",
                               evaluated_by="guard", detail="possible prompt injection in note; sent to human review")
    if llm.llm_available():
        raw = llm.complete(GUARD, NOTE_PROMPT.format(kind=rule.kind, criterion=rule.source_text,
                                                     note=untrusted(patient.notes)))
        try:
            data = llm.extract_json(raw)
            status = Status(str(data.get("status", "")).upper())
            if status in (Status.MET, Status.NOT_MET, Status.UNKNOWN):
                return CriterionResult(**base, status=status, patient_value=str(data.get("evidence", ""))[:300],
                                       evaluated_by="llm", detail="LLM read of clinical note")
        except (ValueError, json.JSONDecodeError, AttributeError):
            pass
    status, evidence = notes.check_note_rule_heuristic(rule, patient)
    return CriterionResult(**base, status=status, patient_value=evidence, evaluated_by="note-reader",
                           detail="offline negation-aware note reader")


def _phrase(r: CriterionResult) -> str:
    val = r.patient_value
    if isinstance(val, list):
        val = ", ".join(val) or "none recorded"
    state = {
        Status.MET: "is met" if r.kind == "inclusion" else "applies",
        Status.NOT_MET: "is not met" if r.kind == "inclusion" else "does not apply",
        Status.UNKNOWN: "could not be determined",
        Status.PENDING: "is pending note review",
    }[r.status]
    why = f" ({r.detail})" if r.status == Status.UNKNOWN and r.detail else ""
    return f'{r.kind.capitalize()} criterion "{r.source_text}" {state}; patient value: {val}{why} [{r.section}].'


def template_rationale(v: Verdict) -> str:
    key = deciding(v.results)
    head = {
        Decision.ELIGIBLE: f"The patient is eligible: all {len(v.results)} criteria were checked and passed.",
        Decision.NOT_ELIGIBLE: "The patient is not eligible for this trial.",
        Decision.NEEDS_REVIEW: "Eligibility cannot be confirmed automatically, so this case needs human review.",
    }[v.decision]
    seen, shown = set(), []
    for r in key:
        if r.source_text not in seen:
            seen.add(r.source_text)
            shown.append(r)
    return " ".join([head] + [_phrase(r) for r in shown[:3]])


def consistent(text: str, decision: Decision) -> bool:
    low = (text or "").lower()
    if decision == Decision.ELIGIBLE and any(w in low for w in ("not eligible", "ineligible")):
        return False
    if decision != Decision.ELIGIBLE and ("is eligible" in low and "not eligible" not in low):
        return False
    return any(w in low for w in DECISION_WORDS[decision])


def explain(v: Verdict) -> tuple[str, list[str]]:
    """Return (rationale, corrections). The rationale is verified against the decision."""
    corrections: list[str] = []
    if llm.llm_available():
        results = [{"section": r.section, "kind": r.kind, "criterion": r.source_text, "status": r.status.value,
                    "patient_value": r.patient_value} for r in deciding(v.results)]
        for attempt in range(2):
            text = llm.complete("You write concise, factual clinical screening rationales.",
                                EXPLAIN_PROMPT.format(decision=v.decision.value, results=json.dumps(results, default=str)))
            if text and consistent(text, v.decision):
                return text.strip(), corrections
            corrections.append(f"LLM rationale attempt {attempt + 1} contradicted decision {v.decision.value}; retried")
        corrections.append("fell back to template rationale")
    return template_rationale(v), corrections
