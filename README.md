# INNOVEXA: evidence-first clinical trial eligibility screener

INNOVEXA screens synthetic patients against multiple clinical trials. For every patient–trial pair it
returns **ELIGIBLE / NOT_ELIGIBLE / NEEDS_REVIEW** with:

- a per-criterion evidence breakdown and the exact comparison behind each criterion
- a cited rationale
- a counterfactual for each failed criterion
- for review cases, a ranked list of the evidence that would resolve the decision

**Design principle: LLMs understand language; deterministic logic makes the eligibility decision.**
No model can override the rule engine.

> All data is synthetic (`backend/data/generate.py`). INNOVEXA is a screening aid for research teams,
> not a diagnostic tool. It never recommends treatment.

## Problem and users

Recruiting trial participants is slow because eligibility criteria are complex free text and patient
data is messy: mixed units, missing labs, negated history, time windows, and notes that contradict
the chart. Manual screening is labour-intensive and error-prone.

Users:
- **Clinical research coordinators and study nurses** screen cohorts and resolve review cases.
- **Principal investigators** check that every decision is traceable.
- **Sponsors and research teams** see where the eligible patients are and which criteria block them.

## Quick start

```bash
# backend
cd backend
python -m venv ../.venv && source ../.venv/bin/activate      # Windows: ..\.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # optional: LLM_BASE_URL / LLM_MODEL / LLM_API_KEY for the event model
python data/generate.py         # 4 trials, 120 patients, 480 labels (already committed)
uvicorn app.main:app --reload   # http://localhost:8000, docs at /docs
pytest -q                       # 73 tests

# frontend (second terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

**Offline fallback.** With no model configured, every feature runs deterministically: a pattern-based
criteria parser, a negation- and time-aware note reader, template rationales and a rubric judge. Set
`LLM_BASE_URL` and `LLM_MODEL` to any OpenAI-compatible endpoint (a local server or the event's
provided model) and the same code paths use it. Only `app/llm.py` knows about the provider. No
external API is required, and no key is hardcoded.

## Architecture

```
React (Vite, Tailwind, Recharts)
  Dashboard · Patient opportunity map · Screening + live trace · Trial grid · Review queue · Ask · Accuracy · Cohorts
        │ REST + Server-Sent Events
FastAPI (CORS allow-list, rate limit, optional API key, security headers, audit log)
        │
CLINICAL SCREENING AGENT (one supervisor; externally a single agent)
  ├─ Protocol Agent            criteria text → validated rules (+ temporal windows)
  ├─ Patient Evidence Agent    structured fields + notes → criterion evidence (negation, time, synonyms, units)
  ├─ Safety/Consistency Agent  missing · contradictory · implausible · injected content
  ├─ Decision Agent            calls the deterministic rule engine (authoritative)
  ├─ Verification Agent        independent recomputation from the raw record; corrects and logs
  ├─ Explanation Agent         cited rationale, why-not, counterfactuals
  └─ Next-Best-Evidence Agent  NEEDS_REVIEW only: ranked evidence requests
        │
SQLite (trials, patients, rule cache, verdicts, reviews, audit) · TF-IDF / ChromaDB retrieval · provided LLM
```

Flow: protocol → rules; patient data + notes → evidence; rules × evidence → **rule engine** →
verdict → verification → explanation → human-facing result.

**Agentic mode vs fallback.** With a model configured, a LangChain tool-calling *planner* picks which
workers to call. Without one, a fixed plan calls the same workers. After planning, the supervisor
always enforces every mandatory stage:
- A planner that skips a tool gets a logged correction and the stage is run anyway.
- A planner that claims a verdict is overridden by the rule engine.
- A planner that crashes falls back to the fixed plan.

The live trace streams structured actions only, such as `criteria_parsed`,
`rule_evaluation {passed, failed, unknown}` and `verification {status}`. No model free text is shown.

| Module | Role |
|---|---|
| `app/supervisor.py` | Clinical Screening Supervisor, the seven workers, planners, structured trace events |
| `app/rules.py` | Rule engine (no LLM): MET/NOT_MET/UNKNOWN, unit conversion (mg/dL↔mmol/L, lb→kg, mmol/mol→%), plausibility guard, nested `any_of`, decision logic, exact comparisons, why-not, counterfactuals |
| `app/evidence.py` | Evidence summaries and **Next Best Evidence** |
| `app/parser.py` | LLM parser with Pydantic validation, one retry and a SQLite cache; deterministic fallback |
| `app/notes.py` | Negation, time windows, contradiction detection, timeline facts |
| `app/explainer.py` | Note criteria (LLM or note reader) and rationales that are checked against the decision |
| `app/screening.py` | Pipeline, cohort block rates, trial opportunity map |
| `app/evaluate.py` | Accuracy, precision, recall, F1, macro F1, confusion matrix, failures, pure-LLM baseline |
| `app/rag.py`, `ml.py`, `judge.py`, `query.py`, `security.py` | Citations, Isolation Forest / K-Means / ranking, clarity judge, cohort questions, security controls |

### Decision logic (rule engine)

1. Any exclusion MET → NOT_ELIGIBLE
2. Any inclusion NOT_MET → NOT_ELIGIBLE
3. Any criterion UNKNOWN → NEEDS_REVIEW
4. Otherwise ELIGIBLE

These all produce UNKNOWN, never a guess:
- a missing value
- an implausible value (e.g. HbA1c 45 %)
- an unconvertible unit
- a note that contradicts the chart
- an undated event inside a time-windowed criterion
- disagreeing note readers
- suspected prompt injection

## Headline features

**Next Best Evidence.** For a NEEDS_REVIEW case, the system names the most useful missing evidence
and ranks it. It works like this:
1. Unresolved criteria are grouped by the evidence that would resolve them. For example, both halves
   of an HbA1c range need one lab value.
2. Each item's two outcomes are simulated through `decide()`, e.g. "if absent → ELIGIBLE; if present →
   NOT_ELIGIBLE".
3. Items are ranked by impact:
   - **HIGH** if the item alone decides the case.
   - Otherwise, by how often that criterion blocks otherwise-eligible patients in the cohort
     (HIGH ≥ 25 %, MEDIUM ≥ 10 %).

Each item gets a concrete request, such as "Obtain the latest HbA1c from the laboratory record". The
UI lets you enter the evidence and re-screen, and the verdict changes deterministically. No patient
value is ever invented.

**Counterfactual eligibility.** For each blocking criterion the system shows the observed value, the
requirement and the exact comparison, e.g. `39 mL/min/1.73m2 < 45 mL/min/1.73m2 = TRUE`. It then
states what would change it: "This exclusion would no longer apply if eGFR >= 45 mL/min/1.73m2".
Counterfactuals are generated only from numeric protocol rules and never suggest treatment.

**Trial opportunity map.** One patient against every trial. Each trial shows passed / failed /
unresolved counts, evidence completeness, the primary blocker with its counterfactual, or the next
best evidence. Clicking a trial opens the full evidence.

**Decision provenance.** For each deciding criterion: patient evidence → protocol criterion (with
section) → comparison → status → verdict. There is also a verification checklist and an all-criteria
table with the comparison per row.

**Temporal reasoning.** Time-windowed criteria get a timeline placed only from intervals stated in
the note. For example, "MI 3 years ago" appears outside the 6-month window, so the result is PASS.
Undated events stay UNKNOWN.

**Also included:** multi-trial grid, human review queue with next-best-evidence and re-check,
natural-language cohort questions ("How many patients are potentially eligible for Trial T2?", "Why
is P042 in review?", "Which criteria are most frequently failing?"), LLM-as-judge clarity scoring,
Isolation Forest anomaly flags, K-Means cohorts, trial ranking and audit log.

## Model usage: what the AI does vs what code does

| Task | LLM (when configured) | Deterministic code |
|---|---|---|
| Parse criteria into rules | yes, validated by Pydantic, retried, cached | fallback parser |
| Read note-based criteria | yes, via PHI-redacted `<untrusted>` input | negation/time-aware reader (fallback, and cross-check in verification) |
| Plan the screening | tool-calling planner | fixed plan |
| **Decide eligibility** | **never** | rule engine |
| Verify | — | recomputation from the raw record |
| Rationale | yes, rejected if it contradicts the decision | template fallback |
| Next Best Evidence, counterfactuals, provenance | — | simulation through the rule engine |
| Cohort questions | question → validated filter | keyword parser, intents; never SQL |
| Clarity score | LLM judge | rubric fallback |

The reason for the split: numbers, units and logic must be exact and auditable, while language (free
text criteria, notes, explanations) is where models help.

## ML scope (deliberately small)

- **Physiological range guard:** the only data check that can change a verdict (the value becomes
  UNKNOWN).
- **Isolation Forest:** an advisory multivariate outlier flag with z-score reasons. On this cohort it
  also flags legitimate borderline patients, so it never forces a verdict.
- **K-Means:** a descriptive cohort view; k is chosen by silhouette and implausible records are
  excluded from fitting.
- **TF-IDF:** used for protocol citations and trial ranking (ChromaDB optional).
- **Not used:** no deep-learning model, SHAP or calibration model. They add no measurable value here.

## Security

- **Untrusted notes and protocols:** PHI redaction (names, MRN, phone, email, DOB) and `<untrusted>`
  wrapping with a system guard.
- **Injection guard:** notes that look like prompt injection ("ignore previous instructions…") never
  decide a criterion; it becomes UNKNOWN and goes to human review. This is tested, including via the
  evidence endpoint.
- **No execution from model output:** LLM output is parsed as JSON and validated against allow-listed
  schemas. Nothing is `eval`'d, and no SQL is generated.
- **Input validation:** Pydantic constraints on IDs, ranges, lengths, enums and lab field names.
- **Transport and API:** CORS allow-list, per-client rate limit, optional `X-API-Key`, `nosniff` /
  `DENY` / `no-store` headers.
- **Audit log:** screening, queries, evidence additions, resets and reviews are recorded with
  identifiers only.
- **Secrets and data:** `.env`, SQLite and Chroma files are git-ignored.

## Synthetic data and evaluation

`backend/data/generate.py` (seed 42) writes 4 trials (type 2 diabetes, hypertension, CKD, HER2+
breast cancer) and **120 patients**:
- **P001–P030:** hand-written edge cases.
- **P040–P043:** guaranteed demo patients.
- **The rest:** a seeded cohort with random edge cases:
  - boundary values
  - missing labs
  - glucose in mmol/L, weight in lb, HbA1c in mmol/mol
  - negated, recent, old and undated MI
  - dialysis and brain-metastasis status
  - pregnancy and pregnancy contradictions
  - implausible values
  - nested "(T2D or HTN)"

**Labels:** 480 labels are computed from each patient's *true* state by ground-truth functions that
share no code with the parser or rule engine. `/metrics` evaluates on these frozen files, so demo
edits cannot move the score.

**Measured (offline mode, this commit):**

| Set | Pairs | Accuracy | F1 (eligible) | Macro F1 |
|---|---|---|---|---|
| All labelled pairs | 480 (27 ELIGIBLE / 439 NOT_ELIGIBLE / 14 NEEDS_REVIEW) | 100 % | 100 % | 100 % |
| Condition-relevant pairs | 143 | 100 % | 100 % | 100 % |

Read this critically:
- **The label mix is imbalanced.** Most pairs are NOT_ELIGIBLE because the patient lacks the trial's
  condition, hence the separate condition-relevant row.
- **The offline parser and note reader were written for these protocol and note phrasings**, and the
  generator uses the same phrasings. So this measures correctness of the logic, not language
  generalisation.
- **The real test is still to run:** connect the event model, upload an unseen protocol, and use the
  *Compare with pure-LLM baseline* button for the hybrid vs pure-LLM comparison. It needs a model and
  was not run here.

## Tests (73)

`pytest -q` covers:
- **Rule engine:** every operator, boundaries (age 18/65, labs at cutoff), missing data, unit
  conversions (mg/dL↔mmol/L, lb↔kg, mmol/mol↔%), implausible values, nested (A or B) and not C,
  every branch of `decide()`.
- **Notes:** negation ("denies history of MI"), time windows (3 months vs 3 years), contradictions.
- **Bad input:** malformed patient, malformed rule, empty protocol.
- **Security:** prompt injection, PHI redaction.
- **Supervisor:** a planner that skips tools, a hallucinated verdict overridden by the rule engine, a
  crashing planner falling back, tampered evidence caught by verification.
- **Evidence features:** Next Best Evidence grouping, outcomes and impact; why-not and
  counterfactuals; timeline facts; the multi-trial opportunity map; evidence → re-screen → verdict
  change → reset.
- **API:** the endpoints, SSE step names, and LLM paths with a stubbed model.

**Real failures found and fixed while building this:**
1. **Next Best Evidence double-counted range criteria.** "HbA1c between 7.0 and 10.5" is two rules
   sharing one missing value. The first version listed HbA1c twice and claimed "criterion met → still
   NEEDS_REVIEW". Fixed by grouping unresolved criteria by the evidence that resolves them
   (`evidence._evidence_key`); covered by `test_next_best_evidence_ranks_and_simulates_outcomes`.
2. **Re-screened verdicts didn't show.** After evidence was saved, the drawer reset to the stale
   verdict because an app refresh passed it a new patient object. Found in the browser run; fixed in
   `PatientDrawer`.
3. **Dashboard counts were partial.** Trials that had only been screened for a single patient were
   counted as screened. `/summary` now completes any partially screened trial.
4. **Parser comparator order (earlier build):** "BMI no more than 35" was parsed as `> 35`.

## Demo flow (about 3 minutes)

1. **Dashboard:** KPIs (patients, trials, eligible / not eligible / review, anomalies) → *Open demo
   patient P042*.
2. **Opportunity map for P042:**
   - T1 diabetes **ELIGIBLE**
   - T2 hypertension **NOT_ELIGIBLE** (SBP 186 > 179)
   - T3 CKD **NEEDS_REVIEW**
   - T4 breast cancer **NOT_ELIGIBLE**
3. **Open T3:**
   - The NEEDS_REVIEW banner shows **Next Best Evidence: HIGH, "Confirm and document dialysis status"**.
   - Outcomes: absent → ELIGIBLE, present → NOT_ELIGIBLE.
4. **Resolve it:** type "Not on dialysis." and click *Save evidence & re-screen*. The verdict changes
   **NEEDS_REVIEW → ELIGIBLE** from the rule engine. Show the provenance: criterion → patient value →
   comparison → status.
5. **Open T2:** why not eligible, `186 <= 179 = FALSE`, and the counterfactual "satisfied if systolic
   BP <= 179 mmHg".
6. **Open T1:** the temporal timeline ("MI 3 years ago" vs the 6-month window → PASS) and the
   verification checklist.
7. **Screening tab:** *Run Clinical Screening Agent* and watch the structured trace (agents, ✓
   steps, corrections, escalations).
8. **Review, Ask, Accuracy:** P043 (two ranked evidence requests), P006 (implausible HbA1c 45), "Why
   is P042 in review?", then accuracy, F1, the confusion matrix and the baseline button.
9. **Reset:** *Reset to benchmark record* restores P042, so the demo can be repeated.

## Limitations

- **Synthetic data only.** No EHR/FHIR integration, no authentication beyond an optional API key, no
  deployment.
- **Offline language handling:** the parser and note reader handle the phrasings used here. Unseen
  protocols need the LLM path, and its accuracy has not been measured in this repository (no model
  was available).
- **Next Best Evidence impact** uses block rates from this small synthetic cohort. It ranks requests;
  it does not estimate clinical likelihood.
- **Contradictions** can be flagged but not resolved by appending a note; a clinician must correct
  the chart.

## Docs

`docs/spec.md` · `docs/tasks.md` · `docs/api.md` · `docs/prompts.md` · `docs/PHASES.pdf`
