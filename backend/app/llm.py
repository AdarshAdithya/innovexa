"""Single place that knows how to reach the model. Swap this file for a different provider."""
import json
import re
from functools import lru_cache
from typing import Optional

from . import config


def llm_available() -> bool:
    return bool(config.LLM_BASE_URL and config.LLM_MODEL)


@lru_cache(maxsize=1)
def get_llm():
    if not llm_available():
        return None
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        base_url=config.LLM_BASE_URL,
        model=config.LLM_MODEL,
        api_key=config.LLM_API_KEY or "not-needed",
        temperature=0,
        timeout=config.LLM_TIMEOUT,
        max_retries=1,
    )


def complete(system: str, user: str) -> Optional[str]:
    llm = get_llm()
    if llm is None:
        return None
    from langchain_core.messages import HumanMessage, SystemMessage

    try:
        return llm.invoke([SystemMessage(content=system), HumanMessage(content=user)]).content
    except Exception:
        return None


def extract_json(text: str):
    if text is None:
        raise ValueError("no LLM output")
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fenced:
        text = fenced.group(1)
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0], default=-1)
    if start < 0:
        raise ValueError("no JSON found in LLM output")
    return json.loads(text[start:])
