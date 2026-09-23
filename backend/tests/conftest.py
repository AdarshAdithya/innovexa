import os
import sys
import tempfile
from pathlib import Path

os.environ["DB_PATH"] = str(Path(tempfile.mkdtemp()) / "test.db")
os.environ["LLM_BASE_URL"] = ""
os.environ["LLM_MODEL"] = ""
os.environ["API_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app import db  # noqa: E402
from app.models import Patient, Rule  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _db():
    db.init()


def patient(**kw) -> Patient:
    base = dict(id="X1", age=50, sex="M", conditions=[], medications=[], labs={}, pregnant=False, notes="")
    base.update(kw)
    return Patient(**base)


def rule(field, op, value, kind="inclusion", unit=None, text="", **kw) -> Rule:
    return Rule(id="R1", kind=kind, field=field, operator=op, value=value, unit=unit,
                source_text=text or f"{field} {op} {value}", **kw)
