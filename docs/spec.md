# Spec: Clinical Trial Eligibility Screener

## Problem
Research coordinators spend hours checking patients against free-text eligibility criteria. We
screen patients against multiple trials automatically, explain each verdict with citations, and
send uncertain cases to a human.

## Users
- **Research coordinator**: screens a cohort, reviews flagged cases, asks cohort questions.
- **Principal investigator / jury**: checks that each decision is traceable and measured.

## Core flow
1. A trial protocol (free text) is parsed once into structured rules and cached.
2. For each patient, the rule engine evaluates structured criteria; note-based criteria go to the note reader or LLM.
3. The decision logic produces a verdict; the explainer writes a cited rationale; the agent self-verifies.
4. NEEDS_REVIEW verdicts land in the human review queue.
5. Accuracy is measured against labelled data.

## Data models
- **Trial**: `id, title, condition, criteria_text, rules[]`
- **Rule**: `id, kind (inclusion|exclusion), field, operator, value, unit, source_text, section, any_of[]`
  - fields: `age, sex, conditions, medications, hba1c, egfr, bmi, systolic_bp, fasting_glucose, weight, pregnant, notes`, plus `group` for nested OR
  - operators: `>=, <=, >, <, ==, !=, contains, not_contains`, plus `any_of`
- **Patient**: `id, age, sex, conditions[], medications[], labs{name: number | {value, unit}}, pregnant, notes`
- **CriterionResult**: `rule_id, kind, source_text, section, status (MET|NOT_MET|UNKNOWN|PENDING), patient_value, evaluated_by, detail`
- **Verdict**: `patient_id, trial_id, decision (ELIGIBLE|NOT_ELIGIBLE|NEEDS_REVIEW), results[], rationale, confidence, citations[], flags[], counterfactuals[], corrections[]`

A rule states the criterion itself. For an exclusion, MET means the patient has the excluding condition.

## Decision logic
1. Any exclusion MET → NOT_ELIGIBLE
2. Any inclusion NOT_MET → NOT_ELIGIBLE
3. Any UNKNOWN (or unresolved PENDING) → NEEDS_REVIEW
4. Otherwise ELIGIBLE (a trial with no rules → NEEDS_REVIEW)

Confidence = share of rules with status MET or NOT_MET.

UNKNOWN is produced by: a missing value, an unconvertible unit, a value outside its physiological
range, a note contradicting the structured field, a note criterion that isn't documented, or a
suspected prompt injection.

## Out of scope
Real EHR / FHIR data, authentication beyond an optional API key, multi-agent designs, cloud deployment.
