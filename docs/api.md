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
  "parsed_by": "deterministic (cached)", "patient_count": 30,
  "screened": {"ELIGIBLE": 6, "NOT_ELIGIBLE": 21, "NEEDS_REVIEW": 3}}]
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

## POST /screen
Body `{"trial_id": "T1-DIAB", "patient_ids": ["P001"]}` (omit `patient_ids` for everyone) → list of Verdicts:
```json
[{"patient_id": "P004", "trial_id": "T1-DIAB", "decision": "NOT_ELIGIBLE", "confidence": 1.0,
  "results": [{"rule_id": "T1-DIAB-I5", "kind": "inclusion", "source_text": "Fasting plasma glucose of 270 mg/dL or less.",
               "section": "Inclusion 5", "status": "NOT_MET", "patient_value": "16 mmol/L (= 288.0 mg/dL)",
               "evaluated_by": "rules", "detail": ""}],
  "rationale": "The patient is not eligible for this trial. Inclusion criterion ... [Inclusion 5].",
  "citations": ["Exclusion 1", "Inclusion 5"], "flags": ["outlier (advisory, Isolation Forest): ..."],
  "counterfactuals": ["Would be eligible if fasting glucose <= 270 mg/dL"], "corrections": []}]
```

## GET /screen/stream?trial_id=T1-DIAB&patient_ids=P001,P002
Server-Sent Events, one JSON object per `data:` line:
```json
{"patient_id": "P001", "trial_id": "T1-DIAB", "type": "plan|thought|tool_call|tool_result|verify|correction|escalate|final|error",
 "content": "human-readable step", "data": {"args": {}, "result": {}, "verdict": {}}}
```
Ends with `{"type": "done", "content": "screened N patient(s)"}`.

## POST /query
Body `{"question": "which patients over 60 are eligible for the diabetes trial"}`
```json
{"question": "...", "filter": {"trial_id": "T1-DIAB", "decision": "ELIGIBLE", "min_age": 61}, "parsed_by": "keyword parser",
 "answer": "Found 3 result(s) ...", "rows": [{"patient_id": "P009", "trial_id": "T1-DIAB", "decision": "ELIGIBLE", "age": 69,
 "sex": "M", "confidence": 1.0, "flags": []}]}
```

## GET /metrics?refresh=false&baseline=false
```json
{"n": 120, "correct": 120, "accuracy": 1.0, "precision": 1.0, "recall": 1.0,
 "labels": ["ELIGIBLE", "NOT_ELIGIBLE", "NEEDS_REVIEW"], "confusion_matrix": [[13,0,0],[0,102,0],[0,0,5]],
 "per_class": {"ELIGIBLE": {"precision": 1.0, "recall": 1.0, "support": 13}},
 "per_trial": {"T1-DIAB": {"accuracy": 1.0, "n": 30}}, "mismatches": [],
 "judge": {"avg_clarity": 5.0, "n": 120, "mode": "rubric", "distribution": {"5": 120}, "samples": []},
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
