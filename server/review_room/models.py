from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class CreateReviewRequest(BaseModel):
    pr_url: HttpUrl


class BootstrapResponse(BaseModel):
    pr_url: str | None


class PullRequestInfo(BaseModel):
    owner: str
    repo: str
    number: int
    title: str
    url: str
    author: str | None = None
    body: str | None = None
    base_ref: str
    head_ref: str
    base_sha: str
    head_sha: str


class ChangedFile(BaseModel):
    path: str
    status: Literal["added", "modified", "removed", "renamed", "changed", "unchanged"]
    additions: int
    deletions: int
    patch: str | None = None
    previous_path: str | None = None


class CodeSelection(BaseModel):
    file_path: str
    side: Literal["old", "new"]
    start_line: int | None = None
    end_line: int | None = None
    selected_text: str
    diff_hunk: str | None = None
    commit_sha: str | None = None


class ReviewThread(BaseModel):
    id: str
    source: Literal["init", "voice", "manual", "comment"]
    title: str
    status: Literal["queued", "running", "complete", "failed"]
    markdown: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DraftComment(BaseModel):
    id: str
    body: str
    context: CodeSelection
    status: Literal["draft", "published", "failed"] = "draft"
    github_comment_url: str | None = None


class ReviewSession(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    pr: PullRequestInfo
    files: list[ChangedFile]
    threads: list[ReviewThread] = Field(default_factory=list)
    comments: list[DraftComment] = Field(default_factory=list)
    repo_path: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CreateReviewResponse(BaseModel):
    review_id: str
    pr: PullRequestInfo
    files: list[ChangedFile]
    threads: list[ReviewThread]


class FileDiffResponse(BaseModel):
    file_path: str
    diff: str

