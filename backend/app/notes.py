"""Offline note reader: negation- and time-aware keyword matching over clinical notes.

Used when no LLM is configured, when the LLM call fails, and for structured-vs-note
contradiction detection (which must stay deterministic).
"""
from __future__ import annotations

import re
from typing import Optional

from .models import Patient, Rule, Status

NEGATION = re.compile(r"\b(no|not|denies|denied|without|negative for|free of|never|ruled out|absence of)\b", re.I)
AGO = re.compile(r"(\d+)\s*(day|week|month|year)s?\s+ago", re.I)
WINDOW = re.compile(r"(?:within|in) the (?:past|last) (\d+)\s*(day|week|month|year)s?", re.I)
TO_MONTHS = {"day": 1 / 30, "week": 0.25, "month": 1, "year": 12}

CONCEPTS = {
    "myocardial infarction": [r"myocardial infarction", r"heart attack", r"\bn?stemi\b", r"\bmi\b"],
    "stroke": [r"\bstroke\b", r"\bcva\b"],
    "dialysis": [r"dialysis"],
    "brain metastases": [r"brain metasta\w*", r"brain mets", r"cns metasta\w*"],
    "pregnant": [r"\bpregnan\w*", r"weeks gestation"],
    "insulin": [r"\binsulin\b"],
    "heart failure": [r"heart failure", r"\bhfref\b", r"\bchf\b"],
    "kidney transplant": [r"(kidney|renal) transplant"],
    "spironolactone": [r"spironolactone"],
    "doxorubicin": [r"doxorubicin"],
}


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"[.;\n]+", text or "") if s.strip()]


def concepts_in(text: str) -> list[str]:
    low = text.lower()
    return [c for c in CONCEPTS if c in low]


def find_mentions(notes: str, concept: str) -> list[tuple[str, bool]]:
    """Return (sentence, negated) for every sentence mentioning the concept."""
    out = []
    for s in sentences(notes):
        for pat in CONCEPTS.get(concept, [re.escape(concept)]):
            m = re.search(pat, s, re.I)
            if m:
                out.append((s, bool(NEGATION.search(s[: m.start()]))))
                break
    return out


def check_note_rule_heuristic(rule: Rule, patient: Patient) -> tuple[Status, str]:
    """Decide whether the notes show the criterion statement is true."""
    concepts = concepts_in(rule.source_text or str(rule.value))
    if not concepts:
        return Status.UNKNOWN, "criterion not recognised by offline note reader"
    window = WINDOW.search(rule.source_text or "")
    window_months = int(window.group(1)) * TO_MONTHS[window.group(2).lower()] if window else None
    affirmed, negated, undated = [], [], []
    for c in concepts:
        for sent, neg in find_mentions(patient.notes, c):
            if neg:
                negated.append(sent)
                continue
            ago = AGO.search(sent)
            if window_months is not None and ago:
                months = int(ago.group(1)) * TO_MONTHS[ago.group(2).lower()]
                (affirmed if months <= window_months else negated).append(sent)
            elif window_months is not None:
                undated.append(sent)
            else:
                affirmed.append(sent)
    if affirmed:
        return Status.MET, f'note: "{affirmed[0]}"'
    if undated:
        return Status.UNKNOWN, f'note mentions it without a date: "{undated[0]}"'
    if negated:
        return Status.NOT_MET, f'note: "{negated[0]}"'
    return Status.UNKNOWN, "not documented in notes"


def contradiction(rule: Rule, patient: Patient) -> Optional[str]:
    """Detect a clinical note that disagrees with the structured field a rule was evaluated on."""
    if rule.field == "pregnant":
        concept, structured = "pregnant", patient.pregnant
    elif rule.field in ("conditions", "medications"):
        concept = next((c for c in concepts_in(str(rule.value)) if c != "pregnant"), None)
        if concept is None:
            return None
        from .rules import list_contains
        structured = list_contains(getattr(patient, rule.field), str(rule.value))
    else:
        return None
    if structured is None:
        return None
    mentions = find_mentions(patient.notes, concept)
    if not mentions:
        return None
    note_says = not all(neg for _, neg in mentions)
    if note_says != bool(structured):
        return (f"structured {rule.field} says {'yes' if structured else 'no'} but note says "
                f"\"{mentions[0][0]}\"")
    return None


def temporal_facts(rule: Rule, patient: Patient) -> Optional[dict]:
    """Timeline data for a time-windowed criterion, taken only from dates stated in the note."""
    window = WINDOW.search(rule.source_text or "")
    if not window:
        return None
    window_months = int(window.group(1)) * TO_MONTHS[window.group(2).lower()]
    events = []
    for c in concepts_in(rule.source_text):
        for sent, neg in find_mentions(patient.notes, c):
            ago = AGO.search(sent)
            months = int(ago.group(1)) * TO_MONTHS[ago.group(2).lower()] if ago else None
            events.append({"concept": c, "sentence": sent, "negated": neg,
                           "months_ago": round(months, 2) if months is not None else None,
                           "stated_as": ago.group(0) if ago else None,
                           "inside_window": None if months is None or neg else months <= window_months})
    return {"window_months": window_months, "window_text": window.group(0), "events": events}
