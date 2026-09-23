"""Retrieval over protocol text with section citations.

Default backend is TF-IDF (scikit-learn, no downloads). Set RAG_BACKEND=chroma to use ChromaDB
with its default embedding model when it is installed.
"""
from __future__ import annotations

import re
from functools import lru_cache

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from . import config


def chunk_protocol(trial_id: str, text: str) -> list[dict]:
    chunks, section = [], "Protocol"
    for line in (text or "").splitlines():
        s = line.strip()
        if not s:
            continue
        low = s.lower().rstrip(":")
        if low.startswith("inclusion"):
            section = "Inclusion"
            continue
        if low.startswith("exclusion"):
            section = "Exclusion"
            continue
        m = re.match(r"^(\d+)[.)]\s*(.*)", s)
        label = f"{section} {m.group(1)}" if m else section
        chunks.append({"trial_id": trial_id, "section": label, "text": m.group(2) if m else s})
    return chunks


class TfidfIndex:
    def __init__(self, chunks: list[dict]):
        self.chunks = chunks
        self.vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)
        self.mat = self.vec.fit_transform([c["text"] for c in chunks]) if chunks else None

    def search(self, query: str, k: int = 1) -> list[dict]:
        if self.mat is None:
            return []
        sims = cosine_similarity(self.vec.transform([query]), self.mat)[0]
        order = sims.argsort()[::-1][:k]
        return [{**self.chunks[i], "score": round(float(sims[i]), 3)} for i in order]


class ChromaIndex:
    def __init__(self, trial_id: str, chunks: list[dict]):
        import chromadb

        client = chromadb.PersistentClient(path=str(config.BACKEND_DIR / "chroma"))
        self.col = client.get_or_create_collection(f"protocol_{re.sub(r'[^a-zA-Z0-9]', '_', trial_id)}")
        if chunks and self.col.count() != len(chunks):
            self.col.upsert(ids=[f"{trial_id}-{i}" for i in range(len(chunks))],
                            documents=[c["text"] for c in chunks],
                            metadatas=[{"section": c["section"], "trial_id": trial_id} for c in chunks])

    def search(self, query: str, k: int = 1) -> list[dict]:
        res = self.col.query(query_texts=[query], n_results=k)
        return [{"trial_id": m["trial_id"], "section": m["section"], "text": d, "score": round(1 - dist, 3)}
                for d, m, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0])]


@lru_cache(maxsize=64)
def _index(trial_id: str, text: str):
    chunks = chunk_protocol(trial_id, text)
    if config.RAG_BACKEND == "chroma":
        try:
            return ChromaIndex(trial_id, chunks)
        except Exception:
            pass
    return TfidfIndex(chunks)


def retrieve(trial_id: str, criteria_text: str, query: str, k: int = 1) -> list[dict]:
    return _index(trial_id, criteria_text).search(query, k)


def cite(trial_id: str, criteria_text: str, source_text: str) -> str:
    hits = retrieve(trial_id, criteria_text, source_text, 1)
    return hits[0]["section"] if hits else "Protocol"
