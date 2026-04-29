from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass

import httpx

from review_room.models import (
    ChangedFile,
    PublishedComment,
    PublishCommentRequest,
    PullRequestInfo,
    ReviewSubmission,
    ReviewSubmissionEvent,
)


PR_URL_RE = re.compile(
    r"^https://github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+)/pull/(?P<number>\d+)/?$"
)


@dataclass(frozen=True)
class ParsedPullRequestUrl:
    owner: str
    repo: str
    number: int


class GitHubError(RuntimeError):
    pass


def parse_pr_url(pr_url: str) -> ParsedPullRequestUrl:
    match = PR_URL_RE.match(pr_url.strip())
    if match is None:
        raise ValueError("Expected a public GitHub pull request URL like https://github.com/owner/repo/pull/123")
    return ParsedPullRequestUrl(
        owner=match.group("owner"),
        repo=match.group("repo"),
        number=int(match.group("number")),
    )


async def discover_github_token() -> str | None:
    env_token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if env_token:
        return env_token

    try:
        proc = await asyncio.create_subprocess_exec(
            "gh",
            "auth",
            "token",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _stderr = await asyncio.wait_for(proc.communicate(), timeout=5)
    except (FileNotFoundError, TimeoutError):
        return None

    if proc.returncode != 0:
        return None
    token = stdout.decode().strip()
    return token or None


class GitHubClient:
    def __init__(self, token: str | None = None) -> None:
        self._token = token

    async def _headers(self) -> dict[str, str]:
        token = self._token if self._token is not None else await discover_github_token()
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "review-room-hackathon",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    async def fetch_pull_request(self, parsed: ParsedPullRequestUrl) -> tuple[PullRequestInfo, list[ChangedFile]]:
        headers = await self._headers()
        base_url = f"https://api.github.com/repos/{parsed.owner}/{parsed.repo}/pulls/{parsed.number}"
        async with httpx.AsyncClient(headers=headers, timeout=30.0, follow_redirects=True) as client:
            pr_response = await client.get(base_url)
            if pr_response.status_code >= 400:
                raise GitHubError(f"GitHub PR request failed with HTTP {pr_response.status_code}: {pr_response.text}")
            pr_data = pr_response.json()

            files: list[ChangedFile] = []
            page = 1
            while True:
                files_response = await client.get(f"{base_url}/files", params={"per_page": 100, "page": page})
                if files_response.status_code >= 400:
                    raise GitHubError(
                        f"GitHub PR files request failed with HTTP {files_response.status_code}: {files_response.text}"
                    )
                page_files = files_response.json()
                files.extend(map_changed_file(file_data) for file_data in page_files)
                if len(page_files) < 100:
                    break
                page += 1

        return map_pull_request(parsed, pr_data), files

    async def create_pull_request_review_comment(
        self,
        pr: PullRequestInfo,
        comment: PublishCommentRequest,
    ) -> PublishedComment:
        headers = await self._headers()
        payload = build_review_comment_payload(pr, comment)
        url = f"https://api.github.com/repos/{pr.owner}/{pr.repo}/pulls/{pr.number}/comments"
        async with httpx.AsyncClient(headers=headers, timeout=30.0, follow_redirects=True) as client:
            response = await client.post(url, json=payload)
            if response.status_code >= 400:
                raise GitHubError(f"GitHub PR comment request failed with HTTP {response.status_code}: {response.text}")
            data = response.json()

        return PublishedComment(
            id=comment.id,
            body=comment.body,
            context=comment.context,
            github_comment_url=data["html_url"],
        )

    async def create_pull_request_review(
        self,
        pr: PullRequestInfo,
        comments: list[PublishCommentRequest],
        body: str,
        event: ReviewSubmissionEvent,
    ) -> tuple[list[PublishedComment], ReviewSubmission]:
        headers = await self._headers()
        payload = build_pull_request_review_payload(pr, comments, body, event)
        url = f"https://api.github.com/repos/{pr.owner}/{pr.repo}/pulls/{pr.number}/reviews"
        async with httpx.AsyncClient(headers=headers, timeout=30.0, follow_redirects=True) as client:
            response = await client.post(url, json=payload)
            if response.status_code >= 400:
                raise GitHubError(f"GitHub PR review request failed with HTTP {response.status_code}: {response.text}")
            data = response.json()

        review_url = data["html_url"]
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


def map_pull_request(parsed: ParsedPullRequestUrl, data: dict) -> PullRequestInfo:
    return PullRequestInfo(
        owner=parsed.owner,
        repo=parsed.repo,
        number=parsed.number,
        title=data["title"],
        url=data["html_url"],
        author=(data.get("user") or {}).get("login"),
        body=data.get("body") or "",
        base_ref=data["base"]["ref"],
        head_ref=data["head"]["ref"],
        base_sha=data["base"]["sha"],
        head_sha=data["head"]["sha"],
    )


def map_changed_file(data: dict) -> ChangedFile:
    return ChangedFile(
        path=data["filename"],
        status=data["status"],
        additions=int(data.get("additions", 0)),
        deletions=int(data.get("deletions", 0)),
        patch=data.get("patch"),
        previous_path=data.get("previous_filename"),
    )


def build_review_comment_payload(pr: PullRequestInfo, comment: PublishCommentRequest) -> dict[str, object]:
    context = comment.context
    if context.start_line is None or context.end_line is None:
        raise ValueError("Published PR comments require selected line numbers")

    start_line = min(context.start_line, context.end_line)
    end_line = max(context.start_line, context.end_line)
    side = "RIGHT" if context.side == "new" else "LEFT"
    payload: dict[str, object] = {
        "body": comment.body,
        "commit_id": context.commit_sha or pr.head_sha,
        "path": context.file_path,
        "line": end_line,
        "side": side,
    }
    if start_line != end_line:
        payload["start_line"] = start_line
        payload["start_side"] = side
    return payload


def build_pull_request_review_payload(
    pr: PullRequestInfo,
    comments: list[PublishCommentRequest],
    body: str,
    event: ReviewSubmissionEvent,
) -> dict[str, object]:
    trimmed_body = body.strip()
    if event in {"comment", "request_changes"} and not trimmed_body:
        raise ValueError("A discussion comment is required for this review action")

    payload: dict[str, object] = {
        "commit_id": pr.head_sha,
        "event": event.upper(),
    }
    if trimmed_body:
        payload["body"] = trimmed_body
    if comments:
        payload["comments"] = [build_review_comment_item(comment) for comment in comments]
    return payload


def build_review_comment_item(comment: PublishCommentRequest) -> dict[str, object]:
    context = comment.context
    if context.start_line is None or context.end_line is None:
        raise ValueError("Published PR comments require selected line numbers")

    start_line = min(context.start_line, context.end_line)
    end_line = max(context.start_line, context.end_line)
    side = "RIGHT" if context.side == "new" else "LEFT"
    payload: dict[str, object] = {
        "body": comment.body,
        "path": context.file_path,
        "line": end_line,
        "side": side,
    }
    if start_line != end_line:
        payload["start_line"] = start_line
        payload["start_side"] = side
    return payload
