"""Clinical Screening Supervisor.

Externally this is one agent (the "Clinical Screening Agent"). Internally it coordinates seven
specialised workers. None of them can decide eligibility on its own: the Decision Agent only calls
the deterministic rule engine, and the Verification Agent recomputes the evidence independently.

    Protocol Agent          criteria text -> validated rules (+ temporal windows)
    Patient Evidence Agent  structured fields + clinical notes -> criterion evidence
    Safety Agent            missing / contradictory / implausible / suspicious evidence
    Decision Agent          rule engine -> ELIGIBLE / NOT_ELIGIBLE / NEEDS_REVIEW (authoritative)
    Verification Agent      independent recomputation; corrects and logs disagreements
    Explanation Agent       cited rationale, why-not and counterfactuals
    Next-Best-Evidence      NEEDS_REVIEW only: which missing evidence matters most

With an LLM configured, a tool-calling planner chooses which workers to call first. Without one, a
fixed plan calls the same workers. Either way the supervisor then enforces every mandatory stage, so
a planner that skips a tool or claims a verdict gets corrected. Trace events are structured actions
and results only; no model free text is streamed.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Callable, Iterator, Optional

from . import db, llm, notes
from .models import CriterionResult, Decision, Patient, Rule, Status, Trial, Verdict
from .parser import parse_criteria
from .rules import decide
from .screening import anomaly_flags, build_verdict, evaluate_rules, offline_results, resolve_notes

PLANNER_PROMPT = """You coordinate a clinical-trial screening. Screen ONE patient against ONE trial by calling tools:
load_protocol, extract_patient_evidence, check_evidence_safety, then submit_decision.
You never decide eligibility yourself: submit the decision implied by the evidence and the logic
(any exclusion MET -> NOT_ELIGIBLE; any inclusion NOT_MET -> NOT_ELIGIBLE; any UNKNOWN -> NEEDS_REVIEW;
otherwise ELIGIBLE). A deterministic rule engine will check your submission."""


@dataclass
class Context:
    trial: Trial
    patient: Patient
    rules: Optional[list[Rule]] = None
    parsed_by: str = ""
    results: Optional[list[CriterionResult]] = None
    notes_resolved: bool = False
    safety: Optional[dict] = None
    proposed: Optional[str] = None
    decision: Optional[Decision] = None
    corrections: list[str] = field(default_factory=list)
    verification: dict = field(default_factory=dict)
    tools_called: list[str] = field(default_factory=list)


def ev(kind: str, content: str, agent: str = "supervisor", step: str = "", status: str = "complete", **data) -> dict:
    out = {"type": kind, "agent": agent, "step": step or kind, "status": status, "content": content}
    if data:
        out["data"] = data
    return out


def _counts(results: list[CriterionResult]) -> dict:
    from .evidence import is_blocking, is_passing
    return {"passed": sum(is_passing(r) for r in results), "failed": sum(is_blocking(r) for r in results),
            "unknown": sum(r.status in (Status.UNKNOWN, Status.PENDING) for r in results)}


# ------------------------------------------------------------------------------------------ workers
class ProtocolAgent:
    name = "Protocol Agent"

    def run(self, ctx: Context) -> dict:
        ctx.rules, ctx.parsed_by = parse_criteria(ctx.trial)
        temporal = [r.id for r in ctx.rules if notes.WINDOW.search(r.source_text or "")]
        ctx.tools_called.append("load_protocol")
        return {"rules": len(ctx.rules), "parsed_by": ctx.parsed_by,
                "inclusion": sum(r.kind == "inclusion" for r in ctx.rules),
                "exclusion": sum(r.kind == "exclusion" for r in ctx.rules),
                "note_based": sum(r.field == "notes" for r in ctx.rules), "temporal_constraints": temporal}


class PatientEvidenceAgent:
    name = "Patient Evidence Agent"

    def run(self, ctx: Context) -> dict:
        if ctx.rules is None:
            ProtocolAgent().run(ctx)
        results = evaluate_rules(ctx.rules, ctx.patient)
        pending = sum(r.status == Status.PENDING for r in results)
        ctx.results = resolve_notes(ctx.rules, ctx.patient, results)
        ctx.notes_resolved = True
        ctx.tools_called.append("extract_patient_evidence")
        note_results = [r for r in ctx.results if r.field == "notes"]
        dated = sum(1 for r in note_results for e in (r.temporal or {}).get("events", []) if e["months_ago"] is not None)
        negated = sum(1 for r in note_results if r.status == Status.NOT_MET)
        return {"structured_criteria": len(results) - pending, "note_criteria": pending,
                "note_readers": sorted({r.evaluated_by for r in note_results}),
                "negated_findings": negated, "dated_events": dated, **_counts(ctx.results)}


class SafetyAgent:
    name = "Safety / Consistency Agent"

    def run(self, ctx: Context) -> dict:
        if ctx.results is None:
            PatientEvidenceAgent().run(ctx)
        issues = {"missing": [], "contradictions": [], "implausible": [], "suspicious_content": [], "undocumented": []}
        for r in ctx.results:
            d = (r.detail or "").lower()
            if "contradiction" in d:
                issues["contradictions"].append(r.rule_id)
            elif "implausible" in d:
                issues["implausible"].append(r.rule_id)
            elif "injection" in d:
                issues["suspicious_content"].append(r.rule_id)
            elif r.status == Status.UNKNOWN and r.field == "notes":
                issues["undocumented"].append(r.rule_id)
            elif r.status == Status.UNKNOWN:
                issues["missing"].append(r.rule_id)
        anomaly = anomaly_flags().get(ctx.patient.id) or {}
        ctx.safety = {"issues": {k: v for k, v in issues.items() if v}, "advisory_outlier": bool(anomaly.get("outlier")),
                      "outlier_reasons": anomaly.get("reasons", [])}
        ctx.tools_called.append("check_evidence_safety")
        return ctx.safety


class DecisionAgent:
    name = "Decision Agent"

    def run(self, ctx: Context) -> dict:
        ctx.decision = decide(ctx.results)
        overridden = ctx.proposed is not None and ctx.proposed != ctx.decision.value
        if overridden:
            ctx.corrections.append(f"planner proposed {ctx.proposed}; rule engine decided {ctx.decision.value}")
        return {"decision": ctx.decision.value, "proposed": ctx.proposed, "overridden": overridden, **_counts(ctx.results)}


class VerificationAgent:
    name = "Verification Agent"

    def run(self, ctx: Context) -> dict:
        checks = []
        fresh = {r.rule_id: r for r in offline_results(ctx.rules, ctx.patient)}
        fixed = []
        for i, r in enumerate(ctx.results):
            ref = fresh.get(r.rule_id)
            if ref is None:
                continue
            if r.field != "notes" and r.status != ref.status:
                fixed.append(f"{r.rule_id}: {r.status.value} -> {ref.status.value} (recomputed from raw record)")
                ctx.results[i] = ref
            elif r.field == "notes" and {r.status, ref.status} == {Status.MET, Status.NOT_MET}:
                fixed.append(f"{r.rule_id}: note readers disagree ({r.evaluated_by} {r.status.value}, "
                             f"deterministic reader {ref.status.value}); set UNKNOWN for human review")
                ctx.results[i] = r.model_copy(update={
                    "status": Status.UNKNOWN, "detail": "note readers disagree; needs human review"})
        checks.append({"check": "structured criteria recomputed from raw patient record", "ok": not fixed})
        missing = {r.id for r in ctx.rules} - {r.rule_id for r in ctx.results}
        checks.append({"check": "every protocol criterion evaluated", "ok": not missing})
        pending = [r.rule_id for r in ctx.results if r.status == Status.PENDING]
        checks.append({"check": "no criterion left pending", "ok": not pending})
        engine = decide(ctx.results)
        checks.append({"check": "decision equals rule-engine output", "ok": engine == ctx.decision})
        if engine != ctx.decision:
            fixed.append(f"decision {ctx.decision.value} -> {engine.value} after verification")
            ctx.decision = engine
        ctx.corrections.extend(fixed)
        ctx.verification = {"status": "corrected" if fixed else "passed", "checks": checks, "corrections": fixed}
        return ctx.verification


class ExplanationAgent:
    name = "Explanation Agent"

    def run(self, ctx: Context) -> Verdict:
        verdict = build_verdict(ctx.trial, ctx.rules, ctx.patient, ctx.results, anomaly_flags())
        verdict.corrections = ctx.corrections + verdict.corrections
        verdict.verification = ctx.verification
        return verdict


class NextBestEvidenceAgent:
    name = "Next-Best-Evidence Agent"

    def run(self, verdict: Verdict) -> list[dict]:
        return verdict.next_best_evidence


# ------------------------------------------------------------------------------------------ planners
TOOLS = {"load_protocol": ProtocolAgent, "extract_patient_evidence": PatientEvidenceAgent,
         "check_evidence_safety": SafetyAgent}


def fixed_planner(ctx: Context) -> Iterator[dict]:
    for tool in ("load_protocol", "extract_patient_evidence", "check_evidence_safety"):
        yield ev("tool_call", tool, agent="planner", step="planner_action")
        TOOLS[tool]().run(ctx)
    ctx.proposed = decide(ctx.results).value
    yield ev("tool_call", "submit_decision", agent="planner", step="planner_action", decision=ctx.proposed)


def llm_planner(ctx: Context) -> Iterator[dict]:
    from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
    from langchain_core.tools import tool

    @tool
    def load_protocol() -> str:
        """Parse the trial's eligibility criteria into validated rules."""
        return json.dumps(ProtocolAgent().run(ctx), default=str)

    @tool
    def extract_patient_evidence() -> str:
        """Evaluate structured fields with the rule engine and read the clinical note for note-based criteria."""
        PatientEvidenceAgent().run(ctx)
        return json.dumps([{"rule": r.rule_id, "kind": r.kind, "status": r.status.value} for r in ctx.results])

    @tool
    def check_evidence_safety() -> str:
        """Report missing, contradictory, implausible or suspicious evidence."""
        return json.dumps(SafetyAgent().run(ctx), default=str)

    @tool
    def submit_decision(decision: str) -> str:
        """Submit ELIGIBLE, NOT_ELIGIBLE or NEEDS_REVIEW. The rule engine will verify it."""
        ctx.proposed = decision.strip().upper()
        return "submitted"

    tools = [load_protocol, extract_patient_evidence, check_evidence_safety, submit_decision]
    by_name = {t.name: t for t in tools}
    model = llm.get_llm().bind_tools(tools)
    msgs = [SystemMessage(content=PLANNER_PROMPT),
            HumanMessage(content=f"Screen patient {ctx.patient.id} for trial {ctx.trial.id}.")]
    for _ in range(8):
        ai = model.invoke(msgs)
        msgs.append(ai)
        if not ai.tool_calls:
            break
        for call in ai.tool_calls:
            yield ev("tool_call", call["name"], agent="planner", step="planner_action", **call.get("args", {}))
            t = by_name.get(call["name"])
            out = t.invoke(call.get("args", {})) if t else f"unknown tool {call['name']}"
            msgs.append(ToolMessage(content=str(out), tool_call_id=call["id"]))
        if ctx.proposed:
            break


# ------------------------------------------------------------------------------------------ supervisor
def run(trial_id: str, patient_id: str, planner: Optional[Callable[[Context], Iterator[dict]]] = None,
        save: bool = True) -> Iterator[dict]:
    trial, patient = db.get_trial(trial_id), db.get_patient(patient_id)
    if trial is None or patient is None:
        yield ev("error", f"unknown trial {trial_id} or patient {patient_id}", status="failed")
        return
    ctx = Context(trial, patient)
    if planner is None:
        planner = llm_planner if llm.llm_available() else fixed_planner
    mode = "llm-planner" if planner is llm_planner else ("fixed-plan" if planner is fixed_planner else "custom")
    yield ev("plan", f"Clinical Screening Agent: {patient.id} × {trial.id}", step="trial_loaded", mode=mode,
             workers=[w.name for w in (ProtocolAgent, PatientEvidenceAgent, SafetyAgent, DecisionAgent,
                                       VerificationAgent, ExplanationAgent, NextBestEvidenceAgent)])
    try:
        yield from planner(ctx)
    except Exception as e:
        ctx.corrections.append(f"planner failed ({type(e).__name__}); fixed plan used")
        yield ev("correction", f"Planner failed ({type(e).__name__}); switching to the fixed plan.", status="corrected")
        ctx.proposed, ctx.tools_called = None, []
        yield from fixed_planner(ctx)

    # Mandatory stages: enforced here whatever the planner did.
    for tool, agent_cls, step in (("load_protocol", ProtocolAgent, "criteria_parsed"),
                                  ("extract_patient_evidence", PatientEvidenceAgent, "patient_evidence_extracted"),
                                  ("check_evidence_safety", SafetyAgent, "safety_checked")):
        skipped = tool not in ctx.tools_called
        if skipped:
            ctx.corrections.append(f"planner skipped {tool}; supervisor ran it")
            yield ev("correction", f"Planner skipped {tool}; running {agent_cls.name}.", agent="supervisor",
                     step=step, status="corrected")
            agent_cls().run(ctx)
        yield ev("step", _describe(step, ctx), agent=agent_cls.name, step=step,
                 status="corrected" if skipped else "complete", **_step_data(step, ctx))

    if not ctx.notes_resolved:
        ctx.results = resolve_notes(ctx.rules, ctx.patient, ctx.results)

    d = DecisionAgent().run(ctx)
    yield ev("step", f"{d['passed']} passed · {d['failed']} failed · {d['unknown']} unresolved → {d['decision']}",
             agent=DecisionAgent.name, step="rule_evaluation", **d)
    if d["overridden"]:
        yield ev("correction", f"Planner proposed {d['proposed']}; rule engine decided {d['decision']}. "
                               "The rule engine is authoritative.", agent=DecisionAgent.name,
                 step="verdict_override", status="corrected", proposed=d["proposed"], engine=d["decision"])

    report = VerificationAgent().run(ctx)
    yield ev("verify", "Verification " + report["status"], agent=VerificationAgent.name, step="verification",
             status=report["status"], checks=report["checks"], corrections=report["corrections"])

    verdict = ExplanationAgent().run(ctx)
    yield ev("step", f"Rationale written citing {len(verdict.citations)} protocol sections",
             agent=ExplanationAgent.name, step="explanation_generated",
             status="corrected" if verdict.corrections and any("rationale" in c for c in verdict.corrections)
             else "complete", why_not=len(verdict.why_not), counterfactuals=len(verdict.counterfactuals))

    if verdict.decision == Decision.NEEDS_REVIEW:
        nbe = NextBestEvidenceAgent().run(verdict)
        top = nbe[0] if nbe else None
        yield ev("step", f"{len(nbe)} evidence request(s); top: {top['request'] if top else 'none'}",
                 agent=NextBestEvidenceAgent.name, step="next_best_evidence", items=len(nbe),
                 top_impact=top["impact"] if top else None)
        yield ev("escalate", "Added to the human review queue", step="escalated_to_review")

    if save:
        db.save_verdict(verdict, mode)
        db.audit("agent_screen", {"trial_id": trial.id, "patient_id": patient.id,
                                  "decision": verdict.decision.value, "mode": mode,
                                  "corrections": len(verdict.corrections)})
    yield ev("final", f"{patient.id} × {trial.id}: {verdict.decision.value} "
                      f"(evidence completeness {verdict.confidence:.0%})", step="final_verdict",
             verdict=verdict.model_dump(mode="json"))


def _describe(step: str, ctx: Context) -> str:
    if step == "criteria_parsed":
        return f"{len(ctx.rules)} criteria parsed ({ctx.parsed_by})"
    if step == "patient_evidence_extracted":
        n_notes = sum(r.field == "notes" for r in ctx.results)
        return f"Evidence extracted for {len(ctx.results)} criteria ({n_notes} from clinical notes)"
    issues = (ctx.safety or {}).get("issues", {})
    return ("No evidence-quality issues" if not issues
            else "Issues: " + ", ".join(f"{len(v)} {k}" for k, v in issues.items()))


def _step_data(step: str, ctx: Context) -> dict:
    if step == "criteria_parsed":
        return {"rules": len(ctx.rules), "parsed_by": ctx.parsed_by,
                "temporal_constraints": [r.id for r in ctx.rules if notes.WINDOW.search(r.source_text or "")]}
    if step == "patient_evidence_extracted":
        return _counts(ctx.results)
    return ctx.safety or {}


def screen_one(trial_id: str, patient_id: str, planner=None, save: bool = True) -> tuple[Verdict, list[dict]]:
    events = list(run(trial_id, patient_id, planner=planner, save=save))
    final = next((e for e in events if e["type"] == "final"), None)
    if final is None:
        raise KeyError(events[-1]["content"] if events else "screening failed")
    return Verdict(**final["data"]["verdict"]), events
