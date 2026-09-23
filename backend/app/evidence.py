"""Evidence summaries and Next Best Evidence.

Everything here is deterministic. For each unresolved criterion we simulate both possible outcomes
through the rule engine's decide(), so the "what would this resolve" statement is exact, and rank
the requests by how often that criterion blocks otherwise-eligible patients in the current cohort.
No patient values are invented.
"""
from __future__ import annotations

from typing import Optional

from .models import CriterionResult, Decision, Status
from .rules import PRETTY, decide

UNRESOLVED = (Status.UNKNOWN, Status.PENDING)


def is_blocking(r: CriterionResult) -> bool:
    return (r.kind == "exclusion" and r.status == Status.MET) or (r.kind == "inclusion" and r.status == Status.NOT_MET)


def is_passing(r: CriterionResult) -> bool:
    return (r.kind == "exclusion" and r.status == Status.NOT_MET) or (r.kind == "inclusion" and r.status == Status.MET)


def summary(results: list[CriterionResult]) -> dict:
    passed = [r for r in results if is_passing(r)]
    failed = [r for r in results if is_blocking(r)]
    unknown = [r for r in results if r.status in UNRESOLVED]
    total = len(results)
    return {
        "total": total, "passed": len(passed), "failed": len(failed), "unresolved": len(unknown),
        "completeness": round((total - len(unknown)) / total, 3) if total else 0.0,
        "primary_blockers": [{"rule_id": r.rule_id, "section": r.section, "criterion": r.source_text,
                              "observed": r.patient_value} for r in failed],
        "unresolved_criteria": [{"rule_id": r.rule_id, "section": r.section, "criterion": r.source_text,
                                 "reason": r.detail} for r in unknown],
    }


def block_rates(results_by_patient: list[list[CriterionResult]]) -> dict[str, dict]:
    """How often each criterion is the thing standing between a patient and eligibility.

    Counted over patients whose status on the criterion is known and where no other criterion blocks.
    """
    stats: dict[str, dict] = {}
    for results in results_by_patient:
        for r in results:
            if r.status in UNRESOLVED:
                continue
            if any(is_blocking(o) for o in results if o.rule_id != r.rule_id):
                continue
            s = stats.setdefault(r.rule_id, {"relevant": 0, "blocked": 0})
            s["relevant"] += 1
            s["blocked"] += int(is_blocking(r))
    for s in stats.values():
        s["rate"] = round(s["blocked"] / s["relevant"], 3) if s["relevant"] else None
    return stats


def _reason(r: CriterionResult) -> str:
    d = (r.detail or "").lower()
    if "contradiction" in d:
        return "contradiction"
    if "implausible" in d:
        return "implausible"
    if "injection" in d:
        return "flagged_note"
    if "without a date" in str(r.patient_value).lower():
        return "undated"
    if "cannot convert" in d:
        return "unit"
    if r.field == "notes":
        return "undocumented"
    return "missing"


def _request(r: CriterionResult) -> str:
    reason = _reason(r)
    name = PRETTY.get(r.field or "", r.field or "value")
    if reason == "contradiction":
        return f"Resolve the chart discrepancy: {r.detail.replace('contradiction: ', '')}."
    if reason == "implausible":
        return f"Verify or re-measure {name}: the recorded value {r.patient_value} is outside the plausible range."
    if reason == "flagged_note":
        return "A clinician must read the clinical note manually: it was flagged as possible prompt injection."
    if reason == "undated":
        return f"Record when the event occurred ({r.patient_value.replace('note mentions it without a date: ', '')})."
    if reason == "unit":
        return f"Re-enter {name} in a supported unit."
    if reason == "undocumented":
        return f'Confirm and document in the clinical notes: "{r.source_text.rstrip(".")}".'
    if r.field == "pregnant":
        return "Confirm current pregnancy status from the chart."
    if r.field in ("age", "sex"):
        return f"Record the patient's {r.field}."
    return f"Obtain the latest {name} from the laboratory record."


def _evidence_key(r: CriterionResult) -> str:
    """Criteria resolved by the same piece of evidence (e.g. both halves of an HbA1c range) share a key."""
    if r.field and r.field not in ("notes", "group"):
        return f"{r.field}:{_reason(r)}"
    return r.rule_id


def _with(results: list[CriterionResult], ids: set[str], favourable: bool, only_first: bool = False):
    out, done = [], False
    for r in results:
        if r.rule_id in ids and (not only_first or not done):
            if favourable:
                status = Status.MET if r.kind == "inclusion" else Status.NOT_MET
            else:
                status = Status.NOT_MET if r.kind == "inclusion" else Status.MET
                done = True
            r = r.model_copy(update={"status": status})
        out.append(r)
    return out


def next_best_evidence(results: list[CriterionResult], rates: Optional[dict[str, dict]] = None) -> list[dict]:
    if decide(results) != Decision.NEEDS_REVIEW:
        return []
    groups: dict[str, list[CriterionResult]] = {}
    for r in results:
        if r.status in UNRESOLVED:
            groups.setdefault(_evidence_key(r), []).append(r)
    sole = len(groups) == 1
    items = []
    for members in groups.values():
        u = members[0]
        ids = {m.rule_id for m in members}
        good = decide(_with(results, ids, True)).value
        bad = decide(_with(results, ids, False, only_first=True)).value
        known = [(rates or {}).get(m.rule_id, {}).get("rate") for m in members]
        known = [k for k in known if k is not None]
        rate = max(known) if known else None
        if sole:
            impact, why = "HIGH", "Resolving this alone determines the final decision."
        elif rate is not None and rate >= 0.25:
            impact, why = "HIGH", f"This criterion blocks {rate:.0%} of otherwise-eligible patients in the cohort."
        elif rate is not None and rate >= 0.10:
            impact, why = "MEDIUM", f"This criterion blocks {rate:.0%} of otherwise-eligible patients in the cohort."
        else:
            impact = "LOW"
            why = ("Rarely decisive in this cohort." if rate is not None
                   else "No cohort history for this criterion yet.")
        favourable = "absent" if u.kind == "exclusion" and u.field == "notes" else "criterion satisfied"
        unfavourable = "present" if u.kind == "exclusion" and u.field == "notes" else "criterion fails"
        items.append({
            "rule_ids": sorted(ids), "rule_id": u.rule_id, "section": u.section, "kind": u.kind,
            "criterion": u.source_text, "field": u.field, "reason": _reason(u), "detail": u.detail,
            "impact": impact, "why": why, "cohort_block_rate": rate, "request": _request(u),
            "if_resolved": {favourable: good, unfavourable: bad},
            "can_change_decision": good != Decision.NEEDS_REVIEW.value or bad != Decision.NEEDS_REVIEW.value,
        })
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    items.sort(key=lambda i: (order[i["impact"]], -(i["cohort_block_rate"] or 0), i["kind"] != "exclusion",
                              i["rule_id"]))
    for n, item in enumerate(items, 1):
        item["rank"] = n
        if len(items) > 1:
            item["plan"] = (f"All {len(items)} items are needed to confirm eligibility; any single unfavourable "
                            "result makes the patient not eligible.")
    return items
