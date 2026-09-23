# Prompt log

Evidence for "did you use AI deliberately?". Each entry: what we asked, what came back, what we corrected.

## 1. Planning: verify the ML choices before building
**Prompt:** "K-Means and Isolation Forest: verify which will be best. Look at data security before
building, and see how to implement GenAI wherever possible."
**Outcome and our corrections:**
- Isolation Forest on 30 patients is noisy → **advisory flag only**; a deterministic range check is what changes a verdict.
- K-Means kept as a descriptive visual; `k` chosen by silhouette, weak structure stated in the UI.
- Logistic-regression calibration and SHAP dropped, with reasons (README → ML design decisions).
- Data security list turned into code: PHI redaction, `<untrusted>` wrapping, injection guard, allow-listed JSON schemas, CORS allow-list, rate limit, audit log with IDs only.

## 2. Synthetic data with independent labels
**Prompt:** "Write generate.py: 4 trials (T2D, HTN, CKD, breast cancer), 30 patients with edge cases,
and labels for every pair."
**Correction:** labels must *not* be produced by our own rule engine (that would make accuracy
circular). Labels come from separate ground-truth functions over each patient's true state
(`truth_T1..T4`), which share no code with `rules.py` or `parser.py`.

## 3. Criteria parser (runtime prompt, `app/parser.py::PROMPT`)
Lists the allowed fields and operators, asks for a JSON array only, one object per criterion,
ranges split in two, "No history of X" → `not_contains`, "Either A or B" → `any_of`, anything that
doesn't fit → `field: "notes"`. Output validated with Pydantic; on failure the error is appended and
the model retries once; then the deterministic parser takes over.
**Why the "rule states the criterion itself" line:** exclusions are easy to invert ("eGFR below 45"
as an exclusion must be `egfr < 45`, not `egfr >= 45`). Check this first if accuracy drops once the
event model is connected.

## 4. Note reader (`app/explainer.py::NOTE_PROMPT`)
Asks whether the note shows the criterion is true, handling negation and time windows, answering
UNKNOWN if not mentioned, JSON only. Note text is PHI-redacted and wrapped in `<untrusted>` tags.

## 5. Rationale (`app/explainer.py::EXPLAIN_PROMPT`)
Gives the final decision and the deciding criteria as JSON and asks for 3–5 sentences with `[Section]`
citations that do not contradict the decision. `consistent()` checks the text; a contradicting
rationale is retried once, then replaced by the template (logged in `corrections`).

## 6. Supervisor planner (`app/supervisor.py::PLANNER_PROMPT`)
The planner gets four tools (load_protocol, extract_patient_evidence, check_evidence_safety, submit_decision) and is
told it never decides eligibility. We do not trust it: the supervisor enforces every mandatory stage, the Decision Agent
overrides any proposed verdict with `decide()`, and the Verification Agent recomputes the evidence. Only tool names and
structured results are streamed, never the model's text.

## 7. Judge (`app/judge.py::JUDGE_PROMPT`)
1–5 clarity score with a one-line reason. The offline rubric scores the same five things: states
the decision, names the deciding criteria, gives patient values, cites sections, stays concise.

## 8. NL query (`app/query.py::PROMPT`)
Question → JSON filter with a fixed key set, validated by Pydantic. The model never writes SQL.

## 9. Phase 11 edge cases
**Prompt:** "List 10 edge cases that could break this screener and write pytest tests for them."
**Found and fixed:** "BMI no more than 35" parsed as `> 35` because "more than" matched first. We
moved the negated comparators ahead of the plain ones.

## 10. INNOVEXA upgrade: failures found and fixed
- **Next Best Evidence double-counted range criteria.** "HbA1c between 7.0% and 10.5%" is two rules sharing one missing
  value; the first version listed HbA1c twice and said "criterion met → NEEDS_REVIEW". Fixed by grouping unresolved
  criteria by the evidence that resolves them.
- **Re-screen result did not show in the UI.** The drawer's reset effect depended on the patient object, which an app
  refresh replaces. Found in the browser run; fixed.
- **Dashboard counts partial.** Trials screened for single patients were counted as screened; `/summary` now completes them.

## Deviation from PHASES.pdf (team to confirm and own)
The plan says the Isolation Forest should force NEEDS_REVIEW. Measured on this data, it flags
P002 (BMI exactly 40, a legitimate boundary patient) and P025 (a frail low-weight patient), so
forcing review would lower accuracy without making anyone safer. The build keeps the forest advisory and
lets only physiologically impossible values change a verdict. Flip this in `screening.build_verdict` if the team disagrees.
