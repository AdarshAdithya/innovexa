import json

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_trials_and_patients():
    trials = client.get("/trials").json()
    assert len(trials) == 4 and all(t["rules"] for t in trials)
    patients = client.get("/patients").json()
    assert len(patients) == 120
    assert next(p for p in patients if p["id"] == "P006")["anomaly"]["implausible"] is True


def test_screen_returns_verdicts_with_rationales():
    out = client.post("/screen", json={"trial_id": "T1-DIAB", "patient_ids": ["P001", "P003"]}).json()
    assert [v["decision"] for v in out] == ["ELIGIBLE", "NEEDS_REVIEW"]
    assert all(v["rationale"] and v["results"] for v in out)


def test_screen_unknown_trial_404():
    assert client.post("/screen", json={"trial_id": "NOPE"}).status_code == 404


def test_metrics_meet_target():
    m = client.get("/metrics?refresh=true").json()
    assert m["n"] == 480 and m["accuracy"] >= 0.85 and m["relevant"]["accuracy"] >= 0.85
    assert m["f1"] is not None and m["macro_f1"] is not None
    assert len(m["confusion_matrix"]) == 3 and m["judge"]["avg_clarity"] is not None


def test_stream_emits_trace_and_final():
    with client.stream("GET", "/screen/stream?trial_id=T1-DIAB&patient_ids=P008") as r:
        events = [json.loads(line[6:]) for line in r.iter_lines() if line.startswith("data: ")]
    kinds = [e["type"] for e in events]
    assert "tool_call" in kinds and "verify" in kinds and kinds[-1] == "done"
    steps = [e.get("step") for e in events]
    for s in ("criteria_parsed", "patient_evidence_extracted", "rule_evaluation", "verification", "final_verdict"):
        assert s in steps
    assert "thought" not in kinds
    final = next(e for e in events if e["type"] == "final")
    assert final["data"]["verdict"]["decision"] == "NOT_ELIGIBLE"


def test_query():
    client.post("/screen", json={"trial_id": "T1-DIAB"})
    out = client.post("/query", json={"question": "which patients over 60 are eligible for the diabetes trial"}).json()
    assert out["filter"]["trial_id"] == "T1-DIAB" and all(r["age"] > 60 for r in out["rows"])


def test_create_trial_and_bad_input():
    body = {"id": "T9-NEW", "title": "New", "condition": "Asthma",
            "criteria_text": "Inclusion Criteria:\n1. Age 12 to 65 years.\n2. Diagnosis of asthma.\n"}
    r = client.post("/trials", json=body)
    assert r.status_code == 201 and len(r.json()["rules"]) == 3
    assert client.post("/trials", json=body).status_code == 409
    assert client.post("/trials", json={**body, "id": "x; drop"}).status_code == 422


def test_cohorts_review_audit_security_headers():
    c = client.get("/cohorts").json()
    assert c["k"] >= 2 and len(c["points"]) == 120
    assert isinstance(client.get("/review").json(), list)
    r = client.get("/audit")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert all("notes" not in json.dumps(a["detail"]) for a in r.json())
