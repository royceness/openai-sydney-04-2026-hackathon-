from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Protocol

from review_room.github import ParsedPullRequestUrl


class CheckoutError(RuntimeError):
    pass


class CommandRunner(Protocol):
    async def run(self, args: list[str], cwd: Path | None = None) -> None:
        pass


class AsyncioCommandRunner:
    async def run(self, args: list[str], cwd: Path | None = None) -> None:
        proc = await asyncio.create_subprocess_exec(
            *args,
            cwd=str(cwd) if cwd is not None else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            output = "\n".join(
                part.decode(errors="replace").strip()
                for part in (stdout, stderr)
                if part.decode(errors="replace").strip()
            )
            command = " ".join(args)
            raise CheckoutError(f"Command failed: {command}\n{output}")


class RepoCheckoutService:
    def __init__(self, workspace_dir: Path, runner: CommandRunner | None = None) -> None:
        self.workspace_dir = workspace_dir
        self.runner = runner or AsyncioCommandRunner()

    async def checkout_pull_request(self, parsed: ParsedPullRequestUrl) -> Path:
        repo_dir = shared_repo_dir(self.workspace_dir, parsed)
        repo_parent = repo_dir.parent
        worktree_dir = checkout_repo_dir(self.workspace_dir, parsed)
        worktree_dir.parent.mkdir(parents=True, exist_ok=True)
        repo_parent.mkdir(parents=True, exist_ok=True)

        clone_url = f"https://github.com/{parsed.owner}/{parsed.repo}.git"
        if not repo_dir.exists():
            await self.runner.run(["git", "clone", "--filter=blob:none", clone_url, "repo"], cwd=repo_parent)
        else:
            await self.runner.run(["git", "remote", "set-url", "origin", clone_url], cwd=repo_dir)

        ref = checkout_ref(parsed.number)
        await self.runner.run(
            ["git", "fetch", "origin", f"+pull/{parsed.number}/head:{ref}"],
            cwd=repo_dir,
        )
        if worktree_dir.exists():
            await self.runner.run(["git", "checkout", "--detach", ref], cwd=worktree_dir)
        else:
            await self.runner.run(["git", "worktree", "add", "--detach", str(worktree_dir), ref], cwd=repo_dir)
        return worktree_dir


def checkout_repo_dir(workspace_dir: Path, parsed: ParsedPullRequestUrl) -> Path:
    return workspace_dir / "repos" / parsed.owner / parsed.repo / "worktrees" / f"pr-{parsed.number}"


def shared_repo_dir(workspace_dir: Path, parsed: ParsedPullRequestUrl) -> Path:
    return workspace_dir / "repos" / parsed.owner / parsed.repo / "repo"


def checkout_branch(number: int) -> str:
    return f"review-room-pr-{number}"


def checkout_ref(number: int) -> str:
    return f"refs/remotes/review-room/pr-{number}"
