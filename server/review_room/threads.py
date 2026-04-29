from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from review_room.agent import AgentError, CodeAgent
from review_room.models import ReviewSession, ReviewThread
from review_room.store import ReviewStore


def new_thread_id() -> str:
    return f"thr_{uuid4().hex[:12]}"


async def run_review_thread(store: ReviewStore, agent: CodeAgent, review_id: str, thread_id: str) -> None:
    session = store.get(review_id)
    thread = _find_thread(session, thread_id)
    thread.status = "running"
    thread.updated_at = datetime.now(timezone.utc)
    store.save(session)

    try:
        if session.repo_path is None:
            raise AgentError("Review session has no checked-out repository")
        if thread.prompt is None:
            raise AgentError("Review thread has no prompt")
        result = await agent.run_thread(session.repo_path, thread.title, thread.prompt)
    except Exception as exc:
        session = store.get(review_id)
        thread = _find_thread(session, thread_id)
        thread.status = "failed"
        thread.error = str(exc)
        thread.updated_at = datetime.now(timezone.utc)
        store.save(session)
        return

    session = store.get(review_id)
    thread = _find_thread(session, thread_id)
    thread.status = "complete"
    thread.codex_thread_id = result.codex_thread_id
    thread.markdown = result.markdown
    thread.updated_at = datetime.now(timezone.utc)
    store.save(session)


def _find_thread(session: ReviewSession, thread_id: str) -> ReviewThread:
    for thread in session.threads:
        if thread.id == thread_id:
            return thread
    raise KeyError(thread_id)
