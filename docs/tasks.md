# Tasks

## Part A: required
- [x] Phase 0: spec, tasks, api docs, folder structure, venv, `.env.example`
- [x] Phase 1: synthetic data: 4 trials, 30 patients, 120 labels with edge cases (`backend/data/generate.py`)
- [x] Phase 2: FastAPI skeleton, CORS, `/health`, `config.py`, `llm.py`, SQLite tables
- [x] Phase 3: criteria parser: LLM + Pydantic validation + one retry + SQLite cache; deterministic fallback
- [x] Phase 4: rule engine with unit normalisation; pytest per operator, boundary, missing, unit, `decide()` branch
- [x] Phase 5: explainer (note criteria + rationale) and screening pipeline; real `/screen`, `/trials`, `/patients`
- [x] Phase 6: React UI: dashboard, screening table, patient drawer, patient × trial grid, loading and error states
- [x] Phase 7: evaluation: accuracy, precision, recall, confusion matrix, mismatches; Accuracy page
- [x] Checkpoint: multiple trials end to end, per-criterion results and rationales, accuracy ≥ 85 %

## Part B: attractive
- [x] Phase 8: tool-calling agent, self-verification, `/screen/stream` SSE, live reasoning panel
- [x] Phase 9: LLM-as-judge clarity, `/query` + Ask page, RAG citations
- [x] Phase 10: Isolation Forest flags, trial ranking, K-Means cohort scatter
- [x] Phase 11: edge-case tests (negation, boundaries, missing, units, contradictions, empty trial, malformed record, nested logic, injection)
- [x] Phase 12: README, prompt log

## Upgrade: INNOVEXA (supervisor + evidence features)
- [x] Clinical Screening Supervisor with 7 workers; planner (LLM tool calling or fixed plan); enforced mandatory stages
- [x] Structured trace events only (no model free text); skip / hallucinated verdict / planner crash handled and tested
- [x] Verification Agent: recomputation from raw record, note-reader cross-check, coverage and decision checks
- [x] Next Best Evidence with grouped evidence, simulated outcomes, cohort-based impact
- [x] Evidence entry + re-screen + reset endpoints and UI
- [x] Why-not with exact comparison; counterfactuals from rules only
- [x] Trial opportunity map per patient
- [x] Decision provenance graph and temporal timeline
- [x] Benchmark: 120 patients, 480 labels, demo patients P040–P043; F1, macro F1, condition-relevant metrics
- [x] Dashboard KPIs; review queue with next best evidence; cohort-question intents
- [x] 73 tests

## Tier 3 extras
- [x] Human-in-the-loop review queue (`/review`)
- [x] Counterfactuals
- [x] Pure-LLM baseline comparison
- [x] Audit log, PHI redaction, prompt-injection guard, rate limit
- [ ] Logistic-regression confidence calibration: skipped on purpose (see README, ML design decisions)
- [ ] Outreach email generator, enrolment-likelihood predictor: out of time budget
