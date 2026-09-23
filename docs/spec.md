# Spec: INNOVEXA, evidence-first clinical trial eligibility screener

## Problem
Research coordinators spend hours checking patients against free-text eligibility criteria. We
screen patients against multiple trials automatically, explain each verdict with citations, and
send uncertain cases to a human.

## Users
- **Clinical research coordinator / study nurse**: screens cohorts, resolves NEEDS_REVIEW cases using Next Best Evidence.
- **Principal investigator**: checks that each decision is traceable to a rule and a patient value.
- **Sponsor / research team**: sees trial opportunity across patients and the most frequent blocking criteria.

Not a diagnostic system; never recommends treatment. Synthetic data only.

## Core flow (Clinical Screening Supervisor)
1. **Protocol Agent**: the free-text protocol is parsed once into validated rules (cached); temporal windows noted.
2. **Patient Evidence Agent**: the rule engine evaluates structured fields; note-based criteria go to the LLM or the
   deterministic note reader (negation, time windows, synonyms, units).
3. **Safety/Consistency Agent**: reports missing, contradictory, implausible and suspicious evidence.
4. **Decision Agent**: calls `decide()`. The rule engine is authoritative; a planner's proposed verdict is overridden.
5. **Verification Agent**: recomputes every structured criterion from the raw record, cross-checks LLM note readings
   against the deterministic reader, checks coverage and the decision; corrections are logged.
6. **Explanation Agent**: cited rationale (rejected if it contradicts the decision), why-not, counterfactuals.
7. **Next-Best-Evidence Agent** (NEEDS_REVIEW only): ranked evidence requests; the case enters the review queue.
8. New evidence can be recorded (`POST /patients/{id}/evidence`) and the pair re-screened.
9. Accuracy is measured against frozen labelled data.

A planner (LLM tool-calling, or a fixed plan offline) chooses the order of steps 1–3. The supervisor enforces all
mandatory stages afterwards.

## Data models
- **Trial**: `id, title, condition, criteria_text, rules[]`
- **Rule**: `id, kind (inclusion|exclusion), field, operator, value, unit, source_text, section, any_of[]`
  - fields: `age, sex, conditions, medications, hba1c, egfr, bmi, systolic_bp, fasting_glucose, weight, pregnant, notes`, plus `group` for nested OR
  - operators: `>=, <=, >, <, ==, !=, contains, not_contains`, plus `any_of`
- **Patient**: `id, age, sex, conditions[], medications[], labs{name: number | {value, unit}}, pregnant, notes`
- **CriterionResult**: `rule_id, kind, source_text, section, status (MET|NOT_MET|UNKNOWN|PENDING), patient_value, evaluated_by, detail,
  field, operator, threshold, unit, observed, comparison ("39 mL/min/1.73m2 < 45 mL/min/1.73m2 = TRUE"), temporal`
- **Verdict**: `patient_id, trial_id, decision (ELIGIBLE|NOT_ELIGIBLE|NEEDS_REVIEW), results[], rationale, confidence,
  citations[], flags[], counterfactuals[], corrections[], why_not[], next_best_evidence[], evidence_summary, verification`
- **Next Best Evidence item**: `rank, impact (HIGH|MEDIUM|LOW), request, criterion, section, kind, field, reason
  (missing|implausible|contradiction|undated|undocumented|flagged_note|unit), rule_ids[], if_resolved{outcome: decision},
  cohort_block_rate, can_change_decision`

A rule states the criterion itself. For an exclusion, MET means the patient has the excluding condition.

## Decision logic
1. Any exclusion MET → NOT_ELIGIBLE
2. Any inclusion NOT_MET → NOT_ELIGIBLE
3. Any UNKNOWN (or unresolved PENDING) → NEEDS_REVIEW
4. Otherwise ELIGIBLE (a trial with no rules → NEEDS_REVIEW)

Confidence (evidence completeness) = share of rules with status MET or NOT_MET.

## Next Best Evidence (deterministic)
Unresolved criteria are grouped by the evidence that resolves them (both halves of a range share one lab value). For
each group both outcomes are simulated through `decide()`. Impact: HIGH if the group alone decides the case, otherwise
from the cohort block rate, i.e. how often the criterion blocks patients not blocked by anything else (HIGH ≥ 25 %,
MEDIUM ≥ 10 %, else LOW). Requests are concrete ("Obtain the latest HbA1c from the laboratory record"); values are
never invented.

## Counterfactuals
Only numeric protocol rules produce counterfactuals ("This criterion would be satisfied if eGFR >= 45 mL/min/1.73m2").
"Would be eligible if …" is shown only when a single numeric criterion is the sole blocker. No treatment suggestions.

UNKNOWN is produced by: a missing value, an unconvertible unit, a value outside its physiological
range, a note contradicting the structured field, a note criterion that isn't documented, or a
suspected prompt injection.

## Out of scope
Real EHR / FHIR data, authentication beyond an optional API key, independent autonomous agents (the internal workers
are coordinated by one supervisor and exposed as a single Clinical Screening Agent), cloud deployment.
