from review_room.models import PullRequestInfo, ReviewSession
from review_room.store import ReviewStore
from review_room.threads import append_thread_delta, run_review_thread


class NeverCalledAgent:
    async def run_thread(self, repo_path: str, title: str, prompt: str, on_delta=None):
        raise AssertionError("agent should not be called for a missing thread")


def make_empty_session() -> ReviewSession:
    return ReviewSession(
        id="rev_acme_review_room_247",
        pr=PullRequestInfo(
            owner="acme",
            repo="review-room",
            number=247,
            title="Improve diagram layout",
            url="https://github.com/acme/review-room/pull/247",
            base_ref="main",
            head_ref="feature/diagram",
            base_sha="abc",
            head_sha="def",
        ),
        files=[],
        repo_path="/tmp/repo",
    )


async def test_run_review_thread_ignores_missing_thread(tmp_path) -> None:
    store = ReviewStore(tmp_path / ".review-room")
    store.save(make_empty_session())

    await run_review_thread(store, NeverCalledAgent(), "rev_acme_review_room_247", "thr_missing")

    assert store.get("rev_acme_review_room_247").threads == []


async def test_append_thread_delta_ignores_missing_thread(tmp_path) -> None:
    store = ReviewStore(tmp_path / ".review-room")
    store.save(make_empty_session())

    await append_thread_delta(store, "rev_acme_review_room_247", "thr_missing", "delta")

    assert store.get("rev_acme_review_room_247").threads == []
