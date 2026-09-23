import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from typing import Optional

from . import config
from .models import Patient, Trial

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS trials (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rules_cache (
    trial_id TEXT PRIMARY KEY, criteria_hash TEXT NOT NULL, rules TEXT NOT NULL, parsed_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS verdicts (
    patient_id TEXT, trial_id TEXT, data TEXT NOT NULL, mode TEXT, created_at REAL,
    PRIMARY KEY (patient_id, trial_id));
CREATE TABLE IF NOT EXISTS reviews (
    patient_id TEXT, trial_id TEXT, decision TEXT, note TEXT, created_at REAL,
    PRIMARY KEY (patient_id, trial_id));
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, action TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
"""


@contextmanager
def conn():
    with _lock:
        c = sqlite3.connect(config.DB_PATH)
        c.row_factory = sqlite3.Row
        try:
            yield c
            c.commit()
        finally:
            c.close()


def init(reset: bool = False):
    with conn() as c:
        if reset:
            for t in ("trials", "patients", "verdicts"):
                c.execute(f"DROP TABLE IF EXISTS {t}")
        c.executescript(SCHEMA)
    seed_if_empty()


def seed_if_empty():
    with conn() as c:
        if c.execute("SELECT COUNT(*) FROM trials").fetchone()[0]:
            return
    trials_path = config.DATA_DIR / "trials.json"
    if not trials_path.exists():
        import runpy
        runpy.run_path(str(config.DATA_DIR / "generate.py"), run_name="__main__")
    for t in json.loads(trials_path.read_text()):
        save_trial(Trial(**t))
    for p in json.loads((config.DATA_DIR / "patients.json").read_text()):
        save_patient(Patient(**p))


def save_trial(t: Trial):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO trials VALUES (?, ?)", (t.id, t.model_dump_json()))


def save_patient(p: Patient):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO patients VALUES (?, ?)", (p.id, p.model_dump_json()))


def get_trials() -> list[Trial]:
    with conn() as c:
        return [Trial.model_validate_json(r["data"]) for r in c.execute("SELECT data FROM trials ORDER BY id")]


def get_trial(tid: str) -> Optional[Trial]:
    with conn() as c:
        r = c.execute("SELECT data FROM trials WHERE id = ?", (tid,)).fetchone()
    return Trial.model_validate_json(r["data"]) if r else None


def get_patients() -> list[Patient]:
    with conn() as c:
        return [Patient.model_validate_json(r["data"]) for r in c.execute("SELECT data FROM patients ORDER BY id")]


def get_patient(pid: str) -> Optional[Patient]:
    with conn() as c:
        r = c.execute("SELECT data FROM patients WHERE id = ?", (pid,)).fetchone()
    return Patient.model_validate_json(r["data"]) if r else None


def get_cached_rules(tid: str, h: str):
    with conn() as c:
        r = c.execute("SELECT rules, parsed_by FROM rules_cache WHERE trial_id = ? AND criteria_hash = ?",
                      (tid, h)).fetchone()
    return (json.loads(r["rules"]), r["parsed_by"]) if r else None


def cache_rules(tid: str, h: str, rules: list[dict], parsed_by: str):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO rules_cache VALUES (?, ?, ?, ?)", (tid, h, json.dumps(rules), parsed_by))


def save_verdict(v, mode: str):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO verdicts VALUES (?, ?, ?, ?, ?)",
                  (v.patient_id, v.trial_id, v.model_dump_json(), mode, time.time()))


def get_verdicts(trial_id: Optional[str] = None) -> list[dict]:
    q, args = "SELECT data FROM verdicts", ()
    if trial_id:
        q, args = q + " WHERE trial_id = ?", (trial_id,)
    with conn() as c:
        return [json.loads(r["data"]) for r in c.execute(q, args)]


def clear_verdicts():
    with conn() as c:
        c.execute("DELETE FROM verdicts")


def save_review(pid: str, tid: str, decision: str, note: str):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO reviews VALUES (?, ?, ?, ?, ?)", (pid, tid, decision, note, time.time()))


def get_reviews() -> dict:
    with conn() as c:
        return {(r["patient_id"], r["trial_id"]): dict(r) for r in c.execute("SELECT * FROM reviews")}


def audit(action: str, detail: dict):
    """Audit trail stores identifiers only, never note text or lab values."""
    with conn() as c:
        c.execute("INSERT INTO audit_log (ts, action, detail) VALUES (?, ?, ?)",
                  (time.time(), action, json.dumps(detail)[:2000]))


def get_audit(limit: int = 100) -> list[dict]:
    with conn() as c:
        rows = c.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [{"id": r["id"], "ts": r["ts"], "action": r["action"], "detail": json.loads(r["detail"])} for r in rows]


def kv_get(key: str):
    with conn() as c:
        r = c.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
    return json.loads(r["value"]) if r else None


def kv_set(key: str, value):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO kv VALUES (?, ?)", (key, json.dumps(value)))
