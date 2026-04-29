import asyncio
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from review_room import main
from review_room.agent import AgentResult
from review_room.github import ParsedPullRequestUrl
from review_room.init_threads import DEFAULT_INIT_THREAD_PROMPTS
from review_room.models import ChangedFile, PublishedComment, PublishCommentRequest, PullRequestInfo, ReviewSubmission
from review_room.store import ReviewStore


class FakeGitHubClient:
    published_comments: list[PublishCommentRequest] = []
    submitted_reviews: list[dict[str, object]] = []

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

    async def create_pull_request_review_comment(
        self,
        pr: PullRequestInfo,
        comment: PublishCommentRequest,
    ) -> PublishedComment:
        self.published_comments.append(comment)
        return PublishedComment(
            id=comment.id,
            body=comment.body,
            context=comment.context,
            github_comment_url=f"https://github.com/{pr.owner}/{pr.repo}/pull/{pr.number}#discussion_r1",
        )

    async def create_pull_request_review(
        self,
        pr: PullRequestInfo,
        comments: list[PublishCommentRequest],
        body: str,
        event: str,
    ) -> tuple[list[PublishedComment], ReviewSubmission]:
        self.submitted_reviews.append({"comments": comments, "body": body, "event": event})
        review_url = f"https://github.com/{pr.owner}/{pr.repo}/pull/{pr.number}#pullrequestreview-1"
        return (
            [
                PublishedComment(
                    id=comment.id,
                    body=comment.body,
                    context=comment.context,
                    github_comment_url=review_url,
                )
                for comment in comments
            ],
            ReviewSubmission(body=body.strip(), event=event, github_review_url=review_url),
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
        assert "User request:" in prompt
        if on_delta is not None:
            await on_delta("This function validates ")
            await on_delta("the selected input.")
        markdown = "This function validates the selected input."
        if title != "Explain this function":
            markdown = f"{title}: {markdown}"
        return AgentResult(codex_thread_id="codex-thread-1", markdown=markdown)

    async def continue_thread(self, repo_path: str, codex_thread_id: str, prompt: str, on_delta=None) -> AgentResult:
        assert repo_path == "/tmp/review-room/repos/acme/review-room/worktrees/pr-247"
        assert codex_thread_id == "codex-thread-1"
        assert "Follow-up question from the reviewer:" in prompt
        if on_delta is not None:
            await on_delta("The follow-up answer cites ")
            await on_delta("the same issue.")
        return AgentResult(codex_thread_id=codex_thread_id, markdown="The follow-up answer cites the same issue.")


class ConcurrentFakeAgent:
    def __init__(self) -> None:
        self.running = 0
        self.max_running = 0

    async def run_thread(self, repo_path: str, title: str, prompt: str, on_delta=None) -> AgentResult:
        self.running += 1
        self.max_running = max(self.max_running, self.running)
        await asyncio.sleep(0.01)
        if on_delta is not None:
            await on_delta(f"{title} response")
        self.running -= 1
        return AgentResult(codex_thread_id=f"codex-{title}", markdown=f"{title} response")

    async def continue_thread(self, repo_path: str, codex_thread_id: str, prompt: str, on_delta=None) -> AgentResult:
        return AgentResult(codex_thread_id=codex_thread_id, markdown="follow-up")


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


def test_create_review_starts_default_init_threads(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("REVIEW_ROOM_INIT_THREADS", raising=False)
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)

    response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})

    assert response.status_code == 200
    init_threads = [thread for thread in response.json()["threads"] if thread["source"] == "init"]
    assert [thread["title"] for thread in init_threads] == [prompt.title for prompt in DEFAULT_INIT_THREAD_PROMPTS]
    session_threads = client.get("/api/reviews/rev_acme_review_room_247").json()["threads"]
    completed_init_threads = [thread for thread in session_threads if thread["source"] == "init"]
    assert [thread["status"] for thread in completed_init_threads] == ["complete"] * len(DEFAULT_INIT_THREAD_PROMPTS)
    assert all(thread["markdown"] for thread in completed_init_threads)


def test_create_review_runs_default_init_threads_concurrently(tmp_path: Path, monkeypatch) -> None:
    concurrent_agent = ConcurrentFakeAgent()
    monkeypatch.delenv("REVIEW_ROOM_INIT_THREADS", raising=False)
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", concurrent_agent)
    client = TestClient(main.app)

    response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})

    assert response.status_code == 200
    assert concurrent_agent.max_running == len(DEFAULT_INIT_THREAD_PROMPTS)
    session_threads = client.get("/api/reviews/rev_acme_review_room_247").json()["threads"]
    completed_init_threads = [thread for thread in session_threads if thread["source"] == "init"]
    assert [thread["status"] for thread in completed_init_threads] == ["complete"] * len(DEFAULT_INIT_THREAD_PROMPTS)
    assert [thread["markdown"] for thread in completed_init_threads] == [
        f"{prompt.title} response" for prompt in DEFAULT_INIT_THREAD_PROMPTS
    ]


def test_create_review_does_not_duplicate_init_threads_on_reload(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("REVIEW_ROOM_INIT_THREADS", raising=False)
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)

    first_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})
    second_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    session_threads = client.get("/api/reviews/rev_acme_review_room_247").json()["threads"]
    assert [thread["title"] for thread in session_threads if thread["source"] == "init"] == [
        prompt.title for prompt in DEFAULT_INIT_THREAD_PROMPTS
    ]


@pytest.mark.parametrize("stale_status", ["failed", "queued", "running"])
def test_create_review_retries_non_complete_init_threads_on_reload(tmp_path: Path, monkeypatch, stale_status: str) -> None:
    monkeypatch.delenv("REVIEW_ROOM_INIT_THREADS", raising=False)
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)

    create_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})
    review_id = create_response.json()["review_id"]
    session = main.store.get(review_id)
    stale_thread = next(thread for thread in session.threads if thread.source == "init")
    stale_thread.status = stale_status
    stale_thread.error = "Separator is not found, and chunk exceed the limit" if stale_status == "failed" else None
    stale_thread.markdown = None
    stale_thread.codex_thread_id = None
    main.store.save(session)

    reload_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})

    assert reload_response.status_code == 200
    session_threads = client.get(f"/api/reviews/{review_id}").json()["threads"]
    retried_thread = next(thread for thread in session_threads if thread["id"] == stale_thread.id)
    assert retried_thread["status"] == "complete"
    assert retried_thread["error"] is None
    assert retried_thread["markdown"]


def test_create_review_uses_configured_init_threads(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("REVIEW_ROOM_INIT_THREADS", "pr-summary,bug-finder")
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)

    response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})

    assert response.status_code == 200
    init_threads = [thread for thread in response.json()["threads"] if thread["source"] == "init"]
    assert [thread["title"] for thread in init_threads] == ["PR summary", "Bug finder"]


def test_create_review_can_disable_init_threads(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("REVIEW_ROOM_INIT_THREADS", "")
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)

    response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})

    assert response.status_code == 200
    assert [thread for thread in response.json()["threads"] if thread["source"] == "init"] == []


def test_create_review_rejects_unknown_init_thread_config(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("REVIEW_ROOM_INIT_THREADS", "pr-summary,unknown-audit")
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)

    response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})

    assert response.status_code == 500
    assert "unknown-audit" in response.json()["detail"]


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


def test_create_update_and_delete_comment_persists_session_comments(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)
    create_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})
    review_id = create_response.json()["review_id"]

    comment_response = client.post(
        f"/api/reviews/{review_id}/comments",
        json={
            "body": "Please add a regression test.",
            "context": {
                "filePath": "src/review/diagram.ts",
                "side": "new",
                "startLine": 1,
                "endLine": 1,
                "selectedText": "new",
            },
        },
    )

    assert comment_response.status_code == 200
    comment = comment_response.json()
    assert comment["id"].startswith("draft_")
    assert comment["status"] == "draft"
    assert comment["body"] == "Please add a regression test."
    session_response = client.get(f"/api/reviews/{review_id}")
    assert session_response.json()["comments"][0]["id"] == comment["id"]

    update_response = client.patch(
        f"/api/reviews/{review_id}/comments/{comment['id']}",
        json={"body": "Please add two regression tests."},
    )

    assert update_response.status_code == 200
    assert update_response.json()["body"] == "Please add two regression tests."

    delete_response = client.delete(f"/api/reviews/{review_id}/comments/{comment['id']}")

    assert delete_response.status_code == 200
    assert delete_response.json() == {"comment_id": comment["id"], "status": "deleted"}
    assert client.get(f"/api/reviews/{review_id}").json()["comments"] == []


def test_publish_comments_posts_to_github_and_persists_urls(tmp_path: Path, monkeypatch) -> None:
    fake_github = FakeGitHubClient()
    fake_github.published_comments = []
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", fake_github)
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)
    create_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})
    review_id = create_response.json()["review_id"]
    comment_response = client.post(
        f"/api/reviews/{review_id}/comments",
        json={
            "body": "Please add a regression test.",
            "context": {
                "filePath": "src/review/diagram.ts",
                "side": "new",
                "startLine": 1,
                "endLine": 1,
                "selectedText": "new",
            },
        },
    )
    comment_id = comment_response.json()["id"]

    publish_response = client.post(
        f"/api/reviews/{review_id}/comments/publish",
        json={"comment_ids": [comment_id]},
    )

    assert publish_response.status_code == 200
    assert publish_response.json()["comments"][0]["github_comment_url"] == "https://github.com/acme/review-room/pull/247#discussion_r1"
    assert fake_github.published_comments[0].body == "Please add a regression test."


def test_update_review_submission_persists_body_and_decision(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", FakeGitHubClient())
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)
    create_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})
    review_id = create_response.json()["review_id"]

    body_response = client.patch(f"/api/reviews/{review_id}/submission", json={"body": "Looks good."})
    event_response = client.patch(f"/api/reviews/{review_id}/submission", json={"event": "approve"})

    assert body_response.status_code == 200
    assert body_response.json()["body"] == "Looks good."
    assert event_response.status_code == 200
    assert event_response.json() == {"body": "Looks good.", "event": "approve", "github_review_url": None}
    assert client.get(f"/api/reviews/{review_id}").json()["submission"]["event"] == "approve"


def test_publish_comments_can_submit_github_review_with_decision_and_body(tmp_path: Path, monkeypatch) -> None:
    fake_github = FakeGitHubClient()
    fake_github.published_comments = []
    fake_github.submitted_reviews = []
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", fake_github)
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)
    create_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})
    review_id = create_response.json()["review_id"]
    comment_response = client.post(
        f"/api/reviews/{review_id}/comments",
        json={
            "body": "Please add a regression test.",
            "context": {
                "filePath": "src/review/diagram.ts",
                "side": "new",
                "startLine": 1,
                "endLine": 1,
                "selectedText": "new",
            },
        },
    )
    comment_id = comment_response.json()["id"]

    publish_response = client.post(
        f"/api/reviews/{review_id}/comments/publish",
        json={"comment_ids": [comment_id], "body": "Please address this before merge.", "event": "request_changes"},
    )

    assert publish_response.status_code == 200
    body = publish_response.json()
    assert body["submission"] == {
        "body": "Please address this before merge.",
        "event": "request_changes",
        "github_review_url": "https://github.com/acme/review-room/pull/247#pullrequestreview-1",
    }
    assert body["comments"][0]["github_comment_url"] == "https://github.com/acme/review-room/pull/247#pullrequestreview-1"
    assert fake_github.submitted_reviews[0]["event"] == "request_changes"
    assert fake_github.submitted_reviews[0]["body"] == "Please address this before merge."
    session_response = client.get(f"/api/reviews/{review_id}")
    assert session_response.json()["comments"][0]["status"] == "published"
    assert session_response.json()["comments"][0]["github_comment_url"] == "https://github.com/acme/review-room/pull/247#pullrequestreview-1"


def test_create_comment_rejects_unknown_changed_file(tmp_path: Path, monkeypatch) -> None:
    fake_github = FakeGitHubClient()
    fake_github.published_comments = []
    monkeypatch.setattr(main, "store", ReviewStore(tmp_path / ".review-room"))
    monkeypatch.setattr(main, "github", fake_github)
    monkeypatch.setattr(main, "checkout", FakeCheckoutService())
    monkeypatch.setattr(main, "agent", FakeAgent())
    client = TestClient(main.app)
    create_response = client.post("/api/reviews", json={"pr_url": "https://github.com/acme/review-room/pull/247"})
    review_id = create_response.json()["review_id"]

    comment_response = client.post(
        f"/api/reviews/{review_id}/comments",
        json={
            "body": "Please add a regression test.",
            "context": {
                "filePath": "src/review/other.ts",
                "side": "new",
                "startLine": 1,
                "endLine": 1,
                "selectedText": "new",
            },
        },
    )

    assert comment_response.status_code == 404
    assert comment_response.json() == {"detail": "Changed file not found: src/review/other.ts"}
    assert fake_github.published_comments == []


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
    threads = session_response.json()["threads"]
    assert len(threads) == len(DEFAULT_INIT_THREAD_PROMPTS) + 1
    assert [thread["title"] for thread in threads if thread["source"] == "init"] == [
        prompt.title for prompt in DEFAULT_INIT_THREAD_PROMPTS
    ]


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
