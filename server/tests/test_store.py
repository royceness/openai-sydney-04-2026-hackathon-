from review_room.models import ChangedFile, PullRequestInfo, ReviewSession
from review_room.store import ReviewStore, stable_review_id


def make_session() -> ReviewSession:
    return ReviewSession(
        id="rev_acme_review_room_247",
        pr=PullRequestInfo(
            owner="acme",
            repo="review-room",
            number=247,
            title="Improve diagram layout",
            url="https://github.com/acme/review-room/pull/247",
            author="sarah-lee",
            body="Adds smarter diagram layout.",
            base_ref="main",
            head_ref="feature/diagram",
            base_sha="abc",
            head_sha="def",
        ),
        files=[
            ChangedFile(
                path="src/review/diagram.ts",
                status="modified",
                additions=48,
                deletions=17,
                patch="@@ -1 +1 @@\n-old\n+new",
            )
        ],
    )


def test_stable_review_id_is_readable_and_path_safe() -> None:
    assert stable_review_id("acme-inc", "review.room", 247) == "rev_acme_inc_review_room_247"


def test_store_round_trips_session(tmp_path) -> None:
    store = ReviewStore(tmp_path / ".review-room")
    saved = store.save(make_session())

    loaded = store.get(saved.id)

    assert loaded.id == "rev_acme_review_room_247"
    assert loaded.pr.title == "Improve diagram layout"
    assert loaded.files[0].path == "src/review/diagram.ts"
