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
    model_config = ConfigDict(populate_by_name=True)

    file_path: str = Field(alias="filePath")
    side: Literal["old", "new"]
    start_line: int | None = Field(default=None, alias="startLine")
    end_line: int | None = Field(default=None, alias="endLine")
    selected_text: str = Field(alias="selectedText")
    diff_hunk: str | None = Field(default=None, alias="diffHunk")
    commit_sha: str | None = Field(default=None, alias="commitSha")


class ReviewThread(BaseModel):
    id: str
    source: Literal["init", "voice", "manual", "comment"]
    title: str
    status: Literal["queued", "running", "complete", "failed"]
    prompt: str | None = None
    utterance: str | None = None
    context: CodeSelection | None = None
    codex_thread_id: str | None = None
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
    error: str | None = None


ReviewSubmissionEvent = Literal["comment", "approve", "request_changes"]


class ReviewSubmission(BaseModel):
    body: str = ""
    event: ReviewSubmissionEvent | None = None
    github_review_url: str | None = None


class ReviewSession(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    pr: PullRequestInfo
    files: list[ChangedFile]
    threads: list[ReviewThread] = Field(default_factory=list)
    comments: list[DraftComment] = Field(default_factory=list)
    submission: ReviewSubmission = Field(default_factory=ReviewSubmission)
    repo_path: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CreateReviewResponse(BaseModel):
    review_id: str
    pr: PullRequestInfo
    files: list[ChangedFile]
    threads: list[ReviewThread]
    comments: list[DraftComment] = Field(default_factory=list)
    submission: ReviewSubmission = Field(default_factory=ReviewSubmission)


class FileDiffResponse(BaseModel):
    file_path: str
    diff: str


class FileContentResponse(BaseModel):
    file_path: str
    start_line: int
    end_line: int
    total_lines: int
    content: str


class CreateThreadRequest(BaseModel):
    source: Literal["voice", "manual"] = "manual"
    title: str
    utterance: str
    context: CodeSelection | None = None


class CreateThreadResponse(BaseModel):
    thread_id: str
    status: Literal["queued", "running", "complete", "failed"]


class CreateFollowUpRequest(BaseModel):
    source: Literal["voice", "manual"] = "manual"
    utterance: str


class CreateFollowUpResponse(BaseModel):
    thread_id: str
    status: Literal["queued", "running", "complete", "failed"]


class CreateCommentRequest(BaseModel):
    body: str
    context: CodeSelection


class UpdateCommentRequest(BaseModel):
    body: str


class DeleteCommentResponse(BaseModel):
    comment_id: str
    status: Literal["deleted"]


class PublishCommentRequest(BaseModel):
    id: str
    body: str
    context: CodeSelection


class PublishCommentsRequest(BaseModel):
    comment_ids: list[str]
    body: str = ""
    event: ReviewSubmissionEvent | None = None


class PublishedComment(BaseModel):
    id: str
    body: str
    context: CodeSelection
    status: Literal["published"] = "published"
    github_comment_url: str


class PublishCommentsResponse(BaseModel):
    comments: list[PublishedComment]
    submission: ReviewSubmission = Field(default_factory=ReviewSubmission)


class UpdateReviewSubmissionRequest(BaseModel):
    body: str | None = None
    event: ReviewSubmissionEvent | None = None
