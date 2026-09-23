"""Criteria text -> JSON rules. LLM first (validated, retried once, cached), deterministic fallback."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Optional

from pydantic import TypeAdapter, ValidationError

from . import db, llm, rag
from .models import ALLOWED_FIELDS, ALLOWED_OPERATORS, Rule, Trial
from .security import GUARD, untrusted

NUM = r"(\d+(?:\.\d+)?)"
LAB_KEYWORDS = [
    ("hba1c", r"hba1c|a1c|glycated h(a)?emoglobin"),
    ("egfr", r"egfr|glomerular filtration"),
    ("bmi", r"\bbmi\b|body mass index"),
    ("systolic_bp", r"systolic blood pressure|systolic bp|\bsbp\b"),
    ("fasting_glucose", r"fasting (plasma )?glucose|\bfpg\b"),
    ("weight", r"body weight|\bweight\b"),
]
UNITS = [("mmol/l", "mmol/L"), ("mg/dl", "mg/dL"), ("mmol/mol", "mmol/mol"), ("lbs", "lb"), (" lb", "lb"),
         ("kg/m2", "kg/m2"), (" kg", "kg"), ("mmhg", "mmHg"), ("%", "%"), ("ml/min", "mL/min/1.73m2")]
CLEAN_CONDITION = [(r"\bmellitus\b", ""), (r"^essential\s+", ""), (r"\s+", " ")]

PROMPT = """You convert clinical-trial eligibility criteria into JSON rules.
Allowed fields: {fields}
Allowed operators: {ops}
Return ONLY a JSON array. One object per criterion (split ranges into two objects):
{{"id": "<trial>-I1", "kind": "inclusion"|"exclusion", "field": <field>, "operator": <op>,
  "value": <number|string|true|false>, "unit": <unit or null>, "source_text": <exact criterion text>}}
Rules:
- "kind" comes from the section the criterion is listed under.
- The rule states the criterion itself: an exclusion "eGFR below 45" is {{"field":"egfr","operator":"<","value":45}}.
- Diagnoses/history go to "conditions" with "contains"; drugs go to "medications" with "contains".
- "No history of X" is "not_contains". "Either A or B" is one object with "field":"group",
  "operator":"any_of","value":null and an "any_of" array of child rules.
- pregnancy is {{"field":"pregnant","operator":"==","value":true}}; sex uses "F" or "M".
- Anything that does not fit a field (time windows, procedures, imaging findings) uses "field":"notes",
  "operator":"contains","value":<short concept>.
Trial id: {tid}
{text}"""


def criteria_hash(trial: Trial) -> str:
    return hashlib.sha256(trial.criteria_text.encode()).hexdigest()[:16]


_rules_adapter = TypeAdapter(list[Rule])


def parse_criteria(trial: Trial, use_cache: bool = True) -> tuple[list[Rule], str]:
    h = criteria_hash(trial)
    if use_cache:
        cached = db.get_cached_rules(trial.id, h)
        if cached:
            return [Rule(**r) for r in cached[0]], cached[1] + " (cached)"
    rules, by = None, "deterministic"
    if llm.llm_available():
        rules = _parse_llm(trial)
        by = "llm" if rules else "deterministic (llm failed validation)"
    if not rules:
        rules = parse_deterministic(trial)
    db.cache_rules(trial.id, h, [r.model_dump() for r in rules], by)
    return rules, by


def _parse_llm(trial: Trial) -> Optional[list[Rule]]:
    system = GUARD
    user = PROMPT.format(fields=", ".join(ALLOWED_FIELDS), ops=", ".join(ALLOWED_OPERATORS),
                         tid=trial.id, text=untrusted(trial.criteria_text))
    error = None
    for _ in range(2):
        prompt = user if error is None else f"{user}\n\nYour previous answer failed validation: {error}\nFix it."
        raw = llm.complete(system, prompt)
        try:
            data = llm.extract_json(raw)
            rules = _rules_adapter.validate_python(data)
            if not rules:
                raise ValueError("empty rule list")
            for r in rules:
                r.section = r.section or rag.cite(trial.id, trial.criteria_text, r.source_text)
            return rules
        except (ValueError, ValidationError, json.JSONDecodeError) as e:
            error = str(e)[:800]
    return None


def parse_deterministic(trial: Trial) -> list[Rule]:
    rules: list[Rule] = []
    counters = {"inclusion": 0, "exclusion": 0}
    for chunk in rag.chunk_protocol(trial.id, trial.criteria_text):
        kind = "exclusion" if chunk["section"].lower().startswith("exclusion") else "inclusion"
        counters[kind] += 1
        base = f"{trial.id}-{'E' if kind == 'exclusion' else 'I'}{counters[kind]}"
        rules.extend(parse_line(chunk["text"], kind, base, chunk["section"]))
    return rules


def _mk(base, i, kind, field, op, value, unit, text, section, **kw) -> Rule:
    rid = base if i is None else f"{base}{'abcdefgh'[i]}"
    return Rule(id=rid, kind=kind, field=field, operator=op, value=value, unit=unit, source_text=text,
                section=section, **kw)


def _clean_condition(s: str) -> str:
    s = s.strip().strip(".").lower()
    for pat, repl in CLEAN_CONDITION:
        s = re.sub(pat, repl, s)
    return s.strip()


def _unit_for(t: str) -> Optional[str]:
    for needle, unit in UNITS:
        if needle in t:
            return unit
    return None


def _comparisons(t: str) -> list[tuple[str, float]]:
    m = re.search(rf"between\s+{NUM}\S*\s+and\s+{NUM}", t) or re.search(rf"\b{NUM}\s*(?:to|-)\s*{NUM}\b", t)
    if m:
        return [(">=", float(m.group(1))), ("<=", float(m.group(2)))]
    pats = [
        (rf"(?:at least|no less than|not less than|minimum of|≥|>=)\s*{NUM}", ">="),
        (rf"(?:at most|no more than|not more than|maximum of|≤|<=)\s*{NUM}", "<="),
        (rf"(?:below|less than|under|lower than|<)\s*{NUM}", "<"),
        (rf"(?:above|greater than|more than|over|exceeding|>)\s*{NUM}", ">"),
        (rf"{NUM}\s*(?:\S+\s*)?(?:years\s+)?or (?:older|higher|more|greater|above)", ">="),
        (rf"{NUM}\s*(?:\S+\s*)?(?:years\s+)?or (?:less|lower|younger|below|fewer)", "<="),
    ]
    for pat, op in pats:
        m = re.search(pat, t)
        if m:
            return [(op, float(m.group(1)))]
    return []


def parse_line(text: str, kind: str, base: str, section: str) -> list[Rule]:
    t = " " + text.lower().strip().rstrip(".") + " "
    out: list[Rule] = []

    def add(field, op, value, unit=None, **kw):
        out.append(_mk(base, None, kind, field, op, value, unit, text, section, **kw))

    either = re.search(r"either\s+(.+?)\s+or\s+(.+?)\s*$", t.strip())
    if either:
        children = [
            _mk(base, i, kind, "conditions", "contains", _clean_condition(x), None, x.strip(), section)
            for i, x in enumerate(either.groups())
        ]
        add("group", "any_of", None, any_of=children)
        return out

    for field, pat in LAB_KEYWORDS:
        if re.search(pat, t):
            comps = _comparisons(t)
            if comps:
                unit = _unit_for(t)
                for op, v in comps:
                    add(field, op, v, unit)
                return _suffix(out)

    if re.search(r"\bpregnan", t):
        add("pregnant", "==", True)
        return out

    if re.search(r"\bage[d]?\b|\byears?\b", t):
        comps = _comparisons(t)
        if comps:
            for op, v in comps:
                add("age", op, v)
    if re.search(r"\bfemale\b|\bwomen\b", t):
        add("sex", "==", "F")
    elif re.search(r"\bmale\b|\bmen\b", t):
        add("sex", "==", "M")
    if out:
        return _suffix(out)

    receptor = re.search(r"\b(her2|er|pr)[- ](positive|negative)\b", t)
    if receptor:
        add("conditions", "contains", f"{receptor.group(1)}-{receptor.group(2)}")
        return out

    med = re.search(r"\b(?:current use of|currently taking|currently on|prior treatment with|treatment with|use of)"
                    r"\s+(.+?)\s*$",
                    t.strip())
    if med and not re.search(r"dialysis", t):
        add("medications", "contains", _clean_condition(med.group(1)))
        return out

    neg = re.search(r"(?:no history of|no prior|without)\s+(.+?)\s*$", t.strip())
    if neg:
        add("conditions", "not_contains", _clean_condition(neg.group(1)))
        return out

    dx = re.search(r"(?:diagnosis of|diagnosed with|history of|confirmed)\s+(.+?)\s*$", t.strip())
    if dx and not re.search(r"within|past \d+|last \d+", t):
        add("conditions", "contains", _clean_condition(dx.group(1)))
        return out

    add("notes", "contains", text.strip().rstrip("."))
    return out


def _suffix(rules: list[Rule]) -> list[Rule]:
    if len(rules) > 1:
        for i, r in enumerate(rules):
            r.id = f"{r.id}{'abcdefgh'[i]}"
    return rules
