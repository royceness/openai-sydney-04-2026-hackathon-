import pytest

from review_room.github import (
    ParsedPullRequestUrl,
    build_review_comment_payload,
    map_changed_file,
    map_pull_request,
    map_pull_request_review_comment,
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


def test_map_pull_request_review_comment_keeps_diff_location_and_github_metadata() -> None:
    mapped = map_pull_request_review_comment(
        {
            "id": 101,
            "body": "Please rename this helper.",
            "path": "src/review/diagram.ts",
            "side": "RIGHT",
            "line": 42,
            "start_line": 40,
            "diff_hunk": "@@ -39,4 +39,6 @@",
            "commit_id": "def",
            "html_url": "https://github.com/acme/review-room/pull/247#discussion_r101",
            "user": {"login": "reviewer"},
            "created_at": "2026-04-29T04:30:00Z",
            "updated_at": "2026-04-29T04:31:00Z",
        }
    )

    assert mapped.id == "gh_comment_101"
    assert mapped.source == "github"
    assert mapped.status == "imported"
    assert mapped.context.file_path == "src/review/diagram.ts"
    assert mapped.context.side == "new"
    assert mapped.context.start_line == 40
    assert mapped.context.end_line == 42
    assert mapped.context.commit_sha == "def"
    assert mapped.author == "reviewer"
    assert mapped.github_comment_id == 101
    assert mapped.github_comment_url.endswith("discussion_r101")


def test_map_pull_request_review_comment_falls_back_to_original_line_for_outdated_comment() -> None:
    mapped = map_pull_request_review_comment(
        {
            "id": 102,
            "body": "Outdated but still useful.",
            "path": "src/review/diagram.ts",
            "side": "LEFT",
            "line": None,
            "original_line": 17,
            "original_start_line": 15,
            "diff_hunk": "@@ -15,3 +15,3 @@",
            "original_commit_id": "abc",
            "html_url": "https://github.com/acme/review-room/pull/247#discussion_r102",
            "user": {"login": "reviewer"},
            "created_at": "2026-04-29T04:30:00Z",
            "updated_at": "2026-04-29T04:31:00Z",
        }
    )

    assert mapped.context.side == "old"
    assert mapped.context.start_line == 15
    assert mapped.context.end_line == 17
    assert mapped.context.commit_sha == "abc"
