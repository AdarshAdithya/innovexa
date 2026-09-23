import pytest
from conftest import patient, rule

from app.models import CriterionResult, Decision, Status
from app.rules import confidence, convert, counterfactuals, decide, evaluate


@pytest.mark.parametrize("op,value,expected", [
    (">=", 50, Status.MET), (">=", 51, Status.NOT_MET), ("<=", 50, Status.MET), ("<=", 49, Status.NOT_MET),
    (">", 49, Status.MET), (">", 50, Status.NOT_MET), ("<", 51, Status.MET), ("<", 50, Status.NOT_MET),
    ("==", 50, Status.MET), ("!=", 50, Status.NOT_MET),
])
def test_numeric_operators(op, value, expected):
    assert evaluate(rule("age", op, value), patient(age=50)).status == expected


def test_contains_and_not_contains_case_insensitive():
    p = patient(conditions=["Type 2 Diabetes Mellitus"], medications=["Insulin glargine"])
    assert evaluate(rule("conditions", "contains", "type 2 diabetes"), p).status == Status.MET
    assert evaluate(rule("conditions", "not_contains", "type 2 diabetes"), p).status == Status.NOT_MET
    assert evaluate(rule("medications", "contains", "INSULIN"), p).status == Status.MET


def test_synonyms():
    p = patient(conditions=["T2DM", "HTN", "CKD stage 3"])
    for v in ("type 2 diabetes", "hypertension", "chronic kidney disease"):
        assert evaluate(rule("conditions", "contains", v), p).status == Status.MET


def test_boundary_lab_exactly_at_cutoff():
    p = patient(labs={"egfr": 45})
    assert evaluate(rule("egfr", "<", 45, kind="exclusion"), p).status == Status.NOT_MET
    assert evaluate(rule("hba1c", ">=", 7.0), patient(labs={"hba1c": 7.0})).status == Status.MET


def test_missing_value_is_unknown_never_guessed():
    r = evaluate(rule("hba1c", ">=", 7.0), patient(labs={}))
    assert r.status == Status.UNKNOWN
    assert evaluate(rule("age", ">=", 18), patient(age=None)).status == Status.UNKNOWN


def test_unit_conversion_glucose_and_weight():
    assert convert(16.0, "mmol/L", "fasting_glucose") == pytest.approx(288.0)
    assert convert(180, "lb", "weight") == pytest.approx(81.65, abs=0.01)
    p = patient(labs={"fasting_glucose": {"value": 16.0, "unit": "mmol/L"}})
    assert evaluate(rule("fasting_glucose", "<=", 270, unit="mg/dL"), p).status == Status.NOT_MET
    p = patient(labs={"weight": {"value": 100, "unit": "lb"}})
    assert evaluate(rule("weight", ">=", 50, unit="kg"), p).status == Status.NOT_MET


def test_unknown_unit_is_unknown():
    p = patient(labs={"fasting_glucose": {"value": 5, "unit": "furlongs"}})
    assert evaluate(rule("fasting_glucose", "<=", 270), p).status == Status.UNKNOWN


def test_implausible_value_is_unknown():
    r = evaluate(rule("hba1c", "<=", 10.5), patient(labs={"hba1c": 45}))
    assert r.status == Status.UNKNOWN and "implausible" in r.detail


def test_pregnancy_male_is_not_pregnant_female_missing_is_unknown():
    assert evaluate(rule("pregnant", "==", True, "exclusion"), patient(sex="M", pregnant=None)).status == Status.NOT_MET
    assert evaluate(rule("pregnant", "==", True, "exclusion"), patient(sex="F", pregnant=None)).status == Status.UNKNOWN


def test_nested_any_of():
    group = rule("group", "any_of", None, any_of=[rule("conditions", "contains", "type 2 diabetes"),
                                                  rule("conditions", "contains", "hypertension")])
    assert evaluate(group, patient(conditions=["Hypertension"])).status == Status.MET
    assert evaluate(group, patient(conditions=["Asthma"])).status == Status.NOT_MET


def test_notes_rules_are_pending():
    assert evaluate(rule("notes", "contains", "dialysis"), patient()).status == Status.PENDING


def _res(kind, status):
    return CriterionResult(rule_id="r", kind=kind, source_text="", status=status)


def test_decide_every_branch():
    assert decide([_res("exclusion", Status.MET), _res("inclusion", Status.MET)]) == Decision.NOT_ELIGIBLE
    assert decide([_res("inclusion", Status.NOT_MET), _res("exclusion", Status.UNKNOWN)]) == Decision.NOT_ELIGIBLE
    assert decide([_res("inclusion", Status.UNKNOWN), _res("exclusion", Status.NOT_MET)]) == Decision.NEEDS_REVIEW
    assert decide([_res("inclusion", Status.MET), _res("exclusion", Status.NOT_MET)]) == Decision.ELIGIBLE
    assert decide([]) == Decision.NEEDS_REVIEW


def test_confidence_is_share_of_known():
    assert confidence([_res("inclusion", Status.MET), _res("inclusion", Status.UNKNOWN)]) == 0.5


def test_counterfactual_single_numeric_blocker():
    r = rule("egfr", "<", 45, kind="exclusion", unit="mL/min/1.73m2")
    res = [evaluate(r, patient(labs={"egfr": 40}))]
    assert counterfactuals([r], res) == ["Would be eligible if eGFR >= 45 mL/min/1.73m2"]
