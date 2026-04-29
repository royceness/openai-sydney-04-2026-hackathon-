from pathlib import Path

from fastapi.testclient import TestClient

from review_room import main
from review_room.github import ParsedPullRequestUrl
from review_room.models import ChangedFile, PullRequestInfo
from review_room.store import ReviewStore


class FakeGitHubClient:
    async def fetch_pull_request(self, parsed: ParsedPullRequestUrl):
        return (
            PullRequestInfo(
                owner=parsed.owner,
                repo=parsed.repo,
                number=parsed.number,
                title="Improve diagram layout",
                url=f"https://github.com/{parsed.owner}/{parsed.repo}/pull/{parsed.number}",
                author="sarah-lee",
                body="Adds smarter diagram layout.",
                base_ref="main",
                head_ref="feature/diagram",
                base_sha="abc",
                head_sha="def",
            ),
            [
                ChangedFile(
                    path="src/review/diagram.ts",
                    status="modified",
                    additions=48,
                    deletions=17,
                    patch="@@ -1 +1 @@\n-old\n+new",
                )
            ],
        )


def test_bootstrap_returns_configured_pr_url(monkeypatch) -> None:
    monkeypatch.setenv("REVIEW_ROOM_PR_URL", "https://github.com/acme/review-room/pull/247")
    client = TestClient(main.app)

    response = client.get("/api/bootstrap")

    assert response.status_code == 200
    assert response.json() == {"pr_url": "https://github.com/acme/review-room/pull/247"}


def test_create_review_persists_session_and_serves_file_diff(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    client = TestClient(main.app)

    create_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})

    assert create_response.status_code == 200
    created = create_response.json()
    assert created["review_id"] == "rev_acme_review_room_247"
    assert created["files"][0]["path"] == "src/review/diagram.ts"

    diff_response = client.get("/api/reviews/rev_acme_review_room_247/files/src/review/diagram.ts/diff")

    assert diff_response.status_code == 200
    assert diff_response.json() == {"file_path": "src/review/diagram.ts", "diff": "@@ -1 +1 @@\n-old\n+new"}

