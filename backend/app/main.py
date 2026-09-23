from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import agent, config, db, evaluate, llm, ml, query
from .models import QueryRequest, ScreenRequest, Trial, TrialCreate
from .parser import parse_criteria
from .screening import anomaly_flags, screen
from .security import SecurityMiddleware


@asynccontextmanager
async def lifespan(_app):
    db.init()
    yield


app = FastAPI(title="Clinical Trial Eligibility Screener", version="1.0.0", lifespan=lifespan)
app.add_middleware(SecurityMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["Content-Type", "X-API-Key"])


@app.get("/health")
def health():
    reply = llm.complete("You are a health check.", "Reply with OK") if llm.llm_available() else None
    return {"status": "ok", "llm_configured": llm.llm_available(), "llm_model": config.LLM_MODEL or None,
            "llm_reply": reply, "mode": "llm" if llm.llm_available() else "offline"}


@app.get("/trials")
def list_trials():
    patients = db.get_patients()
    verdicts = db.get_verdicts()
    out = []
    for t in db.get_trials():
        rules, by = parse_criteria(t)
        tv = [v for v in verdicts if v["trial_id"] == t.id]
        out.append({**t.model_dump(exclude={"rules"}), "rules": [r.model_dump() for r in rules], "parsed_by": by,
                    "patient_count": len(patients),
                    "screened": {d: sum(v["decision"] == d for v in tv) for d in evaluate.CLASSES}})
    return out


@app.post("/trials", status_code=201)
def create_trial(body: TrialCreate):
    if db.get_trial(body.id):
        raise HTTPException(409, f"trial {body.id} already exists")
    trial = Trial(**body.model_dump())
    rules, by = parse_criteria(trial, use_cache=False)
    if not rules:
        raise HTTPException(422, "no criteria could be parsed from the text")
    db.save_trial(trial)
    db.audit("trial_created", {"trial_id": trial.id, "rules": len(rules), "parsed_by": by})
    return {**trial.model_dump(exclude={"rules"}), "rules": [r.model_dump() for r in rules], "parsed_by": by}


@app.get("/patients")
def list_patients():
    patients = db.get_patients()
    flags = anomaly_flags(patients)
    return [{**p.model_dump(), "anomaly": flags.get(p.id)} for p in patients]


@app.get("/patients/{patient_id}/rankings")
def rankings(patient_id: str):
    p = db.get_patient(patient_id)
    if p is None:
        raise HTTPException(404, "unknown patient")
    decided = {v["trial_id"]: v["decision"] for v in db.get_verdicts() if v["patient_id"] == patient_id}
    return ml.rank_trials(p, db.get_trials(), decided)


@app.post("/screen")
def screen_endpoint(body: ScreenRequest):
    try:
        verdicts = screen(body.trial_id, body.patient_ids)
    except KeyError as e:
        raise HTTPException(404, str(e))
    db.audit("screen", {"trial_id": body.trial_id, "patients": len(verdicts)})
    return [v.model_dump(mode="json") for v in verdicts]


@app.get("/screen/stream")
def screen_stream(trial_id: str = Query(max_length=64),
                  patient_ids: Optional[str] = Query(default=None, max_length=4000)):
    if db.get_trial(trial_id) is None:
        raise HTTPException(404, "unknown trial")
    ids = [i for i in (patient_ids or "").split(",") if i] or [p.id for p in db.get_patients()]

    def events():
        for pid in ids:
            for e in agent.run(trial_id, pid):
                yield f"data: {json.dumps({'patient_id': pid, 'trial_id': trial_id, **e}, default=str)}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'content': f'screened {len(ids)} patient(s)'})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/query")
def query_endpoint(body: QueryRequest):
    db.audit("query", {"length": len(body.question)})
    return query.answer(body.question)


@app.get("/metrics")
def metrics(refresh: bool = False, baseline: bool = False):
    return evaluate.run(refresh=refresh, with_baseline=baseline)


@app.get("/cohorts")
def cohorts(k: Optional[int] = Query(default=None, ge=2, le=6)):
    return ml.cohorts(db.get_patients(), k)


class ReviewIn(BaseModel):
    patient_id: str = Field(max_length=32)
    trial_id: str = Field(max_length=64)
    decision: str = Field(pattern="^(ELIGIBLE|NOT_ELIGIBLE)$")
    note: str = Field(default="", max_length=500)


@app.get("/review")
def review_queue():
    reviews = db.get_reviews()
    out = []
    for v in db.get_verdicts():
        if v["decision"] != "NEEDS_REVIEW" and not v.get("flags"):
            continue
        r = reviews.get((v["patient_id"], v["trial_id"]))
        out.append({"patient_id": v["patient_id"], "trial_id": v["trial_id"], "decision": v["decision"],
                    "flags": v.get("flags", []),
                    "unknown": [c["source_text"] for c in v["results"] if c["status"] == "UNKNOWN"],
                    "reviewed": r})
    return sorted(out, key=lambda x: (x["reviewed"] is not None, x["trial_id"], x["patient_id"]))


@app.post("/review")
def submit_review(body: ReviewIn):
    db.save_review(body.patient_id, body.trial_id, body.decision, body.note)
    db.audit("human_review", {"patient_id": body.patient_id, "trial_id": body.trial_id, "decision": body.decision})
    return {"ok": True}


@app.get("/audit")
def audit(limit: int = Query(default=100, ge=1, le=1000)):
    return db.get_audit(limit)
