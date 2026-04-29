from pathlib import Path

from fastapi.testclient import TestClient

from review_room import main
from review_room.agent import AgentResult
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


class FakeCheckoutService:
    async def checkout_pull_request(self, parsed: ParsedPullRequestUrl) -> Path:
        return Path("/tmp/review-room/repos") / parsed.owner / parsed.repo / "worktrees" / f"pr-{parsed.number}"


class FakeAgent:
    async def run_thread(self, repo_path: str, title: str, prompt: str, on_delta=None) -> AgentResult:
        assert repo_path == "/tmp/review-room/repos/acme/review-room/worktrees/pr-247"
        assert title == "Explain this function"
        assert "User request:" in prompt
        if on_delta is not None:
            await on_delta("This function validates ")
            await on_delta("the selected input.")
        return AgentResult(codex_thread_id="codex-thread-1", markdown="This function validates the selected input.")


def test_bootstrap_returns_configured_pr_url(monkeypatch) -> None:
    monkeypatch.setenv("REVIEW_ROOM_PR_URL", "https://github.com/acme/review-room/pull/247")
    client = TestClient(main.app)

    response = client.get("/api/bootstrap")

    assert response.status_code == 200
    assert response.json() == {"pr_url": "https://github.com/acme/review-room/pull/247"}


def test_create_review_persists_session_and_serves_file_diff(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)

    create_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})

    assert create_response.status_code == 200
    created = create_response.json()
    assert created["review_id"] == "rev_acme_review_room_247"
    assert created["files"][0]["path"] == "src/review/diagram.ts"

    session_response = client.get("/api/reviews/rev_acme_review_room_247")
    assert session_response.status_code == 200
    assert session_response.json()["repo_path"] == "/tmp/review-room/repos/acme/review-room/worktrees/pr-247"

    diff_response = client.get("/api/reviews/rev_acme_review_room_247/files/src/review/diagram.ts/diff")

    assert diff_response.status_code == 200
    assert diff_response.json() == {"file_path": "src/review/diagram.ts", "diff": "@@ -1 +1 @@\n-old\n+new"}


def test_create_thread_runs_agent_and_persists_markdown(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)
    create_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})
    review_id = create_response.json()["review_id"]

    thread_response = client.post(
        f"/api/reviews/{review_id}/threads",
        json={
            "source": "manual",
            "title": "Explain this function",
            "utterance": "Explain this function",
            "context": {
                "filePath": "src/review/diagram.ts",
                "side": "new",
                "startLine": 10,
                "endLine": 12,
                "selectedText": "function buildDiagram() {}",
            },
        },
    )

    assert thread_response.status_code == 200
    thread_id = thread_response.json()["thread_id"]
    session_response = client.get(f"/api/reviews/{review_id}")
    thread = next(item for item in session_response.json()["threads"] if item["id"] == thread_id)
    assert thread["status"] == "complete"
    assert thread["codex_thread_id"] == "codex-thread-1"
    assert thread["markdown"] == "This function validates the selected input."


def test_create_review_preserves_existing_threads(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)
    create_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})
    review_id = create_response.json()["review_id"]
    client.post(
        f"/api/reviews/{review_id}/threads",
        json={
            "source": "manual",
            "title": "Explain this function",
            "utterance": "Explain this function",
            "context": None,
        },
    )

    reload_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})

    assert reload_response.status_code == 200
    session_response = client.get(f"/api/reviews/{review_id}")
    assert len(session_response.json()["threads"]) == 1
