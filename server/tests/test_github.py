import pytest

from review_room.github import (
    ParsedPullRequestUrl,
    build_pull_request_review_payload,
    build_review_comment_payload,
    map_changed_file,
    map_pull_request,
    parse_pr_url,
)
from review_room.models import CodeSelection, PublishCommentRequest, PullRequestInfo


def test_parse_pr_url_accepts_public_pull_request_url() -> None:
    parsed = parse_pr_url("https://github.com/openai/codex/pull/123")

    assert parsed.owner == "openai"
    assert parsed.repo == "codex"
    assert parsed.number == 123


def test_parse_pr_url_rejects_non_pull_request_url() -> None:
    with pytest.raises(ValueError, match="public GitHub pull request URL"):
        parse_pr_url("https://github.com/openai/codex/issues/123")


def test_map_pull_request_keeps_review_fields() -> None:
    parsed = ParsedPullRequestUrl(owner="acme", repo="review-room", number=247)
    mapped = map_pull_request(
        parsed,
        {
            "title": "Improve diagram layout",
            "html_url": "https://github.com/acme/review-room/pull/247",
            "user": {"login": "sarah-lee"},
            "body": "Adds smarter diagram layout.",
            "base": {"ref": "main", "sha": "abc"},
            "head": {"ref": "feature/diagram", "sha": "def"},
        },
    )

    assert mapped.title == "Improve diagram layout"
    assert mapped.author == "sarah-lee"
    assert mapped.base_ref == "main"
    assert mapped.head_sha == "def"


def test_map_changed_file_keeps_patch_and_counts() -> None:
    mapped = map_changed_file(
        {
            "filename": "src/review/diagram.ts",
            "status": "modified",
            "additions": 48,
            "deletions": 17,
            "patch": "@@ -1 +1 @@\n-old\n+new",
        }
    )

    assert mapped.path == "src/review/diagram.ts"
    assert mapped.status == "modified"
    assert mapped.additions == 48
    assert mapped.deletions == 17
    assert mapped.patch.startswith("@@")


def test_build_review_comment_payload_uses_line_side_and_pr_head_sha() -> None:
    pr = PullRequestInfo(
        owner="acme",
        repo="review-room",
        number=247,
        title="Improve diagram layout",
        url="https://github.com/acme/review-room/pull/247",
        base_ref="main",
        head_ref="feature/diagram",
        base_sha="abc",
        head_sha="def",
    )
    comment = PublishCommentRequest(
        id="draft_1",
        body="Please add a regression test.",
        context=CodeSelection(
            filePath="src/review/diagram.ts",
            side="new",
            startLine=42,
            endLine=44,
            selectedText="function buildDiagram() {}",
        ),
    )

    assert build_review_comment_payload(pr, comment) == {
        "body": "Please add a regression test.",
        "commit_id": "def",
        "path": "src/review/diagram.ts",
        "line": 44,
        "side": "RIGHT",
        "start_line": 42,
        "start_side": "RIGHT",
    }


def test_build_review_comment_payload_supports_old_side_single_line_with_selection_commit() -> None:
    pr = PullRequestInfo(
        owner="acme",
        repo="review-room",
        number=247,
        title="Improve diagram layout",
        url="https://github.com/acme/review-room/pull/247",
        base_ref="main",
        head_ref="feature/diagram",
        base_sha="abc",
        head_sha="def",
    )
    comment = PublishCommentRequest(
        id="draft_1",
        body="This removal needs explanation.",
        context=CodeSelection(
            filePath="src/review/diagram.ts",
            side="old",
            startLine=12,
            endLine=12,
            selectedText="old()",
            commitSha="selection-sha",
        ),
    )

    assert build_review_comment_payload(pr, comment) == {
        "body": "This removal needs explanation.",
        "commit_id": "selection-sha",
        "path": "src/review/diagram.ts",
        "line": 12,
        "side": "LEFT",
    }


def test_build_pull_request_review_payload_batches_comments_body_and_decision() -> None:
    pr = PullRequestInfo(
        owner="acme",
        repo="review-room",
        number=247,
        title="Improve diagram layout",
        url="https://github.com/acme/review-room/pull/247",
        base_ref="main",
        head_ref="feature/diagram",
        base_sha="abc",
        head_sha="def",
    )
    comment = PublishCommentRequest(
        id="draft_1",
        body="Please add a regression test.",
        context=CodeSelection(
            filePath="src/review/diagram.ts",
            side="new",
            startLine=42,
            endLine=44,
            selectedText="function buildDiagram() {}",
        ),
    )

    assert build_pull_request_review_payload(pr, [comment], "Please address this.", "request_changes") == {
        "commit_id": "def",
        "event": "REQUEST_CHANGES",
        "body": "Please address this.",
        "comments": [
            {
                "body": "Please add a regression test.",
                "path": "src/review/diagram.ts",
                "line": 44,
                "side": "RIGHT",
                "start_line": 42,
                "start_side": "RIGHT",
            }
        ],
    }


def test_build_pull_request_review_payload_requires_body_for_request_changes() -> None:
    pr = PullRequestInfo(
        owner="acme",
        repo="review-room",
        number=247,
        title="Improve diagram layout",
        url="https://github.com/acme/review-room/pull/247",
        base_ref="main",
        head_ref="feature/diagram",
        base_sha="abc",
        head_sha="def",
    )

    with pytest.raises(ValueError, match="discussion comment"):
        build_pull_request_review_payload(pr, [], "", "request_changes")
