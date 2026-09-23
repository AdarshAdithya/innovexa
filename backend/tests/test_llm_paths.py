"""LLM code paths with a stubbed model: validation retry, fallbacks, and rationale self-checks."""
import json

import pytest
from conftest import patient, rule

from app import llm
from app.explainer import check_note_rule, explain
from app.models import CriterionResult, Decision, Status, Trial, Verdict
from app.parser import parse_criteria

TRIAL = Trial(id="L1", title="l", condition="c",
              criteria_text="Inclusion Criteria:\n1. Age 18 to 65 years.\nExclusion Criteria:\n1. Currently pregnant.\n")


@pytest.fixture
def fake_llm(monkeypatch):
    replies = []
    monkeypatch.setattr(llm, "llm_available", lambda: True)
    monkeypatch.setattr(llm, "complete", lambda system, user: replies.pop(0) if replies else None)
    return replies


def test_parser_retries_after_validation_error(fake_llm):
    good = [{"id": "L1-I1a", "kind": "inclusion", "field": "age", "operator": ">=", "value": 18,
             "source_text": "Age 18 to 65 years."},
            {"id": "L1-E1", "kind": "exclusion", "field": "pregnant", "operator": "==", "value": True,
             "source_text": "Currently pregnant."}]
    fake_llm += ['[{"id": "x", "kind": "inclusion", "field": "shoe_size", "operator": ">=", "value": 1}]',
                 "```json\n" + json.dumps(good) + "\n```"]
    rules, by = parse_criteria(TRIAL, use_cache=False)
    assert by == "llm" and [r.field for r in rules] == ["age", "pregnant"]
    assert rules[1].section == "Exclusion 1"


def test_parser_falls_back_when_llm_keeps_failing(fake_llm):
    fake_llm += ["not json", "still not json"]
    rules, by = parse_criteria(TRIAL, use_cache=False)
    assert by.startswith("deterministic") and len(rules) == 3


def test_note_rule_uses_llm_then_falls_back(fake_llm):
    r = rule("notes", "contains", "dialysis", kind="exclusion", text="Currently receiving dialysis")
    fake_llm.append('{"status": "MET", "evidence": "on hemodialysis"}')
    assert check_note_rule(r, patient(notes="On hemodialysis.")).evaluated_by == "llm"
    fake_llm.append("garbage")
    out = check_note_rule(r, patient(notes="On hemodialysis."))
    assert out.evaluated_by == "note-reader" and out.status == Status.MET


def test_contradicting_rationale_is_rejected(fake_llm):
    v = Verdict(patient_id="p", trial_id="t", decision=Decision.NOT_ELIGIBLE, confidence=1.0,
                results=[CriterionResult(rule_id="r", kind="exclusion", source_text="Currently pregnant.",
                                         section="Exclusion 1", status=Status.MET, patient_value=True)])
    fake_llm += ["The patient is eligible for the trial.", "The patient is eligible."]
    text, corrections = explain(v)
    assert "not eligible" in text.lower() and len(corrections) == 3
