import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "").strip()
LLM_MODEL = os.getenv("LLM_MODEL", "").strip()
LLM_API_KEY = os.getenv("LLM_API_KEY", "not-needed").strip()
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "60"))

DATA_DIR = BACKEND_DIR / "data"
DB_PATH = Path(os.getenv("DB_PATH", str(BACKEND_DIR / "screener.db")))

API_KEY = os.getenv("API_KEY", "").strip()
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "120"))
RAG_BACKEND = os.getenv("RAG_BACKEND", "tfidf").lower()
