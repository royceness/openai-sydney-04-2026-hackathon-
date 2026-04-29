from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import Response

from review_room.agent import CodexAppServerAgent
from review_room.checkout import CheckoutError, RepoCheckoutService
from review_room.github import GitHubClient, GitHubError, parse_pr_url
from review_room.models import (
    BootstrapResponse,
    CreateReviewRequest,
    CreateReviewResponse,
    CreateThreadRequest,
    CreateThreadResponse,
    DraftComment,
    FileDiffResponse,
    ReviewSession,
    ReviewThread,
    UpdateCommentRequest,
)
from review_room.prompting import build_review_prompt
from review_room.store import ReviewStore, stable_review_id
from review_room.threads import new_thread_id, run_review_thread


store = ReviewStore()
github = GitHubClient()
checkout = RepoCheckoutService(store.workspace_dir)
agent = CodexAppServerAgent()
HOME_ENV_PATH = Path.home() / ".env"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if should_warm_codex_on_startup():
        await agent.start()
    try:
        yield
    finally:
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
async def create_review(request: CreateReviewRequest) -> CreateReviewResponse:
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
        repo_path=str(repo_path),
        created_at=existing_session.created_at if existing_session is not None else datetime.now(timezone.utc),
    )
    store.save(session)
    return CreateReviewResponse(
        review_id=session.id,
        pr=session.pr,
        files=session.files,
        threads=session.threads,
        comments=session.comments,
    )


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


@app.patch("/api/reviews/{review_id}/comments/{comment_id}", response_model=DraftComment)
async def update_comment(review_id: str, comment_id: str, request: UpdateCommentRequest) -> DraftComment:
    try:
        session = store.get(review_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Review session not found") from exc

    for comment in session.comments:
        if comment.id == comment_id:
            comment.body = request.body
            if comment.status == "imported":
                comment.status = "draft"
            comment.updated_at = datetime.now(timezone.utc)
            store.save(session)
            return comment

    raise HTTPException(status_code=404, detail="Comment not found")


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
