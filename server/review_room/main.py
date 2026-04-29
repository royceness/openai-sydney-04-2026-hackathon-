from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import Response

from review_room.agent import CodeAgent, CodexAppServerAgentPool
from review_room.checkout import CheckoutError, RepoCheckoutService
from review_room.github import GitHubClient, GitHubError, parse_pr_url
from review_room.init_threads import configured_init_thread_prompts, ensure_init_threads
from review_room.models import (
    BootstrapResponse,
    CodeSelection,
    CreateCommentRequest,
    CreateFollowUpRequest,
    CreateFollowUpResponse,
    CreateReviewRequest,
    CreateReviewResponse,
    CreateThreadRequest,
    CreateThreadResponse,
    DeleteCommentResponse,
    DraftComment,
    FileContentResponse,
    FileDiffResponse,
    PublishCommentsRequest,
    PublishCommentsResponse,
    ReviewSession,
    ReviewSubmission,
    ReviewThread,
    UpdateCommentRequest,
    UpdateReviewSubmissionRequest,
)
from review_room.prompting import build_follow_up_prompt, build_review_prompt
from review_room.store import ReviewStore, stable_review_id
from review_room.threads import new_thread_id, run_review_thread, run_thread_follow_up


store = ReviewStore()
github = GitHubClient()
checkout = RepoCheckoutService(store.workspace_dir)
agent = CodexAppServerAgentPool()
HOME_ENV_PATH = Path.home() / ".env"
active_thread_tasks: set[tuple[str, str]] = set()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    warm_task = None
    if should_warm_codex_on_startup():
        warm_task = asyncio.create_task(agent.start())
    try:
        yield
    finally:
        if warm_task is not None and not warm_task.done():
            warm_task.cancel()
        await agent.close()


def should_warm_codex_on_startup() -> bool:
    configured = os.environ.get("REVIEW_ROOM_WARM_CODEX_ON_STARTUP")
    if configured is not None:
        return configured.lower() not in {"0", "false", "no"}
    return "PYTEST_CURRENT_TEST" not in os.environ


app = FastAPI(title="Review Room API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/bootstrap", response_model=BootstrapResponse)
async def bootstrap() -> BootstrapResponse:
    return BootstrapResponse(pr_url=os.environ.get("REVIEW_ROOM_PR_URL"))


@app.post("/api/realtime/session")
async def create_realtime_session(request: Request) -> Response:
    api_key = get_openai_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is required for voice support")

    content_type = request.headers.get("content-type")
    headers = {"Authorization": f"Bearer {api_key}"}
    if content_type:
        headers["Content-Type"] = content_type

    async with httpx.AsyncClient(timeout=30.0) as client:
        realtime_response = await client.post(
            "https://api.openai.com/v1/realtime/calls",
            content=await request.body(),
            headers=headers,
        )

    return Response(
        content=realtime_response.content,
        media_type=realtime_response.headers.get("content-type", "application/sdp"),
        status_code=realtime_response.status_code,
    )


def get_openai_api_key() -> str | None:
    env_key = os.environ.get("OPENAI_API_KEY")
    if env_key:
        return env_key
    return read_dotenv_value(HOME_ENV_PATH, "OPENAI_API_KEY")


def read_dotenv_value(path: Path, key: str) -> str | None:
    if not path.exists():
        return None

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped.removeprefix("export ").strip()
        name, separator, value = stripped.partition("=")
        if separator and name.strip() == key:
            return unquote_dotenv_value(value.strip())

    return None


def unquote_dotenv_value(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


@app.post("/api/reviews", response_model=CreateReviewResponse)
async def create_review(request: CreateReviewRequest, background_tasks: BackgroundTasks) -> CreateReviewResponse:
    try:
        parsed = parse_pr_url(str(request.pr_url))
        pr, files, imported_comments = await github.fetch_pull_request(parsed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        repo_path = await checkout.checkout_pull_request(parsed)
    except CheckoutError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    review_id = stable_review_id(parsed.owner, parsed.repo, parsed.number)
    existing_session = None
    try:
        existing_session = store.get(review_id)
    except KeyError:
        pass

    session = ReviewSession(
        id=review_id,
        pr=pr,
        files=files,
        threads=existing_session.threads if existing_session is not None else [],
        comments=merge_review_comments(existing_session.comments if existing_session is not None else [], imported_comments),
        submission=existing_session.submission if existing_session is not None else ReviewSubmission(),
        repo_path=str(repo_path),
        created_at=existing_session.created_at if existing_session is not None else datetime.now(timezone.utc),
    )
    try:
        created_init_threads = ensure_init_threads(
            session,
            configured_init_thread_prompts(os.environ.get("REVIEW_ROOM_INIT_THREADS")),
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    store.save(session)
    if created_init_threads:
        background_tasks.add_task(schedule_review_threads, session.id, [thread.id for thread in created_init_threads])

    return CreateReviewResponse(
        review_id=session.id,
        pr=session.pr,
        files=session.files,
        threads=session.threads,
        comments=session.comments,
        submission=session.submission,
    )


async def schedule_review_threads(review_id: str, thread_ids: list[str]) -> None:
    task_keys = [(review_id, thread_id) for thread_id in thread_ids]
    runnable_thread_ids = []
    active_keys = []
    for task_key, thread_id in zip(task_keys, thread_ids, strict=True):
        if task_key in active_thread_tasks:
            continue
        active_thread_tasks.add(task_key)
        active_keys.append(task_key)
        runnable_thread_ids.append(thread_id)
    try:
        await run_review_threads(store, agent, review_id, runnable_thread_ids)
    finally:
        for task_key in active_keys:
            active_thread_tasks.discard(task_key)


async def run_review_threads(store: ReviewStore, agent: CodeAgent, review_id: str, thread_ids: list[str]) -> None:
    await asyncio.gather(*(run_review_thread(store, agent, review_id, thread_id) for thread_id in thread_ids))


def merge_review_comments(existing_comments: list[DraftComment], imported_comments: list[DraftComment]) -> list[DraftComment]:
    imported_by_github_id = {
        comment.github_comment_id: comment for comment in imported_comments if comment.github_comment_id is not None
    }
    existing_by_github_id = {
        comment.github_comment_id: comment for comment in existing_comments if comment.github_comment_id is not None
    }
    merged = [
        comment
        for comment in existing_comments
        if comment.github_comment_id is None or comment.github_comment_id not in imported_by_github_id
    ]
    for imported_comment in imported_comments:
        existing_comment = existing_by_github_id.get(imported_comment.github_comment_id)
        if existing_comment is not None and existing_comment.status != "imported":
            merged.append(existing_comment)
        else:
            merged.append(imported_comment)
    return merged


@app.get("/api/reviews/{review_id}", response_model=ReviewSession)
async def get_review(review_id: str) -> ReviewSession:
    try:
        return store.get(review_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Review session not found") from exc


@app.get("/api/reviews/{review_id}/files/{file_path:path}/diff", response_model=FileDiffResponse)
async def get_file_diff(review_id: str, file_path: str) -> FileDiffResponse:
    try:
        session = store.get(review_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Review session not found") from exc

    for changed_file in session.files:
        if changed_file.path == file_path:
            if changed_file.patch is None:
                raise HTTPException(status_code=422, detail="GitHub did not provide a text patch for this file")
            return FileDiffResponse(file_path=changed_file.path, diff=changed_file.patch)

    raise HTTPException(status_code=404, detail="Changed file not found")


@app.get("/api/reviews/{review_id}/files/{file_path:path}/content", response_model=FileContentResponse)
async def get_file_content(
    review_id: str,
    file_path: str,
    start_line: int | None = None,
    end_line: int | None = None,
    context: int = 0,
) -> FileContentResponse:
    try:
        session = store.get(review_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Review session not found") from exc

    changed_file = next((item for item in session.files if item.path == file_path), None)
    if changed_file is None:
        raise HTTPException(status_code=404, detail="Changed file not found")
    if session.repo_path is None:
        raise HTTPException(status_code=409, detail="Review session has no checked-out repository")
    if context < 0:
        raise HTTPException(status_code=400, detail="Context must be zero or greater")

    repo_root = Path(session.repo_path).resolve()
    target_path = (repo_root / file_path).resolve()
    try:
        target_path.relative_to(repo_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="File path escapes repository checkout") from exc

    if not target_path.is_file():
        if changed_file.status == "removed":
            raise HTTPException(status_code=422, detail="Removed files have no content in the PR checkout")
        raise HTTPException(status_code=404, detail="File content not found in checkout")

    try:
        lines = target_path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="File content is not UTF-8 text") from exc

    start, end = _requested_line_window(start_line, end_line, context, len(lines))
    content = "\n".join(lines[start - 1 : end]) if start > 0 and end > 0 else ""
    return FileContentResponse(
        file_path=changed_file.path,
        start_line=start,
        end_line=end,
        total_lines=len(lines),
        content=content,
    )


@app.post("/api/reviews/{review_id}/threads", response_model=CreateThreadResponse)
async def create_thread(
    review_id: str,
    request: CreateThreadRequest,
    background_tasks: BackgroundTasks,
) -> CreateThreadResponse:
    try:
        session = store.get(review_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Review session not found") from exc

    if session.repo_path is None:
        raise HTTPException(status_code=409, detail="Review session has no checked-out repository")

    prompt = build_review_prompt(session, request.utterance, request.context)
    thread = ReviewThread(
        id=new_thread_id(),
        source=request.source,
        title=request.title,
        status="queued",
        prompt=prompt,
        utterance=request.utterance,
        context=request.context,
    )
    session.threads.append(thread)
    store.save(session)
    background_tasks.add_task(run_review_thread, store, agent, review_id, thread.id)
    return CreateThreadResponse(thread_id=thread.id, status=thread.status)


@app.post("/api/reviews/{review_id}/threads/{thread_id}/followups", response_model=CreateFollowUpResponse)
async def create_follow_up(
    review_id: str,
    thread_id: str,
    request: CreateFollowUpRequest,
    background_tasks: BackgroundTasks,
) -> CreateFollowUpResponse:
    try:
        session = store.get(review_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Review session not found") from exc

    thread = next((item for item in session.threads if item.id == thread_id), None)
    if thread is None:
        raise HTTPException(status_code=404, detail="Review thread not found")
    if thread.status in {"queued", "running"}:
        raise HTTPException(status_code=409, detail="Review thread is still running")
    if thread.codex_thread_id is None:
        raise HTTPException(status_code=409, detail="Review thread has no Codex thread id")

    thread.status = "queued"
    thread.updated_at = datetime.now(timezone.utc)
    store.save(session)
    prompt = build_follow_up_prompt(request.utterance)
    background_tasks.add_task(run_thread_follow_up, store, agent, review_id, thread.id, prompt, request.utterance)
    return CreateFollowUpResponse(thread_id=thread.id, status=thread.status)


@app.post("/api/reviews/{review_id}/comments", response_model=DraftComment)
async def create_comment(review_id: str, request: CreateCommentRequest) -> DraftComment:
    try:
        session = store.get(review_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Review session not found") from exc

    _validate_comment_request(session, request.body, request.context)
    comment = DraftComment(
        id=new_comment_id(),
        body=request.body.strip(),
        context=request.context,
        status="draft",
    )
    session.comments.insert(0, comment)
    store.save(session)
    return comment


@app.patch("/api/reviews/{review_id}/comments/{comment_id}", response_model=DraftComment)
async def update_comment(review_id: str, comment_id: str, request: UpdateCommentRequest) -> DraftComment:
    try:
        session = store.get(review_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Review session not found") from exc

    comment = _find_comment_or_none(session, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="PR comment not found")
    if comment.status == "published":
        raise HTTPException(status_code=409, detail="Published PR comments cannot be edited in Review Room")
    _validate_comment_request(session, request.body, comment.context)
    comment.body = request.body.strip()
    comment.status = "draft"
    comment.github_comment_url = None
    comment.updated_at = datetime.now(timezone.utc)
    store.save(session)
    return comment


@app.delete("/api/reviews/{review_id}/comments/{comment_id}", response_model=DeleteCommentResponse)
async def delete_comment(review_id: str, comment_id: str) -> DeleteCommentResponse:
    try:
        session = store.get(review_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Review session not found") from exc

    comment = _find_comment_or_none(session, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="PR comment not found")
    if comment.status == "published":
        raise HTTPException(status_code=409, detail="Published PR comments cannot be deleted in Review Room")
    session.comments = [item for item in session.comments if item.id != comment_id]
    store.save(session)
    return DeleteCommentResponse(comment_id=comment_id, status="deleted")


@app.post("/api/reviews/{review_id}/comments/publish", response_model=PublishCommentsResponse)
async def publish_comments(review_id: str, request: PublishCommentsRequest) -> PublishCommentsResponse:
    try:
        session = store.get(review_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Review session not found") from exc

    comments_to_publish = []
    for comment_id in request.comment_ids:
        comment = _find_comment_or_none(session, comment_id)
        if comment is None:
            raise HTTPException(status_code=404, detail=f"PR comment not found: {comment_id}")
        if comment.status == "published":
            continue
        _validate_comment_request(session, comment.body, comment.context)
        comments_to_publish.append(comment)

    if request.event in {"comment", "request_changes"} and not request.body.strip():
        raise HTTPException(status_code=400, detail="A discussion comment is required for this review action")

    try:
        if request.event is None and not request.body.strip():
            published_comments = [
                await github.create_pull_request_review_comment(session.pr, comment) for comment in comments_to_publish
            ]
            submission = ReviewSubmission(body="", event=None, github_review_url=None)
        else:
            published_comments, submission = await github.create_pull_request_review(
                session.pr,
                comments_to_publish,
                body=request.body,
                event=request.event or "comment",
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GitHubError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    published_by_id = {comment.id: comment for comment in published_comments}
    session.comments = [
        DraftComment(**published_by_id[comment.id].model_dump()) if comment.id in published_by_id else comment
        for comment in session.comments
    ]
    session.submission = submission
    session.updated_at = datetime.now(timezone.utc)
    store.save(session)
    return PublishCommentsResponse(comments=published_comments, submission=submission)


@app.patch("/api/reviews/{review_id}/submission", response_model=ReviewSubmission)
async def update_review_submission(review_id: str, request: UpdateReviewSubmissionRequest) -> ReviewSubmission:
    try:
        session = store.get(review_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Review session not found") from exc

    if request.body is not None:
        session.submission.body = request.body.strip()
    if request.event is not None:
        session.submission.event = request.event
    session.submission.github_review_url = None
    session.updated_at = datetime.now(timezone.utc)
    store.save(session)
    return session.submission


def new_comment_id() -> str:
    return f"draft_{uuid4().hex[:12]}"


def _find_comment_or_none(session: ReviewSession, comment_id: str) -> DraftComment | None:
    return next((comment for comment in session.comments if comment.id == comment_id), None)


def _validate_comment_request(session: ReviewSession, body: str, context: CodeSelection) -> None:
    if not body.strip():
        raise HTTPException(status_code=400, detail="Comment body is required")
    if context.file_path not in {file.path for file in session.files}:
        raise HTTPException(status_code=404, detail=f"Changed file not found: {context.file_path}")
    if context.start_line is None or context.end_line is None:
        raise HTTPException(status_code=400, detail="PR comments require selected line numbers")


def _requested_line_window(
    start_line: int | None,
    end_line: int | None,
    context: int,
    total_lines: int,
) -> tuple[int, int]:
    if total_lines == 0:
        return 0, 0
    if start_line is not None and start_line < 1:
        raise HTTPException(status_code=400, detail="start_line must be at least 1")
    if end_line is not None and end_line < 1:
        raise HTTPException(status_code=400, detail="end_line must be at least 1")

    requested_start = start_line if start_line is not None else 1
    requested_end = end_line if end_line is not None else (requested_start if start_line is not None else total_lines)
    if requested_end < requested_start:
        raise HTTPException(status_code=400, detail="end_line must be greater than or equal to start_line")

    start = max(1, requested_start - context)
    end = min(total_lines, requested_end + context)
    return start, end
