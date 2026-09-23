"""Single screening agent: plans, calls tools, verifies itself, escalates to a human when unsure.

With an LLM configured, a LangChain tool-calling loop chooses the tools. Without one (or if the
model misbehaves), a fixed planner calls the same tools in the same order. Either way every step
is yielded as an event for the SSE trace, and the final decision is always re-checked against
the deterministic rule engine.
"""
from __future__ import annotations

import json
from typing import Iterator

from . import db, llm
from .models import Decision, Patient, Status, Trial
from .parser import parse_criteria
from .rules import decide
from .screening import anomaly_flags, build_verdict, evaluate_rules, resolve_notes

SYSTEM = """You are a clinical-trial screening agent. Screen ONE patient against ONE trial.
Use the tools in a sensible order: get_criteria, evaluate_structured_rules, check_note_criteria (if any are
pending), then submit_decision. Decision logic: any exclusion MET -> NOT_ELIGIBLE; any inclusion NOT_MET ->
NOT_ELIGIBLE; any UNKNOWN -> NEEDS_REVIEW; otherwise ELIGIBLE. Think briefly before each tool call."""


def ev(kind: str, content: str, **data) -> dict:
    return {"type": kind, "content": content, **({"data": data} if data else {})}


def _summ(results) -> list[dict]:
    return [{"rule": r.rule_id, "kind": r.kind, "status": r.status.value, "value": str(r.patient_value)[:80]}
            for r in results]


class _State:
    def __init__(self, trial: Trial, patient: Patient):
        self.trial, self.patient = trial, patient
        self.rules = None
        self.results = None
        self.proposed = None


def _tools(state: _State):
    from langchain_core.tools import tool

    @tool
    def get_criteria() -> str:
        """Parse the trial's eligibility criteria into structured rules (cached after first parse)."""
        state.rules, by = parse_criteria(state.trial)
        return json.dumps({"parsed_by": by, "rules": [
            {"id": r.id, "kind": r.kind, "field": r.field, "op": r.operator, "value": r.value} for r in state.rules]},
            default=str)

    @tool
    def evaluate_structured_rules() -> str:
        """Run the deterministic rule engine on the patient's structured data. Note-based rules come back PENDING."""
        if state.rules is None:
            state.rules, _ = parse_criteria(state.trial)
        state.results = evaluate_rules(state.rules, state.patient)
        return json.dumps(_summ(state.results))

    @tool
    def check_note_criteria() -> str:
        """Resolve PENDING criteria by reading the patient's clinical note (negation and time aware)."""
        if state.results is None:
            return "call evaluate_structured_rules first"
        state.results = resolve_notes(state.rules, state.patient, state.results)
        return json.dumps(_summ([r for r in state.results if r.evaluated_by != "rules"]))

    @tool
    def submit_decision(decision: str, reason: str) -> str:
        """Submit the final decision: ELIGIBLE, NOT_ELIGIBLE or NEEDS_REVIEW, with a one-line reason."""
        state.proposed = decision.strip().upper()
        return "submitted"

    return [get_criteria, evaluate_structured_rules, check_note_criteria, submit_decision]


def _llm_loop(state: _State) -> Iterator[dict]:
    from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

    tools = _tools(state)
    by_name = {t.name: t for t in tools}
    model = llm.get_llm().bind_tools(tools)
    msgs = [SystemMessage(content=SYSTEM),
            HumanMessage(content=f"Screen patient {state.patient.id} for trial {state.trial.id} ({state.trial.title}).")]
    for _ in range(8):
        ai = model.invoke(msgs)
        msgs.append(ai)
        if ai.content:
            yield ev("thought", str(ai.content)[:600])
        if not ai.tool_calls:
            break
        for call in ai.tool_calls:
            yield ev("tool_call", call["name"], args=call.get("args", {}))
            tool = by_name.get(call["name"])
            out = tool.invoke(call.get("args", {})) if tool else f"unknown tool {call['name']}"
            yield ev("tool_result", call["name"], result=_safe_json(out))
            msgs.append(ToolMessage(content=str(out), tool_call_id=call["id"]))
        if state.proposed:
            break


def _fixed_plan(state: _State) -> Iterator[dict]:
    tools = {t.name: t for t in _tools(state)}
    yield ev("tool_call", "get_criteria")
    out = json.loads(tools["get_criteria"].invoke({}))
    n_notes = sum(r["field"] == "notes" for r in out["rules"])
    yield ev("tool_result", "get_criteria", result=out)
    yield ev("thought", f"{len(out['rules'])} rules parsed ({out['parsed_by']}); {n_notes} need the clinical note. "
                        "Evaluating structured fields first with the rule engine.")
    yield ev("tool_call", "evaluate_structured_rules")
    res = json.loads(tools["evaluate_structured_rules"].invoke({}))
    yield ev("tool_result", "evaluate_structured_rules", result=res)
    pending = [r for r in res if r["status"] == "PENDING"]
    if pending:
        yield ev("thought", f"{len(pending)} criteria are pending; reading the note for them.")
        yield ev("tool_call", "check_note_criteria")
        yield ev("tool_result", "check_note_criteria", result=json.loads(tools["check_note_criteria"].invoke({})))
    proposed = decide(state.results).value
    yield ev("thought", f"Applying decision logic to {len(state.results)} results gives {proposed}.")
    tools["submit_decision"].invoke({"decision": proposed, "reason": "decision logic"})
    yield ev("tool_call", "submit_decision", args={"decision": proposed})


def run(trial_id: str, patient_id: str) -> Iterator[dict]:
    trial, patient = db.get_trial(trial_id), db.get_patient(patient_id)
    if trial is None or patient is None:
        yield ev("error", f"unknown trial {trial_id} or patient {patient_id}")
        return
    state = _State(trial, patient)
    mode = "llm-agent" if llm.llm_available() else "fixed-plan"
    yield ev("plan", f"Screen {patient.id} against {trial.id}. Plan: parse criteria, evaluate structured rules, "
                     f"read notes for pending criteria, decide, verify, explain. Mode: {mode}.", mode=mode)
    try:
        yield from (_llm_loop(state) if mode == "llm-agent" else _fixed_plan(state))
    except Exception as e:  # model without tool support, timeout, etc.
        yield ev("correction", f"Agent loop failed ({type(e).__name__}); switching to fixed plan with the same tools.")
        state = _State(trial, patient)
        yield from _fixed_plan(state)

    # ---- self-verification: the agent's claim is re-checked against the rule engine
    if state.rules is None:
        state.rules, _ = parse_criteria(trial)
    if state.results is None:
        yield ev("correction", "Agent skipped rule evaluation; running it now.")
        state.results = evaluate_rules(state.rules, patient)
    if any(r.status == Status.PENDING for r in state.results):
        yield ev("correction", "Agent left note-based criteria unresolved; checking notes now.")
        state.results = resolve_notes(state.rules, patient, state.results)
    engine = decide(state.results)
    proposed = state.proposed
    if proposed != engine.value:
        yield ev("correction", f"Self-verification: agent proposed {proposed}, rule engine says {engine.value}. "
                               "Using the rule engine decision.", proposed=proposed, engine=engine.value)
    else:
        yield ev("verify", f"Self-verification passed: agent decision {proposed} matches the rule engine.")

    verdict = build_verdict(trial, state.rules, patient, state.results, anomaly_flags())
    if proposed != engine.value:
        verdict.corrections.insert(0, f"agent proposed {proposed}; corrected to {engine.value}")
    if verdict.corrections:
        yield ev("verify", "Rationale check: " + "; ".join(verdict.corrections))
    if verdict.decision == Decision.NEEDS_REVIEW:
        unknown = [r.source_text for r in verdict.results if r.status == Status.UNKNOWN]
        yield ev("escalate", "Escalated to the human review queue: " + "; ".join(unknown[:3]))
    db.save_verdict(verdict, mode)
    db.audit("agent_screen", {"trial_id": trial.id, "patient_id": patient.id, "decision": verdict.decision.value,
                              "mode": mode})
    yield ev("final", f"{patient.id}: {verdict.decision.value} (confidence {verdict.confidence:.0%})",
             verdict=verdict.model_dump(mode="json"))


def _safe_json(s):
    try:
        return json.loads(s)
    except (TypeError, ValueError):
        return str(s)[:500]

