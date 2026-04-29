from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from review_room.agent import AgentError, CodeAgent
from review_room.models import ReviewSession, ReviewThread
from review_room.store import ReviewStore


def new_thread_id() -> str:
    return f"thr_{uuid4().hex[:12]}"


async def run_review_thread(store: ReviewStore, agent: CodeAgent, review_id: str, thread_id: str) -> None:
    if not _mark_thread_running(store, review_id, thread_id):
        return

    try:
        session = store.get(review_id)
        thread = _find_thread_or_none(session, thread_id)
        if thread is None:
            return
        if session.repo_path is None:
            raise AgentError("Review session has no checked-out repository")
        if thread.prompt is None:
            raise AgentError("Review thread has no prompt")
        result = await agent.run_thread(
            session.repo_path,
            thread.title,
            thread.prompt,
            on_delta=lambda delta: append_thread_delta(store, review_id, thread_id, delta),
        )
    except Exception as exc:
        _mark_thread_failed(store, review_id, thread_id, str(exc))
        return

    _mark_thread_complete(store, review_id, thread_id, result)


async def run_thread_follow_up(
    store: ReviewStore,
    agent: CodeAgent,
    review_id: str,
    thread_id: str,
    prompt: str,
    utterance: str,
) -> None:
    if not _mark_follow_up_running(store, review_id, thread_id, utterance):
        return

    try:
        session = store.get(review_id)
        thread = _find_thread_or_none(session, thread_id)
        if thread is None:
            return
        if session.repo_path is None:
            raise AgentError("Review session has no checked-out repository")
        if thread.codex_thread_id is None:
            raise AgentError("Review thread has no Codex thread id")
        result = await agent.continue_thread(
            session.repo_path,
            thread.codex_thread_id,
            prompt,
            on_delta=lambda delta: append_thread_delta(store, review_id, thread_id, delta),
        )
    except Exception as exc:
        _mark_thread_failed(store, review_id, thread_id, str(exc))
        return

    _mark_follow_up_complete(store, review_id, thread_id, result)


def _find_thread(session: ReviewSession, thread_id: str) -> ReviewThread:
    for thread in session.threads:
        if thread.id == thread_id:
            return thread
    raise KeyError(thread_id)


def _find_thread_or_none(session: ReviewSession, thread_id: str) -> ReviewThread | None:
    for thread in session.threads:
        if thread.id == thread_id:
            return thread
    return None


async def append_thread_delta(store: ReviewStore, review_id: str, thread_id: str, delta: str) -> None:
    def mutate(session: ReviewSession) -> None:
        thread = _find_thread_or_none(session, thread_id)
        if thread is None:
            return
        thread.markdown = f"{thread.markdown or ''}{delta}"
        thread.updated_at = datetime.now(timezone.utc)

    store.update(review_id, mutate)


def _mark_thread_running(store: ReviewStore, review_id: str, thread_id: str) -> bool:
    found = False

    def mutate(session: ReviewSession) -> None:
        nonlocal found
        thread = _find_thread_or_none(session, thread_id)
        if thread is None:
            return
        found = True
        thread.status = "running"
        thread.error = None
        thread.updated_at = datetime.now(timezone.utc)

    store.update(review_id, mutate)
    return found


def _mark_thread_failed(store: ReviewStore, review_id: str, thread_id: str, error: str) -> None:
    def mutate(session: ReviewSession) -> None:
        thread = _find_thread_or_none(session, thread_id)
        if thread is None:
            return
        thread.status = "failed"
        thread.error = error
        thread.updated_at = datetime.now(timezone.utc)

    store.update(review_id, mutate)


def _mark_thread_complete(store: ReviewStore, review_id: str, thread_id: str, result) -> None:
    def mutate(session: ReviewSession) -> None:
        thread = _find_thread_or_none(session, thread_id)
        if thread is None:
            return
        thread.status = "complete"
        thread.codex_thread_id = result.codex_thread_id
        thread.markdown = result.markdown
        thread.updated_at = datetime.now(timezone.utc)

    store.update(review_id, mutate)


def _mark_follow_up_running(store: ReviewStore, review_id: str, thread_id: str, utterance: str) -> bool:
    found = False

    def mutate(session: ReviewSession) -> None:
        nonlocal found
        thread = _find_thread_or_none(session, thread_id)
        if thread is None:
            return
        found = True
        thread.status = "running"
        thread.markdown = _append_follow_up_header(thread.markdown, utterance)
        thread.updated_at = datetime.now(timezone.utc)

    store.update(review_id, mutate)
    return found


def _mark_follow_up_complete(store: ReviewStore, review_id: str, thread_id: str, result) -> None:
    def mutate(session: ReviewSession) -> None:
        thread = _find_thread_or_none(session, thread_id)
        if thread is None:
            return
        thread.status = "complete"
        thread.codex_thread_id = result.codex_thread_id
        thread.updated_at = datetime.now(timezone.utc)

    store.update(review_id, mutate)


def _append_follow_up_header(markdown: str | None, utterance: str) -> str:
    current = (markdown or "").rstrip()
    separator = "\n\n---\n\n" if current else ""
    return f"{current}{separator}### Follow-up\n\n**Question:** {utterance}\n\n"
