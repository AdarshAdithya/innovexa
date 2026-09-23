# API

Base URL `http://localhost:8000`. JSON everywhere. If `API_KEY` is set, send `X-API-Key`.
Interactive docs at `/docs`.

## GET /health
```json
{"status": "ok", "llm_configured": false, "llm_model": null, "llm_reply": null, "mode": "offline"}
```

## GET /trials
```json
[{"id": "T1-DIAB", "title": "GLUCO-T2D: ...", "condition": "Type 2 diabetes", "criteria_text": "Inclusion Criteria:\n1. ...",
  "rules": [{"id": "T1-DIAB-I3a", "kind": "inclusion", "field": "hba1c", "operator": ">=", "value": 7.0, "unit": "%",
             "source_text": "HbA1c between 7.0% and 10.5% at screening.", "section": "Inclusion 3", "any_of": null}],
  "parsed_by": "deterministic (cached)", "patient_count": 120,
  "screened": {"ELIGIBLE": 11, "NOT_ELIGIBLE": 102, "NEEDS_REVIEW": 7}}]
```

## POST /trials
Body `{"id": "T5-NEW", "title": "...", "condition": "...", "criteria_text": "..."}` → `201` with the trial and parsed
rules. `409` if the id exists, `422` on invalid input.

## GET /patients
```json
[{"id": "P006", "age": 58, "sex": "M", "conditions": ["Type 2 diabetes mellitus"], "medications": ["Metformin"],
  "labs": {"hba1c": 45, "fasting_glucose": {"value": 16.0, "unit": "mmol/L"}}, "pregnant": false, "notes": "...",
  "anomaly": {"implausible": true, "outlier": true, "score": 0.538,
              "reasons": ["HbA1c 45 % outside plausible range 3-20", "HbA1c unusually high (45.0, z=+5.3)"]}}]
```

## GET /patients/{id}/rankings
```json
[{"trial_id": "T1-DIAB", "title": "...", "similarity": 0.32, "decision": "ELIGIBLE", "score": 0.797}]
```

## GET /summary
Dashboard KPIs. Offline mode screens any trial not yet fully screened.
```json
{"patients": 120, "trials": 4, "screened_pairs": 480, "ELIGIBLE": 27, "NOT_ELIGIBLE": 439, "NEEDS_REVIEW": 14,
 "implausible": 3, "advisory_outliers": 6, "contradictions": 12, "mode": "offline"}
```

## GET /patients/{id}/opportunities
Trial opportunity map: the patient screened against every trial (ELIGIBLE first).
```json
{"patient": {"id": "P042", "...": "..."}, "anomaly": null,
 "trials": [{"trial_id": "T3-CKD", "decision": "NEEDS_REVIEW", "total": 9, "passed": 8, "failed": 0, "unresolved": 1,
             "completeness": 0.889, "primary_blockers": [], "unresolved_criteria": [{"rule_id": "T3-CKD-E2", "...": "..."}],
             "next_best_evidence": [{"rank": 1, "impact": "HIGH", "request": "Confirm and document in the clinical notes: \"Currently receiving dialysis\".",
                                     "if_resolved": {"absent": "ELIGIBLE", "present": "NOT_ELIGIBLE"}, "...": "..."}],
             "why_not": [], "verdict": {"...": "full Verdict"}}]}
```

## POST /patients/{id}/evidence
Record newly obtained evidence. Lab field names are allow-listed; notes are appended as untrusted text.
```json
{"labs": {"hba1c": {"value": 64, "unit": "mmol/mol"}}, "pregnant": false, "notes_append": "Not on dialysis.",
 "conditions_add": [], "medications_add": []}
```
Returns the updated patient. `422` for unknown lab fields, `404` for unknown patients. Audited (field names only).

## POST /patients/{id}/reset
Restore the benchmark record (repeatable demo).

## POST /screen
Body `{"trial_id": "T1-DIAB", "patient_ids": ["P001"]}` (omit `patient_ids` for everyone) → list of Verdicts:
```json
[{"patient_id": "P004", "trial_id": "T1-DIAB", "decision": "NOT_ELIGIBLE", "confidence": 1.0,
  "results": [{"rule_id": "T1-DIAB-I5", "kind": "inclusion", "source_text": "Fasting plasma glucose of 270 mg/dL or less.",
               "section": "Inclusion 5", "status": "NOT_MET", "patient_value": "16 mmol/L (= 288.0 mg/dL)",
               "evaluated_by": "rules", "detail": ""}],
  "rationale": "The patient is not eligible for this trial. Inclusion criterion ... [Inclusion 5].",
  "citations": ["Exclusion 1", "Inclusion 5"], "flags": ["outlier (advisory, Isolation Forest): ..."],
  "counterfactuals": ["Would be eligible if fasting glucose <= 270 mg/dL"], "corrections": [],
  "why_not": [{"rule_id": "T1-DIAB-I5", "section": "Inclusion 5", "criterion": "...", "observed": "16 mmol/L (= 288.0 mg/dL)",
               "observed_value": 288.0, "required": "fasting glucose <= 270 mg/dL",
               "comparison": "288 mg/dL <= 270 mg/dL = FALSE",
               "counterfactual": "This criterion would be satisfied if fasting glucose <= 270 mg/dL."}],
  "next_best_evidence": [], "evidence_summary": {"total": 11, "passed": 10, "failed": 1, "unresolved": 0, "completeness": 1.0},
  "verification": {}}]
```

## GET /screen/stream?trial_id=T1-DIAB&patient_ids=P001,P002
Server-Sent Events from the Clinical Screening Supervisor, one structured JSON object per `data:` line (no model free text):
```json
{"patient_id": "P001", "trial_id": "T1-DIAB", "type": "plan|tool_call|step|verify|correction|escalate|final|error",
 "agent": "Decision Agent", "step": "rule_evaluation", "status": "complete|corrected|passed|failed",
 "content": "7 passed · 1 failed · 0 unresolved → NOT_ELIGIBLE", "data": {"passed": 7, "failed": 1, "unknown": 0}}
```
Steps: `trial_loaded`, `planner_action`, `criteria_parsed`, `patient_evidence_extracted`, `safety_checked`,
`rule_evaluation`, `verdict_override`, `verification`, `explanation_generated`, `next_best_evidence`,
`escalated_to_review`, `final_verdict`.
Ends with `{"type": "done", "content": "screened N patient(s)"}`.

## POST /query
Body `{"question": "which patients over 60 are eligible for the diabetes trial"}`. Deterministic intents also answer
"Why is P042 in review?" (per-trial explanation with next best evidence) and "Which criteria are most frequently
failing?" (adds `table`).
```json
{"question": "...", "filter": {"trial_id": "T1-DIAB", "decision": "ELIGIBLE", "min_age": 61}, "parsed_by": "keyword parser",
 "answer": "Found 3 result(s) ...", "rows": [{"patient_id": "P009", "trial_id": "T1-DIAB", "decision": "ELIGIBLE", "age": 69,
 "sex": "M", "confidence": 1.0, "flags": []}]}
```

## GET /metrics?refresh=false&baseline=false
```json
{"n": 480, "correct": 480, "accuracy": 1.0, "precision": 1.0, "recall": 1.0, "f1": 1.0, "macro_f1": 1.0,
 "relevant": {"n": 143, "accuracy": 1.0, "...": "..."}, "dataset": {"patients": 120, "labeled_pairs": 480, "...": "..."},
 "labels": ["ELIGIBLE", "NOT_ELIGIBLE", "NEEDS_REVIEW"], "confusion_matrix": [[27,0,0],[0,439,0],[0,0,14]],
 "per_class": {"ELIGIBLE": {"precision": 1.0, "recall": 1.0, "f1": 1.0, "support": 27}},
 "per_trial": {"T1-DIAB": {"accuracy": 1.0, "n": 120}}, "mismatches": [],
 "judge": {"avg_clarity": 5.0, "n": 480, "mode": "rubric", "distribution": {"5": 480}, "samples": []},
 "mode": "offline ...", "seconds": 0.2, "target": 0.85, "baseline": {"available": false, "reason": "..."}}
```

## GET /cohorts?k=3
```json
{"k": 2, "silhouette": 0.293, "clusters": [{"id": 0, "size": 13, "label": "low weight, low age", "means": {"age": 46.5}}],
 "points": [{"patient_id": "P001", "cluster": 0, "x": -1.2, "y": 0.4, "excluded_from_fit": false}], "note": "..."}
```

## GET /review · POST /review
`GET` lists NEEDS_REVIEW or flagged verdicts with any reviewer decision. `POST` body
`{"patient_id": "P003", "trial_id": "T1-DIAB", "decision": "ELIGIBLE|NOT_ELIGIBLE", "note": "..."}`.

## GET /audit?limit=100
`[{"id": 1, "ts": 1790000000.0, "action": "screen", "detail": {"trial_id": "T1-DIAB", "patients": 30}}]` (identifiers only).
