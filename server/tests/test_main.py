from pathlib import Path

import httpx
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


class FakeCheckoutServiceAtPath:
    def __init__(self, repo_path: Path) -> None:
        self.repo_path = repo_path

    async def checkout_pull_request(self, parsed: ParsedPullRequestUrl) -> Path:
        return self.repo_path


class FakeAgent:
    async def run_thread(self, repo_path: str, title: str, prompt: str, on_delta=None) -> AgentResult:
        assert repo_path == "/tmp/review-room/repos/acme/review-room/worktrees/pr-247"
        assert title == "Explain this function"
        assert "User request:" in prompt
        if on_delta is not None:
            await on_delta("This function validates ")
            await on_delta("the selected input.")
        return AgentResult(codex_thread_id="codex-thread-1", markdown="This function validates the selected input.")

    async def continue_thread(self, repo_path: str, codex_thread_id: str, prompt: str, on_delta=None) -> AgentResult:
        assert repo_path == "/tmp/review-room/repos/acme/review-room/worktrees/pr-247"
        assert codex_thread_id == "codex-thread-1"
        assert "Follow-up question from the reviewer:" in prompt
        if on_delta is not None:
            await on_delta("The follow-up answer cites ")
            await on_delta("the same issue.")
        return AgentResult(codex_thread_id=codex_thread_id, markdown="The follow-up answer cites the same issue.")


class FakeAsyncClient:
    requests: list[dict[str, object]] = []

    def __init__(self, timeout: float):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        return None

    async def post(self, url: str, content: bytes, headers: dict[str, str]) -> httpx.Response:
        self.requests.append({"url": url, "content": content, "headers": headers, "timeout": self.timeout})
        return httpx.Response(201, content=b"answer-sdp", headers={"content-type": "application/sdp"})


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


def test_get_file_content_serves_line_range_with_context(tmp_path: Path, monkeypatch) -> None:
    repo_path = tmp_path / "repo"
    source_path = repo_path / "src/review/diagram.ts"
    source_path.parent.mkdir(parents=True)
    source_path.write_text(
        "\n".join(
            [
                "line 1",
                "line 2",
                "line 3",
                "line 4",
                "line 5",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutServiceAtPath(repo_path))
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)
    create_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})
    review_id = create_response.json()["review_id"]

    content_response = client.get(
        f"/api/reviews/{review_id}/files/src/review/diagram.ts/content",
        params={"start_line": 3, "end_line": 4, "context": 1},
    )

    assert content_response.status_code == 200
    assert content_response.json() == {
        "file_path": "src/review/diagram.ts",
        "start_line": 2,
        "end_line": 5,
        "total_lines": 5,
        "content": "line 2\nline 3\nline 4\nline 5",
    }


def test_get_file_content_rejects_files_outside_changed_file_list(tmp_path: Path, monkeypatch) -> None:
    repo_path = tmp_path / "repo"
    unlisted_path = repo_path / "src/review/other.ts"
    unlisted_path.parent.mkdir(parents=True)
    unlisted_path.write_text("unlisted\n", encoding="utf-8")
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutServiceAtPath(repo_path))
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)
    create_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})
    review_id = create_response.json()["review_id"]

    content_response = client.get(f"/api/reviews/{review_id}/files/src/review/other.ts/content")

    assert content_response.status_code == 404
    assert content_response.json() == {"detail": "Changed file not found"}


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


def test_create_follow_up_continues_existing_codex_thread(tmp_path: Path, monkeypatch) -> None:
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
            "context": None,
        },
    )
    thread_id = thread_response.json()["thread_id"]

    follow_up_response = client.post(
        f"/api/reviews/{review_id}/threads/{thread_id}/followups",
        json={"source": "voice", "utterance": "What test would catch it?"},
    )

    assert follow_up_response.status_code == 200
    assert follow_up_response.json() == {"thread_id": thread_id, "status": "queued"}
    session_response = client.get(f"/api/reviews/{review_id}")
    thread = next(item for item in session_response.json()["threads"] if item["id"] == thread_id)
    assert thread["status"] == "complete"
    assert thread["codex_thread_id"] == "codex-thread-1"
    assert "This function validates the selected input." in thread["markdown"]
    assert "### Follow-up" in thread["markdown"]
    assert "**Question:** What test would catch it?" in thread["markdown"]
    assert "The follow-up answer cites the same issue." in thread["markdown"]


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


def test_realtime_session_requires_openai_api_key(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(main, "HOME_ENV_PATH", Path("/tmp/review-room-missing-env"))
    client = TestClient(main.app)

    response = client.post("/api/realtime/session", content=b"client-sdp", headers={"content-type": "application/sdp"})

    assert response.status_code == 500
    assert response.json() == {"detail": "OPENAI_API_KEY is required for voice support"}


def test_realtime_session_reads_openai_api_key_from_home_env(tmp_path: Path, monkeypatch) -> None:
    env_path = tmp_path / ".env"
    env_path.write_text('export OPENAI_API_KEY="home-env-api-key"\n', encoding="utf-8")
    FakeAsyncClient.requests = []
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(main, "HOME_ENV_PATH", env_path)
    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)
    client = TestClient(main.app)

    response = client.post("/api/realtime/session", content=b"client-sdp", headers={"content-type": "application/sdp"})

    assert response.status_code == 201
    assert FakeAsyncClient.requests[0]["headers"] == {
        "Authorization": "Bearer home-env-api-key",
        "Content-Type": "application/sdp",
    }


def test_realtime_session_proxies_request_to_openai(monkeypatch) -> None:
    FakeAsyncClient.requests = []
    monkeypatch.setenv("OPENAI_API_KEY", "test-api-key")
    monkeypatch.setattr(main, "HOME_ENV_PATH", Path("/tmp/review-room-missing-env"))
    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)
    client = TestClient(main.app)

    response = client.post("/api/realtime/session", content=b"client-sdp", headers={"content-type": "application/sdp"})

    assert response.status_code == 201
    assert response.content == b"answer-sdp"
    assert FakeAsyncClient.requests == [
        {
            "url": "https://api.openai.com/v1/realtime/calls",
            "content": b"client-sdp",
            "headers": {"Authorization": "Bearer test-api-key", "Content-Type": "application/sdp"},
            "timeout": 30.0,
        }
    ]
