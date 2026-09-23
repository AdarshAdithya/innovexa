"""LLM-as-judge for explanation clarity (1-5), with a transparent rubric fallback."""
from __future__ import annotations

import re

from . import llm
from .models import Verdict
from .rules import deciding

JUDGE_PROMPT = """You grade the clarity of a clinical-trial screening rationale from 1 (unclear) to 5 (very clear).
A 5 names the decision, every deciding criterion, the patient's value for each, and cites protocol sections,
without contradictions or jargon. Decision: {decision}
Rationale: "{rationale}"
Reply with JSON only: {{"score": <1-5>, "reason": "<one line>"}}"""


def judge(v: Verdict) -> dict:
    if llm.llm_available():
        try:
            data = llm.extract_json(llm.complete("You are a strict clinical documentation reviewer.",
                                                 JUDGE_PROMPT.format(decision=v.decision.value, rationale=v.rationale)))
            score = int(data["score"])
            if 1 <= score <= 5:
                return {"score": score, "reason": str(data.get("reason", ""))[:200], "judge": "llm"}
        except (ValueError, KeyError, TypeError):
            pass
    return rubric(v)


def rubric(v: Verdict) -> dict:
    text = v.rationale or ""
    low = text.lower()
    key = deciding(v.results)
    checks = {
        "states decision": any(w in low for w in ("eligible", "review", "not eligible")),
        "names deciding criteria": all(r.source_text.lower()[:25] in low for r in key[:2]),
        "gives patient values": "patient value" in low or bool(re.search(r"\d", text)),
        "cites protocol section": bool(re.search(r"\[(inclusion|exclusion) \d+\]", low)),
        "concise (<= 6 sentences)": 1 <= len(re.findall(r"[.!?](\s|$)", text)) <= 6,
    }
    score = max(1, sum(checks.values()))
    missing = [k for k, ok in checks.items() if not ok]
    return {"score": score, "reason": "missing: " + ", ".join(missing) if missing else "meets every rubric item",
            "judge": "rubric"}
