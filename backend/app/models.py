from __future__ import annotations

from enum import Enum
from typing import Any, Optional, Union

from pydantic import BaseModel, Field, field_validator

ALLOWED_FIELDS = (
    "age", "sex", "conditions", "medications", "hba1c", "egfr", "bmi",
    "systolic_bp", "fasting_glucose", "weight", "pregnant", "notes",
)
ALLOWED_OPERATORS = (">=", "<=", ">", "<", "==", "!=", "contains", "not_contains")
LAB_FIELDS = ("hba1c", "egfr", "bmi", "systolic_bp", "fasting_glucose", "weight")


class Status(str, Enum):
    MET = "MET"
    NOT_MET = "NOT_MET"
    UNKNOWN = "UNKNOWN"
    PENDING = "PENDING"


class Decision(str, Enum):
    ELIGIBLE = "ELIGIBLE"
    NOT_ELIGIBLE = "NOT_ELIGIBLE"
    NEEDS_REVIEW = "NEEDS_REVIEW"


class Rule(BaseModel):
    id: str
    kind: str = Field(pattern="^(inclusion|exclusion)$")
    field: str
    operator: str
    value: Any = None
    unit: Optional[str] = None
    source_text: str = ""
    section: Optional[str] = None
    any_of: Optional[list["Rule"]] = None

    @field_validator("field")
    @classmethod
    def _field_allowed(cls, v: str) -> str:
        if v not in ALLOWED_FIELDS and v != "group":
            raise ValueError(f"field must be one of {ALLOWED_FIELDS} or 'group', got {v!r}")
        return v

    @field_validator("operator")
    @classmethod
    def _op_allowed(cls, v: str) -> str:
        if v not in ALLOWED_OPERATORS and v != "any_of":
            raise ValueError(f"operator must be one of {ALLOWED_OPERATORS} or 'any_of', got {v!r}")
        return v


class Trial(BaseModel):
    id: str
    title: str
    condition: str
    criteria_text: str = Field(max_length=20000)
    rules: list[Rule] = []


class LabValue(BaseModel):
    value: Optional[float] = None
    unit: Optional[str] = None


class Patient(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,32}$")
    age: Optional[int] = Field(default=None, ge=0, le=130)
    sex: Optional[str] = Field(default=None, pattern="^(F|M|female|male|Female|Male)$")
    conditions: list[str] = []
    medications: list[str] = []
    labs: dict[str, Union[float, int, LabValue, None]] = {}
    pregnant: Optional[bool] = None
    notes: str = Field(default="", max_length=5000)


class CriterionResult(BaseModel):
    rule_id: str
    kind: str
    source_text: str
    section: Optional[str] = None
    status: Status
    patient_value: Any = None
    evaluated_by: str = "rules"
    detail: str = ""
    field: Optional[str] = None
    operator: Optional[str] = None
    threshold: Any = None
    unit: Optional[str] = None
    observed: Any = None
    comparison: Optional[str] = None
    temporal: Optional[dict] = None


class Verdict(BaseModel):
    patient_id: str
    trial_id: str
    decision: Decision
    results: list[CriterionResult]
    rationale: str = ""
    confidence: float
    citations: list[str] = []
    flags: list[str] = []
    counterfactuals: list[str] = []
    corrections: list[str] = []
    why_not: list[dict] = []
    next_best_evidence: list[dict] = []
    evidence_summary: dict = {}
    verification: dict = {}


class ScreenRequest(BaseModel):
    trial_id: str = Field(max_length=64)
    patient_ids: Optional[list[str]] = Field(default=None, max_length=500)


class EvidenceUpdate(BaseModel):
    labs: dict[str, Union[float, LabValue]] = Field(default_factory=dict, max_length=10)
    pregnant: Optional[bool] = None
    notes_append: str = Field(default="", max_length=500)
    conditions_add: list[str] = Field(default_factory=list, max_length=10)
    medications_add: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("labs")
    @classmethod
    def _labs_known(cls, v: dict) -> dict:
        bad = [k for k in v if k not in LAB_FIELDS]
        if bad:
            raise ValueError(f"unknown lab fields {bad}; allowed {LAB_FIELDS}")
        return v


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class TrialCreate(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,32}$")
    title: str = Field(min_length=1, max_length=200)
    condition: str = Field(min_length=1, max_length=100)
    criteria_text: str = Field(min_length=1, max_length=20000)


Rule.model_rebuild()
