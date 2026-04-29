from pathlib import Path

import pytest

from review_room.checkout import CheckoutError, RepoCheckoutService, checkout_branch, checkout_ref, checkout_repo_dir, shared_repo_dir
from review_room.github import ParsedPullRequestUrl


class RecordingRunner:
    def __init__(self) -> None:
        self.calls: list[tuple[list[str], Path | None]] = []

    async def run(self, args: list[str], cwd: Path | None = None) -> None:
        self.calls.append((args, cwd))


def test_checkout_path_is_stable_and_scoped_to_workspace(tmp_path: Path) -> None:
    parsed = ParsedPullRequestUrl(owner="acme-inc", repo="review-room", number=247)

    assert checkout_branch(247) == "review-room-pr-247"
    assert checkout_ref(247) == "refs/remotes/review-room/pr-247"
    assert shared_repo_dir(tmp_path, parsed) == tmp_path / "repos" / "acme-inc" / "review-room" / "repo"
    assert checkout_repo_dir(tmp_path, parsed) == tmp_path / "repos" / "acme-inc" / "review-room" / "worktrees" / "pr-247"


@pytest.mark.asyncio
async def test_checkout_clones_fetches_and_adds_worktree_when_repo_is_absent(tmp_path: Path) -> None:
    parsed = ParsedPullRequestUrl(owner="acme-inc", repo="review-room", number=247)
    runner = RecordingRunner()
    service = RepoCheckoutService(tmp_path, runner)

    repo_path = await service.checkout_pull_request(parsed)

    shared_path = tmp_path / "repos" / "acme-inc" / "review-room" / "repo"
    assert repo_path == tmp_path / "repos" / "acme-inc" / "review-room" / "worktrees" / "pr-247"
    assert runner.calls == [
        (
            ["git", "clone", "--filter=blob:none", "https://github.com/acme-inc/review-room.git", "repo"],
            tmp_path / "repos" / "acme-inc" / "review-room",
        ),
        (
            ["git", "fetch", "origin", "+pull/247/head:refs/remotes/review-room/pr-247"],
            shared_path,
        ),
        (
            ["git", "worktree", "add", "--detach", str(repo_path), "refs/remotes/review-room/pr-247"],
            shared_path,
        ),
    ]


@pytest.mark.asyncio
async def test_checkout_updates_remote_when_repo_exists(tmp_path: Path) -> None:
    parsed = ParsedPullRequestUrl(owner="acme-inc", repo="review-room", number=247)
    repo_path = shared_repo_dir(tmp_path, parsed)
    repo_path.mkdir(parents=True)
    runner = RecordingRunner()
    service = RepoCheckoutService(tmp_path, runner)

    await service.checkout_pull_request(parsed)

    assert runner.calls[0] == (
        ["git", "remote", "set-url", "origin", "https://github.com/acme-inc/review-room.git"],
        repo_path,
    )


@pytest.mark.asyncio
async def test_checkout_reuses_existing_worktree(tmp_path: Path) -> None:
    parsed = ParsedPullRequestUrl(owner="acme-inc", repo="review-room", number=247)
    shared_path = shared_repo_dir(tmp_path, parsed)
    worktree_path = checkout_repo_dir(tmp_path, parsed)
    shared_path.mkdir(parents=True)
    worktree_path.mkdir(parents=True)
    runner = RecordingRunner()
    service = RepoCheckoutService(tmp_path, runner)

    repo_path = await service.checkout_pull_request(parsed)

    assert repo_path == worktree_path
    assert runner.calls[-1] == (
        ["git", "checkout", "--detach", "refs/remotes/review-room/pr-247"],
        worktree_path,
    )
    assert not any(call[0][:3] == ["git", "worktree", "add"] for call in runner.calls)


def test_checkout_error_includes_failed_command() -> None:
    error = CheckoutError("Command failed: git fetch origin")

    assert "git fetch origin" in str(error)
