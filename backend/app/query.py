"""Natural-language cohort questions -> a validated filter over saved verdicts. The LLM never touches SQL."""
from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel, Field, ValidationError

from . import db, llm
from .security import GUARD, untrusted


class Filter(BaseModel):
    trial_id: Optional[str] = None
    decision: Optional[str] = Field(default=None, pattern="^(ELIGIBLE|NOT_ELIGIBLE|NEEDS_REVIEW)$")
    min_age: Optional[int] = Field(default=None, ge=0, le=130)
    max_age: Optional[int] = Field(default=None, ge=0, le=130)
    sex: Optional[str] = Field(default=None, pattern="^(F|M)$")
    condition: Optional[str] = Field(default=None, max_length=60)
    flagged: Optional[bool] = None


PROMPT = """Turn the question into a JSON filter over screening results.
Trials: {trials}
Keys (all optional): trial_id (one of the ids), decision (ELIGIBLE|NOT_ELIGIBLE|NEEDS_REVIEW),
min_age, max_age (integers), sex (F|M), condition (substring), flagged (true for anomaly/contradiction flags).
Question: {q}
Reply with JSON only."""

TRIAL_WORDS = {"diab": "T1-DIAB", "glp": "T1-DIAB", "hypert": "T2-HTN", "blood pressure": "T2-HTN", "htn": "T2-HTN",
               "kidney": "T3-CKD", "ckd": "T3-CKD", "renal": "T3-CKD", "breast": "T4-BRCA", "her2": "T4-BRCA",
               "cancer": "T4-BRCA"}


def parse_offline(q: str) -> Filter:
    low = q.lower()
    f: dict = {}
    trial_ids = {t.id for t in db.get_trials()}
    for tid in trial_ids:
        if tid.lower() in low:
            f["trial_id"] = tid
    if "trial_id" not in f:
        for word, tid in TRIAL_WORDS.items():
            if word in low and tid in trial_ids:
                f["trial_id"] = tid
                break
    if re.search(r"not eligible|ineligible|excluded", low):
        f["decision"] = "NOT_ELIGIBLE"
    elif re.search(r"review|unsure|uncertain|unknown", low):
        f["decision"] = "NEEDS_REVIEW"
    elif "eligible" in low:
        f["decision"] = "ELIGIBLE"
    m = re.search(r"(?:over|older than|above|>)\s*(\d+)", low)
    if m:
        f["min_age"] = int(m.group(1)) + 1
    m = re.search(r"(?:at least|aged)\s*(\d+)", low)
    if m:
        f["min_age"] = int(m.group(1))
    m = re.search(r"(?:under|younger than|below|<)\s*(\d+)", low)
    if m:
        f["max_age"] = int(m.group(1)) - 1
    if re.search(r"\b(women|female|females)\b", low):
        f["sex"] = "F"
    elif re.search(r"\b(men|male|males)\b", low):
        f["sex"] = "M"
    if re.search(r"flag|anomal|outlier|contradict", low):
        f["flagged"] = True
    return Filter(**f)


def to_filter(q: str) -> tuple[Filter, str]:
    if llm.llm_available():
        trials = ", ".join(f"{t.id} ({t.condition})" for t in db.get_trials())
        try:
            data = llm.extract_json(llm.complete(GUARD, PROMPT.format(trials=trials, q=untrusted(q, 500))))
            return Filter(**{k: v for k, v in data.items() if v is not None}), "llm"
        except (ValueError, ValidationError, TypeError, AttributeError):
            pass
    return parse_offline(q), "keyword parser"


def answer(q: str) -> dict:
    f, by = to_filter(q)
    patients = {p.id: p for p in db.get_patients()}
    rows = []
    for v in db.get_verdicts(f.trial_id):
        p = patients.get(v["patient_id"])
        if p is None:
            continue
        if f.decision and v["decision"] != f.decision:
            continue
        if f.min_age is not None and (p.age is None or p.age < f.min_age):
            continue
        if f.max_age is not None and (p.age is None or p.age > f.max_age):
            continue
        if f.sex and (p.sex or "")[:1].upper() != f.sex:
            continue
        if f.condition and not any(f.condition.lower() in c.lower() for c in p.conditions):
            continue
        if f.flagged and not v.get("flags"):
            continue
        rows.append({"patient_id": p.id, "trial_id": v["trial_id"], "decision": v["decision"], "age": p.age,
                     "sex": p.sex, "confidence": v["confidence"], "flags": v.get("flags", [])})
    rows.sort(key=lambda r: (r["trial_id"], r["patient_id"]))
    applied = {k: v for k, v in f.model_dump().items() if v is not None}
    text = (f"Found {len(rows)} result(s) matching {applied or 'no filter'}."
            if rows else f"No saved screening results match {applied or 'the question'}. Run screening first.")
    return {"question": q, "filter": applied, "parsed_by": by, "answer": text, "rows": rows}
