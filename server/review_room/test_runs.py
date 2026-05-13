from __future__ import annotations

import asyncio
import shlex
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from review_room.models import ReviewSession, TestRun
from review_room.store import ReviewStore


class TestRunError(RuntimeError):
    pass


def new_test_run_id() -> str:
    return f"test_{uuid4().hex[:12]}"


def configured_test_command(value: str | None) -> str:
    if value is None or not value.strip():
        raise TestRunError("REVIEW_ROOM_TEST_COMMAND is required to run tests")
    return value.strip()


def create_queued_test_run(session: ReviewSession, command: str) -> TestRun:
    test_run = TestRun(id=new_test_run_id(), status="queued", command=command)
    session.test_runs.insert(0, test_run)
    return test_run


async def run_test_run(store: ReviewStore, review_id: str, test_run_id: str) -> None:
    session = store.get(review_id)
    test_run = _find_test_run_or_none(session, test_run_id)
    if test_run is None:
        return
    test_run.status = "running"
    test_run.updated_at = datetime.now(timezone.utc)
    store.save(session)

    try:
        if session.repo_path is None:
            raise TestRunError("Review session has no checked-out repository")
        argv = shlex.split(test_run.command)
        if not argv:
            raise TestRunError("REVIEW_ROOM_TEST_COMMAND is empty")
        proc = await asyncio.create_subprocess_exec(
            *argv,
            cwd=Path(session.repo_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        session = store.get(review_id)
        test_run = _find_test_run_or_none(session, test_run_id)
        if test_run is None:
            return
        test_run.exit_code = proc.returncode
        test_run.stdout = stdout.decode("utf-8", errors="replace")
        test_run.stderr = stderr.decode("utf-8", errors="replace")
        test_run.status = "passed" if proc.returncode == 0 else "failed"
        test_run.updated_at = datetime.now(timezone.utc)
        store.save(session)
    except Exception as exc:
        session = store.get(review_id)
        test_run = _find_test_run_or_none(session, test_run_id)
        if test_run is None:
            return
        test_run.status = "failed"
        test_run.error = str(exc)
        test_run.updated_at = datetime.now(timezone.utc)
        store.save(session)


def _find_test_run_or_none(session: ReviewSession, test_run_id: str) -> TestRun | None:
    return next((test_run for test_run in session.test_runs if test_run.id == test_run_id), None)
