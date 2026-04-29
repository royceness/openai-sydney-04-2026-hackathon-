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
    CreateFollowUpRequest,
    CreateFollowUpResponse,
    CreateReviewRequest,
    CreateReviewResponse,
    CreateThreadRequest,
    CreateThreadResponse,
    FileContentResponse,
    FileDiffResponse,
    ReviewSession,
    ReviewThread,
)
from review_room.prompting import build_follow_up_prompt, build_review_prompt
from review_room.store import ReviewStore, stable_review_id
from review_room.threads import new_thread_id, run_review_thread, run_thread_follow_up


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
        pr, files = await github.fetch_pull_request(parsed)
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
        comments=existing_session.comments if existing_session is not None else [],
        repo_path=str(repo_path),
        created_at=existing_session.created_at if existing_session is not None else datetime.now(timezone.utc),
    )
    store.save(session)
    return CreateReviewResponse(review_id=session.id, pr=session.pr, files=session.files, threads=session.threads)


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
