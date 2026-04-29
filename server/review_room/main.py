from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from review_room.agent import CodexAppServerAgent
from review_room.checkout import CheckoutError, RepoCheckoutService
from review_room.github import GitHubClient, GitHubError, parse_pr_url
from review_room.models import (
    BootstrapResponse,
    CreateReviewRequest,
    CreateReviewResponse,
    CreateThreadRequest,
    CreateThreadResponse,
    FileDiffResponse,
    ReviewSession,
    ReviewThread,
)
from review_room.prompting import build_review_prompt
from review_room.store import ReviewStore, stable_review_id
from review_room.threads import new_thread_id, run_review_thread


app = FastAPI(title="Review Room API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = ReviewStore()
github = GitHubClient()
checkout = RepoCheckoutService(store.workspace_dir)
agent = CodexAppServerAgent()


@app.get("/api/bootstrap", response_model=BootstrapResponse)
async def bootstrap() -> BootstrapResponse:
    return BootstrapResponse(pr_url=os.environ.get("REVIEW_ROOM_PR_URL"))


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
    session = ReviewSession(
        id=review_id,
        pr=pr,
        files=files,
        threads=[],
        comments=[],
        repo_path=str(repo_path),
        created_at=datetime.now(timezone.utc),
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
