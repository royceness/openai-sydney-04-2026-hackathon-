import pytest

from review_room.github import ParsedPullRequestUrl, map_changed_file, map_pull_request, parse_pr_url


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

