"""Synthetic data generator: 4 trials, 120 patients, 480 labeled patient-trial pairs.

30 hand-written edge-case patients (P001-P030), 4 guaranteed demo patients (P040-P043) and a seeded
random cohort for the rest.

Labels are computed from each patient's *true* clinical state by the functions at the bottom
of this file, which share no code with the app's parser or rule engine. That keeps the
accuracy number honest: the app has to recover the truth from free-text criteria, mixed units,
missing values and clinical notes.

Run: python data/generate.py
"""
import json
import random
from pathlib import Path

SEED = 42
OUT = Path(__file__).resolve().parent

TRIALS = [
    {
        "id": "T1-DIAB",
        "title": "GLUCO-T2D: oral GLP-1 agonist in adults with type 2 diabetes",
        "condition": "Type 2 diabetes",
        "criteria_text": (
            "Inclusion Criteria:\n"
            "1. Adults aged 18 to 75 years (inclusive).\n"
            "2. Diagnosis of type 2 diabetes mellitus.\n"
            "3. HbA1c between 7.0% and 10.5% at screening.\n"
            "4. Body mass index of 40 kg/m2 or less.\n"
            "5. Fasting plasma glucose of 270 mg/dL or less.\n"
            "Exclusion Criteria:\n"
            "1. eGFR below 45 mL/min/1.73m2.\n"
            "2. Currently pregnant or planning pregnancy.\n"
            "3. Current use of insulin.\n"
            "4. Myocardial infarction or stroke within the past 6 months.\n"
        ),
    },
    {
        "id": "T2-HTN",
        "title": "PRESSURE-HTN: once-daily combination therapy for uncontrolled hypertension",
        "condition": "Hypertension",
        "criteria_text": (
            "Inclusion Criteria:\n"
            "1. Age 40 to 80 years.\n"
            "2. Diagnosis of essential hypertension.\n"
            "3. Systolic blood pressure between 140 and 179 mmHg.\n"
            "4. Body weight of at least 50 kg.\n"
            "Exclusion Criteria:\n"
            "1. eGFR below 30 mL/min/1.73m2.\n"
            "2. Diagnosis of heart failure.\n"
            "3. Current use of spironolactone.\n"
            "4. Currently pregnant.\n"
        ),
    },
    {
        "id": "T3-CKD",
        "title": "RENAL-PROTECT: SGLT2 inhibitor in moderate chronic kidney disease",
        "condition": "Chronic kidney disease",
        "criteria_text": (
            "Inclusion Criteria:\n"
            "1. Age 18 to 80 years.\n"
            "2. Diagnosis of chronic kidney disease.\n"
            "3. eGFR between 25 and 60 mL/min/1.73m2.\n"
            "4. Either type 2 diabetes or hypertension.\n"
            "Exclusion Criteria:\n"
            "1. History of kidney transplant.\n"
            "2. Currently receiving dialysis.\n"
            "3. Currently pregnant.\n"
        ),
    },
    {
        "id": "T4-BRCA",
        "title": "HER2-BRIDGE: targeted therapy for HER2-positive breast cancer",
        "condition": "Breast cancer",
        "criteria_text": (
            "Inclusion Criteria:\n"
            "1. Female sex.\n"
            "2. Age 18 years or older.\n"
            "3. Diagnosis of breast cancer.\n"
            "4. HER2-positive tumour status.\n"
            "Exclusion Criteria:\n"
            "1. Active brain metastases.\n"
            "2. Currently pregnant.\n"
            "3. Prior treatment with doxorubicin.\n"
            "4. eGFR below 30 mL/min/1.73m2.\n"
        ),
    },
]

# Each patient: the structured record the app sees, plus `truth` that only the labeler sees.
# Lab values are canonical units (% / mL/min/1.73m2 / kg/m2 / mmHg / mg/dL / kg) unless given
# as {"value", "unit"}. None means the lab is missing from the record.
PATIENTS = [
    dict(id="P001", age=18, sex="M", conditions=["Type 2 diabetes mellitus"], medications=["Metformin"],
         labs=dict(hba1c=7.0, egfr=95, bmi=24.1, systolic_bp=118, fasting_glucose=150, weight=72),
         pregnant=False, notes="Newly diagnosed T2DM. No history of myocardial infarction or stroke.",
         truth=dict(mi_recent=False), why="Boundary: age exactly 18 and HbA1c exactly 7.0; negated MI in note."),
    dict(id="P002", age=75, sex="F", conditions=["Type 2 diabetes mellitus", "Hypertension"],
         medications=["Metformin", "Lisinopril"],
         labs=dict(hba1c=10.5, egfr=45, bmi=40.0, systolic_bp=182, fasting_glucose=200, weight=101),
         pregnant=False, notes="Postmenopausal. Denies any prior heart attack or stroke.",
         truth=dict(mi_recent=False), why="Boundaries: age 75, HbA1c 10.5, BMI 40.0, eGFR exactly 45 (not below 45)."),
    dict(id="P003", age=60, sex="M", conditions=["Type 2 diabetes mellitus"], medications=["Metformin"],
         labs=dict(hba1c=None, egfr=80, bmi=29.3, systolic_bp=128, fasting_glucose=160, weight=88),
         pregnant=False, notes="HbA1c pending from outside lab. No MI or stroke.",
         truth=dict(mi_recent=False), why="Missing HbA1c must give UNKNOWN, never a guess."),
    dict(id="P004", age=52, sex="M", conditions=["Type 2 diabetes mellitus"], medications=["Metformin", "Gliclazide"],
         labs=dict(hba1c=9.8, egfr=88, bmi=33.0, systolic_bp=135,
                   fasting_glucose={"value": 16.0, "unit": "mmol/L"}, weight=99),
         pregnant=False, notes="Poorly controlled. No history of myocardial infarction.",
         truth=dict(mi_recent=False), why="Glucose 16.0 mmol/L = 288 mg/dL, above the 270 mg/dL cutoff."),
    dict(id="P005", age=47, sex="F", conditions=["Type 2 diabetes mellitus"], medications=["Metformin"],
         labs=dict(hba1c=7.9, egfr=102, bmi=28.4, systolic_bp=122,
                   fasting_glucose={"value": 8.0, "unit": "mmol/L"}, weight=76),
         pregnant=False, notes="No cardiovascular events. No history of stroke or MI.",
         truth=dict(mi_recent=False), why="Glucose 8.0 mmol/L = 144 mg/dL, within limit."),
    dict(id="P006", age=58, sex="M", conditions=["Type 2 diabetes mellitus"], medications=["Metformin"],
         labs=dict(hba1c=45, egfr=76, bmi=30.2, systolic_bp=130, fasting_glucose=170, weight=90),
         pregnant=False, notes="No history of MI or stroke.",
         truth=dict(mi_recent=False, implausible=["hba1c"]), why="HbA1c 45% is physiologically impossible (data entry error)."),
    dict(id="P007", age=34, sex="F", conditions=["Type 2 diabetes mellitus"], medications=["Metformin"],
         labs=dict(hba1c=8.1, egfr=110, bmi=31.5, systolic_bp=116, fasting_glucose=165, weight=84),
         pregnant=False, notes="Patient reports she is currently 12 weeks pregnant. No history of MI or stroke.",
         truth=dict(mi_recent=False, pregnancy_conflict=True),
         why="Structured field says not pregnant, the note says pregnant: contradiction needs a human."),
    dict(id="P008", age=66, sex="M", conditions=["Type 2 diabetes mellitus", "Coronary artery disease"],
         medications=["Metformin", "Aspirin", "Atorvastatin"],
         labs=dict(hba1c=8.4, egfr=70, bmi=29.0, systolic_bp=132, fasting_glucose=175, weight=86),
         pregnant=False, notes="Admitted with myocardial infarction 3 months ago, stented.",
         truth=dict(mi_recent=True), why="MI 3 months ago is inside the 6-month exclusion window."),
    dict(id="P009", age=69, sex="M", conditions=["Type 2 diabetes mellitus", "Coronary artery disease"],
         medications=["Metformin", "Aspirin"],
         labs=dict(hba1c=7.6, egfr=68, bmi=27.5, systolic_bp=126, fasting_glucose=150, weight=80),
         pregnant=False, notes="Myocardial infarction 3 years ago, stable since.",
         truth=dict(mi_recent=False), why="MI 3 years ago is outside the 6-month window."),
    dict(id="P010", age=55, sex="F", conditions=["Type 2 diabetes mellitus"], medications=["Insulin glargine", "Metformin"],
         labs=dict(hba1c=9.1, egfr=85, bmi=34.0, systolic_bp=124, fasting_glucose=190, weight=92),
         pregnant=False, notes="On basal insulin. No history of MI or stroke.",
         truth=dict(mi_recent=False), why="Current insulin use is an exclusion."),
    dict(id="P011", age=66, sex="M", conditions=["Chronic kidney disease stage 3", "Hypertension"],
         medications=["Amlodipine"],
         labs=dict(hba1c=5.6, egfr=38, bmi=27.0, systolic_bp=150, fasting_glucose=98, weight=80),
         pregnant=False, notes="CKD stage 3b. Not on dialysis.",
         truth=dict(dialysis=False), why="Nested logic: CKD and (T2D or hypertension) satisfied via hypertension."),
    dict(id="P012", age=45, sex="F", conditions=["Chronic kidney disease", "Polycystic kidney disease"],
         medications=[],
         labs=dict(hba1c=5.4, egfr=42, bmi=23.0, systolic_bp=126, fasting_glucose=92, weight=62),
         pregnant=False, notes="ADPKD. Not on dialysis.",
         truth=dict(dialysis=False), why="Nested logic: neither type 2 diabetes nor hypertension."),
    dict(id="P013", age=71, sex="M", conditions=["Chronic kidney disease stage 5", "Hypertension"],
         medications=["Amlodipine", "Sevelamer"],
         labs=dict(hba1c=5.9, egfr=14, bmi=25.0, systolic_bp=158, fasting_glucose=101, weight=75),
         pregnant=False, notes="On hemodialysis three times weekly.",
         truth=dict(dialysis=True), why="eGFR 14 below range and currently on dialysis."),
    dict(id="P014", age=63, sex="F", conditions=["Chronic kidney disease", "Type 2 diabetes mellitus"],
         medications=["Metformin"],
         labs=dict(hba1c=8.2, egfr=50, bmi=30.0, systolic_bp=134, fasting_glucose=168, weight=80),
         pregnant=False, notes="No prior MI or stroke.",
         truth=dict(mi_recent=False, dialysis=None),
         why="Dialysis status not documented anywhere: unknown, needs review for the CKD trial."),
    dict(id="P015", age=52, sex="F", conditions=["Breast cancer", "HER2-positive"], medications=["Trastuzumab"],
         labs=dict(hba1c=5.5, egfr=90, bmi=26.0, systolic_bp=120, fasting_glucose=95, weight=68),
         pregnant=False, notes="Invasive ductal carcinoma, HER2-positive. Staging MRI: no brain metastases.",
         truth=dict(brain_mets=False), why="Meets every breast cancer criterion; negated brain metastases."),
    dict(id="P016", age=48, sex="F", conditions=["Breast cancer", "HER2-negative"], medications=["Letrozole"],
         labs=dict(hba1c=5.3, egfr=95, bmi=24.0, systolic_bp=118, fasting_glucose=90, weight=60),
         pregnant=False, notes="ER-positive, HER2-negative. No brain metastases.",
         truth=dict(brain_mets=False), why="HER2-negative tumour fails the HER2-positive inclusion."),
    dict(id="P017", age=61, sex="F", conditions=["Breast cancer", "HER2-positive"], medications=["Trastuzumab"],
         labs=dict(hba1c=5.8, egfr=82, bmi=27.0, systolic_bp=124, fasting_glucose=99, weight=70),
         pregnant=False, notes="MRI shows active brain metastases, two lesions.",
         truth=dict(brain_mets=True), why="Active brain metastases is an exclusion."),
    dict(id="P018", age=57, sex="F", conditions=["Breast cancer", "HER2-positive"], medications=["Doxorubicin", "Trastuzumab"],
         labs=dict(hba1c=5.6, egfr=88, bmi=25.5, systolic_bp=122, fasting_glucose=94, weight=66),
         pregnant=False, notes="Completed AC chemotherapy. No brain metastases.",
         truth=dict(brain_mets=False), why="Prior doxorubicin is an exclusion."),
    dict(id="P019", age=44, sex="F", conditions=["Breast cancer", "HER2-positive"], medications=["Trastuzumab"],
         labs=dict(hba1c=5.2, egfr=None, bmi=22.0, systolic_bp=116, fasting_glucose=88, weight=58),
         pregnant=False, notes="No brain metastases on staging.",
         truth=dict(brain_mets=False), why="Missing eGFR: the eGFR exclusion cannot be ruled out."),
    dict(id="P020", age=70, sex="M", conditions=["Hypertension", "Heart failure"], medications=["Furosemide", "Bisoprolol"],
         labs=dict(hba1c=5.7, egfr=55, bmi=28.0, systolic_bp=150, fasting_glucose=100, weight=84),
         pregnant=False, notes="HFrEF, EF 30%.",
         truth=dict(), why="Heart failure is an exclusion for the hypertension trial."),
    dict(id="P021", age=40, sex="F", conditions=["Hypertension"], medications=["Amlodipine"],
         labs=dict(hba1c=5.4, egfr=100, bmi=26.0, systolic_bp=140, fasting_glucose=90, weight=70),
         pregnant=False, notes="Essential hypertension, not currently pregnant.",
         truth=dict(), why="Boundaries: age exactly 40 and systolic BP exactly 140."),
    dict(id="P022", age=62, sex="M", conditions=["Hypertension"], medications=["Spironolactone", "Amlodipine"],
         labs=dict(hba1c=5.6, egfr=78, bmi=29.0, systolic_bp=162, fasting_glucose=97, weight=90),
         pregnant=False, notes="Resistant hypertension.",
         truth=dict(), why="Current spironolactone use is an exclusion."),
    dict(id="P023", age=59, sex="M", conditions=["Hypertension"], medications=["Losartan"],
         labs=dict(hba1c=5.5, egfr=85, bmi=27.0, systolic_bp=185, fasting_glucose=95, weight=82),
         pregnant=False, notes="Severely elevated readings at home.",
         truth=dict(), why="Systolic BP 185 is above the 179 upper limit."),
    dict(id="P024", age=55, sex="M", conditions=["Hypertension"], medications=["Losartan"],
         labs=dict(hba1c=5.6, egfr=90, bmi=27.3, systolic_bp=160, fasting_glucose=96,
                   weight={"value": 180, "unit": "lb"}),
         pregnant=False, notes="Weight recorded in pounds at community clinic.",
         truth=dict(), why="180 lb = 81.6 kg, meets the 50 kg minimum."),
    dict(id="P025", age=67, sex="F", conditions=["Hypertension"], medications=["Hydrochlorothiazide"],
         labs=dict(hba1c=5.5, egfr=72, bmi=18.9, systolic_bp=155, fasting_glucose=90,
                   weight={"value": 100, "unit": "lb"}),
         pregnant=False, notes="Low body weight, frail.",
         truth=dict(), why="100 lb = 45.4 kg, below the 50 kg minimum."),
    dict(id="P026", age=58, sex="M", conditions=["Hypertension", "Type 2 diabetes mellitus"],
         medications=["Metformin", "Ramipril"],
         labs=dict(hba1c=8.8, egfr=72, bmi=31.0, systolic_bp=152, fasting_glucose=180, weight=92),
         pregnant=False, notes="No history of myocardial infarction or stroke.",
         truth=dict(mi_recent=False), why="Eligible for both the diabetes and hypertension trials."),
    dict(id="P027", age=77, sex="F", conditions=["Type 2 diabetes mellitus"], medications=["Metformin"],
         labs=dict(hba1c=8.0, egfr=60, bmi=27.0, systolic_bp=130, fasting_glucose=150, weight=70),
         pregnant=False, notes="No MI or stroke.",
         truth=dict(mi_recent=False), why="Age 77 is above the 75 upper limit."),
    dict(id="P028", age=50, sex="M", conditions=["Hyperlipidemia"], medications=["Atorvastatin"],
         labs=dict(hba1c=5.5, egfr=95, bmi=26.0, systolic_bp=124, fasting_glucose=94, weight=80),
         pregnant=False, notes="Routine check-up.",
         truth=dict(), why="No qualifying diagnosis for any trial."),
    dict(id="P029", age=64, sex="M", conditions=["Type 2 diabetes mellitus", "Chronic kidney disease"],
         medications=["Metformin", "Empagliflozin"],
         labs=dict(hba1c=7.8, egfr=40, bmi=30.0, systolic_bp=136, fasting_glucose=160, weight=88),
         pregnant=False, notes="Not on dialysis. No history of MI or stroke.",
         truth=dict(mi_recent=False, dialysis=False), why="eGFR 40 excludes from diabetes trial but fits the CKD trial."),
    dict(id="P030", age=41, sex="F", conditions=["Hypertension"], medications=["Labetalol"],
         labs=dict(hba1c=5.3, egfr=110, bmi=27.0, systolic_bp=148, fasting_glucose=88, weight=74),
         pregnant=True, notes="Chronic hypertension, 20 weeks pregnant.",
         truth=dict(), why="Pregnancy is an exclusion."),
]

# Guaranteed demo patients (see README "Demo flow").
DEMO_PATIENTS = [
    dict(id="P040", age=54, sex="M", conditions=["Type 2 diabetes mellitus"], medications=["Metformin"],
         labs=dict(hba1c=8.3, egfr=88, bmi=29.5, systolic_bp=128, fasting_glucose=165, weight=86),
         pregnant=False, notes="No history of myocardial infarction or stroke.",
         truth=dict(mi_recent=False), why="DEMO A: meets every diabetes-trial criterion."),
    dict(id="P041", age=61, sex="F", conditions=["Type 2 diabetes mellitus"], medications=["Metformin"],
         labs=dict(hba1c=8.0, egfr=39, bmi=30.1, systolic_bp=130, fasting_glucose=158, weight=79),
         pregnant=False, notes="No prior MI or stroke.",
         truth=dict(mi_recent=False), why="DEMO B: eGFR 39 is below the 45 exclusion cutoff; everything else passes."),
    dict(id="P042", age=62, sex="M",
         conditions=["Type 2 diabetes mellitus", "Hypertension", "Chronic kidney disease stage 3a"],
         medications=["Metformin", "Amlodipine"],
         labs=dict(hba1c=7.9, egfr=52, bmi=31.0, systolic_bp=186, fasting_glucose=150, weight=94),
         pregnant=False, notes="Myocardial infarction 3 years ago, no events since. Home blood pressure readings elevated.",
         truth=dict(mi_recent=False, dialysis=None),
         why="Multi-trial demo: diabetes eligible (MI outside window), hypertension SBP 186 too high, "
             "CKD dialysis status undocumented, breast cancer not applicable."),
    dict(id="P043", age=57, sex="F", conditions=["Type 2 diabetes mellitus"], medications=["Metformin"],
         labs=dict(hba1c=None, egfr=76, bmi=33.0, systolic_bp=132, fasting_glucose=172, weight=88),
         pregnant=False, notes="History of myocardial infarction, date not recorded.",
         truth=dict(mi_recent=None),
         why="DEMO C: HbA1c missing and the MI in the note has no date; two pieces of evidence needed."),
]


# ---------------------------------------------------------------- seeded synthetic cohort
NEGATED_MI = ["No history of myocardial infarction or stroke.", "Denies prior heart attack or stroke.",
              "No MI or stroke.", "No prior myocardial infarction."]
FILLER = ["Routine follow-up visit.", "Adherent to current medication.", "Lives independently.",
          "Reports good exercise tolerance.", "Seen in clinic for review."]


def gen_patient(pid: str, rng: random.Random) -> dict:
    arche = rng.choices(["t2d", "htn", "ckd", "brca", "t2d_htn", "ckd_t2d", "ckd_htn", "other"],
                        weights=[18, 16, 8, 14, 12, 10, 10, 12])[0]
    t2d, htn, ckd, brca = "t2d" in arche, "htn" in arche, "ckd" in arche, arche == "brca"
    sex = "F" if brca else rng.choice(["F", "M"])
    age = rng.randint(16, 86)
    conditions, meds, truth, notes, why = [], [], {}, [], []
    if t2d:
        conditions.append("Type 2 diabetes mellitus")
        meds.append("Metformin")
        if rng.random() < 0.2:
            meds.append("Insulin glargine")
    if htn:
        conditions.append("Hypertension")
        meds.append(rng.choice(["Amlodipine", "Losartan", "Ramipril"]))
        if rng.random() < 0.15:
            meds.append("Spironolactone")
        if rng.random() < 0.12:
            conditions.append("Heart failure")
    if ckd:
        conditions.append("Chronic kidney disease")
        if rng.random() < 0.06:
            conditions.append("Kidney transplant")
    if brca:
        conditions.append("Breast cancer")
        her2 = rng.random() < 0.6
        conditions.append("HER2-positive" if her2 else "HER2-negative")
        meds.append("Trastuzumab" if her2 else "Letrozole")
        if rng.random() < 0.2:
            meds.append("Doxorubicin")
    if arche == "other":
        conditions.append(rng.choice(["Hyperlipidemia", "Asthma", "Osteoarthritis", "Hypothyroidism"]))

    labs = {
        "hba1c": round(rng.uniform(6.0, 11.5), 1) if t2d else round(rng.uniform(4.8, 6.2), 1),
        "egfr": rng.randint(10, 72) if ckd else rng.randint(32, 118),
        "bmi": round(rng.uniform(19, 44), 1),
        "systolic_bp": rng.randint(125, 195) if htn else rng.randint(104, 142),
        "fasting_glucose": rng.randint(110, 300) if t2d else rng.randint(74, 106),
        "weight": round(rng.uniform(42, 122), 1),
    }
    implausible = []
    r = rng.random()
    if r < 0.05:
        labs[rng.choice(["hba1c", "egfr"])] = None
        why.append("missing lab")
    elif r < 0.08:
        bad = rng.choice(["hba1c", "bmi"])
        labs[bad] = 45 if bad == "hba1c" else 150
        implausible.append(bad)
        why.append(f"implausible {bad}")
    if rng.random() < 0.12:
        labs["fasting_glucose"] = {"value": round(labs["fasting_glucose"] / 18.0, 1), "unit": "mmol/L"}
        why.append("glucose in mmol/L")
    if rng.random() < 0.12:
        labs["weight"] = {"value": round(labs["weight"] / 0.45359237), "unit": "lb"}
        why.append("weight in lb")
    if t2d and isinstance(labs["hba1c"], float) and "hba1c" not in implausible and rng.random() < 0.1:
        labs["hba1c"] = {"value": round((labs["hba1c"] - 2.152) / 0.09148), "unit": "mmol/mol"}
        why.append("HbA1c in mmol/mol")
    truth["implausible"] = implausible

    pregnant = False
    if sex == "F" and 18 <= age <= 45:
        roll = rng.random()
        if roll < 0.1:
            pregnant = True
            notes.append(f"Currently {rng.randint(8, 30)} weeks pregnant.")
            why.append("pregnant")
        elif roll < 0.16:
            truth["pregnancy_conflict"] = True
            notes.append(f"Patient reports she is currently {rng.randint(6, 20)} weeks pregnant.")
            why.append("pregnancy contradicts structured field")

    if t2d:
        roll = rng.random()
        if roll < 0.55:
            notes.append(rng.choice(NEGATED_MI))
            truth["mi_recent"] = False
        elif roll < 0.67:
            notes.append(f"Myocardial infarction {rng.randint(1, 5)} months ago.")
            truth["mi_recent"] = True
            why.append("recent MI")
        elif roll < 0.82:
            if rng.random() < 0.5:
                notes.append(f"Myocardial infarction {rng.randint(2, 9)} years ago, stable since.")
            else:
                notes.append(f"Myocardial infarction {rng.randint(8, 30)} months ago, stable since.")
            truth["mi_recent"] = False
            why.append("old MI")
        elif roll < 0.9:
            notes.append("History of myocardial infarction, date not recorded.")
            truth["mi_recent"] = None
            why.append("undated MI")
        else:
            truth["mi_recent"] = None
            why.append("MI status undocumented")
    if ckd:
        roll = rng.random()
        if roll < 0.7:
            notes.append("Not on dialysis.")
            truth["dialysis"] = False
        elif roll < 0.8:
            notes.append("On hemodialysis three times weekly.")
            truth["dialysis"] = True
            why.append("on dialysis")
        else:
            truth["dialysis"] = None
            why.append("dialysis undocumented")
    if brca:
        roll = rng.random()
        if roll < 0.7:
            notes.append("No brain metastases on staging MRI.")
            truth["brain_mets"] = False
        elif roll < 0.85:
            notes.append("MRI shows active brain metastases.")
            truth["brain_mets"] = True
            why.append("brain metastases")
        else:
            truth["brain_mets"] = None
            why.append("brain metastases undocumented")
    notes.append(rng.choice(FILLER))
    return dict(id=pid, age=age, sex=sex, conditions=conditions, medications=meds, labs=labs, pregnant=pregnant,
                notes=" ".join(notes), truth=truth,
                why="Generated: " + (", ".join(why) if why else "no special edge case") + ".")


def build_cohort(n_total: int = 120) -> list[dict]:
    rng = random.Random(SEED)
    fixed = {p["id"]: p for p in PATIENTS + DEMO_PATIENTS}
    out = []
    for i in range(1, n_total + 1):
        pid = f"P{i:03d}"
        out.append(fixed[pid] if pid in fixed else gen_patient(pid, rng))
    return out


# ---------------------------------------------------------------- ground truth (labeler only)
PLAUSIBLE = {"hba1c": (3, 20), "egfr": (1, 200), "bmi": (10, 80), "systolic_bp": (60, 260),
             "fasting_glucose": (20, 1000), "weight": (20, 350)}


def _canon(p, lab):
    v = p["labs"].get(lab)
    if v is None:
        return None
    if isinstance(v, dict):
        if v["unit"] == "mmol/L":
            return v["value"] * 18.0
        if v["unit"] == "lb":
            return v["value"] * 0.45359237
        if v["unit"] == "mmol/mol":
            return 0.09148 * v["value"] + 2.152
        return v["value"]
    return v


def _lab(p, lab):
    """True lab value, or None when missing or implausible (treated as unknown)."""
    if lab in p["truth"].get("implausible", []):
        return None
    return _canon(p, lab)


def _has(p, *names):
    joined = " | ".join(c.lower() for c in p["conditions"])
    return any(n in joined for n in names)


def _takes(p, name):
    return any(name in m.lower() for m in p["medications"])


def _between(v, lo, hi):
    return None if v is None else lo <= v <= hi


def _pregnant(p):
    if p["truth"].get("pregnancy_conflict"):
        return None
    return p["pregnant"] if p["sex"] == "F" else False


def _below(v, cutoff):
    return None if v is None else v < cutoff


def truth_T1(p):
    inc = [_between(p["age"], 18, 75), _has(p, "type 2 diabetes"), _between(_lab(p, "hba1c"), 7.0, 10.5),
           None if _lab(p, "bmi") is None else _lab(p, "bmi") <= 40,
           None if _lab(p, "fasting_glucose") is None else _lab(p, "fasting_glucose") <= 270]
    exc = [_below(_lab(p, "egfr"), 45), _pregnant(p), _takes(p, "insulin"), p["truth"].get("mi_recent")]
    return inc, exc


def truth_T2(p):
    w = _lab(p, "weight")
    inc = [_between(p["age"], 40, 80), _has(p, "hypertension"), _between(_lab(p, "systolic_bp"), 140, 179),
           None if w is None else w >= 50]
    exc = [_below(_lab(p, "egfr"), 30), _has(p, "heart failure"), _takes(p, "spironolactone"), _pregnant(p)]
    return inc, exc


def truth_T3(p):
    inc = [_between(p["age"], 18, 80), _has(p, "chronic kidney disease"), _between(_lab(p, "egfr"), 25, 60),
           _has(p, "type 2 diabetes") or _has(p, "hypertension")]
    exc = [_has(p, "kidney transplant"), p["truth"].get("dialysis", None if not _has(p, "chronic kidney") else None),
           _pregnant(p)]
    return inc, exc


def truth_T4(p):
    inc = [p["sex"] == "F", p["age"] >= 18, _has(p, "breast cancer"), _has(p, "her2-positive")]
    exc = [p["truth"].get("brain_mets"), _pregnant(p), _takes(p, "doxorubicin"), _below(_lab(p, "egfr"), 30)]
    return inc, exc


def decide(inc, exc):
    if any(e is True for e in exc):
        return "NOT_ELIGIBLE"
    if any(i is False for i in inc):
        return "NOT_ELIGIBLE"
    if any(x is None for x in inc + exc):
        return "NEEDS_REVIEW"
    return "ELIGIBLE"


TRUTH = {"T1-DIAB": truth_T1, "T2-HTN": truth_T2, "T3-CKD": truth_T3, "T4-BRCA": truth_T4}


def record(p):
    r = {k: p[k] for k in ("id", "age", "sex", "conditions", "medications", "labs", "pregnant", "notes")}
    r["labs"] = {k: v for k, v in p["labs"].items() if v is not None}
    return r


def main():
    cohort = build_cohort()
    patients = [record(p) for p in cohort]
    labels = []
    for p in cohort:
        for tid, fn in TRUTH.items():
            inc, exc = fn(p)
            decision = decide(inc, exc)
            labels.append({"patient_id": p["id"], "trial_id": tid, "expected": decision, "relevant": _relevant(p, tid),
                           "comment": p["why"] if _relevant(p, tid) else "No qualifying diagnosis or demographic mismatch."})
    (OUT / "trials.json").write_text(json.dumps(TRIALS, indent=2))
    (OUT / "patients.json").write_text(json.dumps(patients, indent=2))
    (OUT / "labels.json").write_text(json.dumps(labels, indent=2))
    counts = {}
    for lab in labels:
        counts[lab["expected"]] = counts.get(lab["expected"], 0) + 1
    print(f"wrote {len(TRIALS)} trials, {len(patients)} patients, {len(labels)} labels {counts}")


def _relevant(p, tid):
    key = {"T1-DIAB": "type 2 diabetes", "T2-HTN": "hypertension", "T3-CKD": "chronic kidney", "T4-BRCA": "breast cancer"}[tid]
    return _has(p, key)


if __name__ == "__main__":
    main()
