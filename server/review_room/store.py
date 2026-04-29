from __future__ import annotations

import json
import os
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from review_room.models import ReviewSession


def default_workspace_dir() -> Path:
    configured = os.environ.get("REVIEW_ROOM_WORKSPACE_DIR")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / ".review-room"


def stable_review_id(owner: str, repo: str, number: int) -> str:
    safe_owner = owner.replace("-", "_").replace(".", "_")
    safe_repo = repo.replace("-", "_").replace(".", "_")
    return f"rev_{safe_owner}_{safe_repo}_{number}"


class ReviewStore:
    def __init__(self, workspace_dir: Path | None = None) -> None:
        self.workspace_dir = workspace_dir or default_workspace_dir()
        self.sessions_dir = self.workspace_dir / "sessions"
        self._lock = RLock()

    def save(self, session: ReviewSession) -> ReviewSession:
        with self._lock:
            self.sessions_dir.mkdir(parents=True, exist_ok=True)
            session.updated_at = datetime.now(timezone.utc)
            path = self._session_path(session.id)
            path.write_text(session.model_dump_json(indent=2), encoding="utf-8")
            return session

    def get(self, review_id: str) -> ReviewSession:
        with self._lock:
            path = self._session_path(review_id)
            if not path.exists():
                raise KeyError(review_id)
            return ReviewSession.model_validate(json.loads(path.read_text(encoding="utf-8")))

    def update(self, review_id: str, mutate: Callable[[ReviewSession], None]) -> ReviewSession:
        with self._lock:
            session = self.get(review_id)
            mutate(session)
            return self.save(session)

    def _session_path(self, review_id: str) -> Path:
        if "/" in review_id or "\\" in review_id or review_id.startswith("."):
            raise ValueError("Invalid review ID")
        return self.sessions_dir / f"{review_id}.json"
