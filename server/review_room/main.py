from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import Response

from review_room.checkout import CheckoutError, RepoCheckoutService
from review_room.github import GitHubClient, GitHubError, parse_pr_url
from review_room.models import (
    BootstrapResponse,
    CreateReviewRequest,
    CreateReviewResponse,
    FileDiffResponse,
    ReviewSession,
)
from review_room.store import ReviewStore, stable_review_id


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
HOME_ENV_PATH = Path.home() / ".env"


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
