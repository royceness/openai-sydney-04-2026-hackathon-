from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from review_room.models import ReviewSession, ReviewThread
from review_room.prompting import build_review_prompt
from review_room.threads import new_thread_id


@dataclass(frozen=True)
class InitThreadPrompt:
    key: str
    title: str
    utterance: str


DEFAULT_INIT_THREAD_PROMPTS: tuple[InitThreadPrompt, ...] = (
    InitThreadPrompt(
        key="pr-summary",
        title="PR summary",
        utterance=(
            "Summarize this pull request for a reviewer. Explain the user-visible goal, the main changed "
            "files, and the risk areas. Keep it structured and concise."
        ),
    ),
    InitThreadPrompt(
        key="tests-audit",
        title="Tests audit",
        utterance=(
            "Audit the test coverage for this pull request. Identify existing tests that cover the change, "
            "missing tests, and the smallest useful tests to add. For each testing gap, include the changed "
            "PR file and line or line range that best represents the untested behavior introduced by this PR, "
            "so a reviewer can attach a PR comment to that location."
        ),
    ),
    InitThreadPrompt(
        key="architecture-coherence-report",
        title="Architecture coherence report",
        utterance=(
            "Evaluate whether this pull request fits the repository's existing architecture and patterns. "
            "Call out mismatches, unnecessary abstractions, or integration risks."
        ),
    ),
    InitThreadPrompt(
        key="bug-finder",
        title="Bug finder",
        utterance=(
            "Review this pull request specifically for likely bugs, regressions, edge cases, state handling "
            "errors, and failure modes. Prioritize actionable findings."
        ),
    ),
    InitThreadPrompt(
        key="doc-validator",
        title="Doc validator",
        utterance=(
            "Check whether user-facing docs, README content, comments, or developer documentation need "
            "updates for this pull request. Identify stale or missing documentation."
        ),
    ),
)

PROMPTS_BY_KEY = {prompt.key: prompt for prompt in DEFAULT_INIT_THREAD_PROMPTS}


def configured_init_thread_prompts(raw_value: str | None) -> list[InitThreadPrompt]:
    if raw_value is None:
        return list(DEFAULT_INIT_THREAD_PROMPTS)
    if raw_value.strip() == "":
        return []

    keys = [item.strip() for item in raw_value.split(",") if item.strip()]
    unknown_keys = [key for key in keys if key not in PROMPTS_BY_KEY]
    if unknown_keys:
        unknown_list = ", ".join(unknown_keys)
        known_list = ", ".join(PROMPTS_BY_KEY)
        raise ValueError(f"Unknown REVIEW_ROOM_INIT_THREADS value(s): {unknown_list}. Known values: {known_list}")

    return [PROMPTS_BY_KEY[key] for key in keys]


def ensure_init_threads(session: ReviewSession, prompts: Sequence[InitThreadPrompt]) -> list[ReviewThread]:
    existing_titles = {thread.title for thread in session.threads if thread.source == "init"}
    created_threads: list[ReviewThread] = []
    for prompt in prompts:
        if prompt.title in existing_titles:
            continue
        thread = ReviewThread(
            id=new_thread_id(),
            source="init",
            title=prompt.title,
            status="queued",
            prompt=build_review_prompt(session, prompt.utterance, None),
            utterance=prompt.utterance,
            context=None,
        )
        session.threads.append(thread)
        created_threads.append(thread)
        existing_titles.add(prompt.title)
    return created_threads
