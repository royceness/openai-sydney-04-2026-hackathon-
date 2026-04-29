from pathlib import Path

import httpx
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


class FakeCheckoutService:
    async def checkout_pull_request(self, parsed: ParsedPullRequestUrl) -> Path:
        return Path("/tmp/review-room/repos") / parsed.owner / parsed.repo / "worktrees" / f"pr-{parsed.number}"


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
