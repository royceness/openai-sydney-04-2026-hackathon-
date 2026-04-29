# Review Room MVP, Stages 1 and 2

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The controlling instructions for this plan are in `/Users/royce/.codex/.agent/PLANS.md`. This repository does not currently contain its own copy of that file, so this plan repeats the implementation context needed to continue work without relying on prior conversation.

## Purpose / Big Picture

Review Room is a voice-first code review cockpit for GitHub pull requests. This plan gets the first working slice in place: a new full-stack app can load a public GitHub PR, show changed files, display a real unified diff for a selected file, and track an explicit code selection as the current review context. After this work, a reviewer can open the app, provide a PR URL, click through real changed files, select a function or block in the diff, and see an accurate `Selected: path:Lstart-Lend` chip. That working slice is the foundation for the next milestones: local checkout, Codex-backed manual threads, voice tool-calling, draft comments, and automatic review threads.

## Progress

- [x] (2026-04-29T01:27:08Z) Read the local ExecPlan requirements and confirmed the repository only contains `README.md`.
- [x] (2026-04-29T01:35:00Z) Created this self-contained ExecPlan for the hackathon MVP, with Stage 1 and Stage 2 as the immediate implementation scope.
- [x] (2026-04-29T01:35:50Z) Scaffolded the FastAPI backend in `server/` with PR bootstrap, PR loading, session persistence, and per-file diff retrieval.
- [x] (2026-04-29T01:35:50Z) Scaffolded the Vite React frontend in `web/` with a dark three-pane Review Room UI.
- [x] (2026-04-29T01:35:50Z) Implemented frontend bootstrap behavior using `?pr=`, then `/api/bootstrap`, then a minimal PR URL input.
- [x] (2026-04-29T01:35:50Z) Rendered real changed files in the left pane and PR metadata/body in the center pane.
- [x] (2026-04-29T01:35:50Z) Rendered a real unified diff for the active file and compute explicit browser text selection into a selected code context.
- [x] (2026-04-29T01:35:50Z) Added backend and frontend tests for Stage 1 and Stage 2 behavior.
- [x] (2026-04-29T01:35:50Z) Ran backend tests, frontend tests, frontend build, and a live GitHub smoke test.
- [x] (2026-04-29T01:40:22Z) Committed Stage 1 and Stage 2 as `790a398` on branch `codex/review-room-mvp`.
- [x] (2026-04-29T01:42:38Z) Implemented Stage 3 local checkout so review creation reuses a shared clone and creates or reuses a per-PR worktree under `.review-room/repos/`.
- [x] (2026-04-29T01:42:38Z) Added backend tests for checkout path construction, git command execution boundaries, existing worktree reuse, and review-session `repo_path` persistence.
- [x] (2026-04-29T01:42:38Z) Ran backend tests after Stage 3 and a live git checkout smoke test.

## Surprises & Discoveries

- Observation: The repository is effectively greenfield.
  Evidence: `find . -maxdepth 2 -type f -print` returned only `./README.md`.

- Observation: `uv run pytest` did not import the local package reliably until the Python project was made installable.
  Evidence: The first backend test run failed with `ModuleNotFoundError: No module named 'review_room'`; adding a Hatchling build backend and package target fixed the issue.

- Observation: The live GitHub fetch path works against a public PR.
  Evidence: A smoke script fetched `https://github.com/octocat/Hello-World/pull/1` and printed `Edited README via GitHub`, `1`, `README`, and `patch`.

- Observation: A shared clone plus git worktrees is a better fit than a full clone per PR for large repositories.
  Evidence: The user noted the target repo is huge and requested repo reuse. The implemented smoke test checked out `octocat/Hello-World#1` to `.review-room/repos/octocat/Hello-World/worktrees/pr-1`.

## Decision Log

- Decision: Use a simple monorepo layout with `server/` for FastAPI and `web/` for Vite React.
  Rationale: The repository is empty, and this keeps backend and frontend concerns clear while still allowing hackathon-speed development.
  Date/Author: 2026-04-29 / Codex

- Decision: For Stage 1 and Stage 2, use GitHub's public pull request and pull request files APIs instead of local git checkout.
  Rationale: The GitHub files API includes `patch` text for ordinary text diffs, which is enough to build the changed-files list, real diff viewer, and explicit selection context quickly. Local checkout remains the next stage because Codex needs a checked-out repository.
  Date/Author: 2026-04-29 / Codex

- Decision: Persist review sessions as JSON files under `.review-room/sessions/`.
  Rationale: The user preferred reloadable file-backed state over purely in-memory state. JSON files are adequate for the hackathon MVP and easy to inspect when debugging.
  Date/Author: 2026-04-29 / Codex

- Decision: Do not implement runtime mock agent behavior in this plan.
  Rationale: The user explicitly wants real Codex integration later and does not want a misleading fallback path. Tests may use stubs at unit boundaries, but production runtime should fail visibly when required integrations fail.
  Date/Author: 2026-04-29 / Codex

- Decision: Reuse one shared clone per GitHub repository and create one worktree per PR.
  Rationale: Large repositories should not be recloned for every review session. A git worktree gives each PR its own checked-out directory for Codex while the object database and fetched refs are shared by the repository clone.
  Date/Author: 2026-04-29 / Codex

## Outcomes & Retrospective

Stage 1, Stage 2, and Stage 3 are implemented. The app can bootstrap from a configured or query-string PR URL, fetch public GitHub PR metadata and changed files, persist a file-backed review session, render a three-pane UI, show a real unified diff, compute a visible selected-code context from browser text selection, and check out the PR into a reusable local git worktree. Remaining MVP work starts at the next milestone: manual Codex-backed review threads.

## Context and Orientation

The current repository at `/Users/royce/.codex/worktrees/0926/syd-hackathon-04-2026` only contains `README.md`. This plan creates a new application rather than extending an existing one.

The backend will live in `server/`. It uses FastAPI, which is a Python web framework for defining HTTP endpoints as Python functions. Pydantic models define the shape of request and response data. The backend stores session JSON files under `.review-room/sessions/`, relative to the repository root unless `REVIEW_ROOM_WORKSPACE_DIR` is set.

The frontend will live in `web/`. It uses Vite, React, and TypeScript. Vite runs a development server and proxies `/api` requests to the FastAPI backend. The UI has three panes: changed files on the left, PR metadata and diff in the middle, and the AI workbench placeholder on the right.

A "review session" means one loaded GitHub pull request plus its changed files, selected active file, and future workbench threads/comments. A "unified diff" means the familiar patch format with hunk headers like `@@ -10,7 +10,9 @@`, deletion lines beginning with `-`, addition lines beginning with `+`, and context lines beginning with a space. A "code selection" means the app's structured interpretation of the browser text selection inside the diff, including file path, side (`old` or `new`), start line, end line, and selected text.

## Plan of Work

First, create the backend package in `server/`. Add `server/pyproject.toml` with FastAPI, Uvicorn, httpx, pytest, and pytest-asyncio dependencies. Add `server/review_room/models.py` for Pydantic data models, `server/review_room/github.py` for parsing PR URLs and calling GitHub, `server/review_room/store.py` for JSON session persistence, and `server/review_room/main.py` for HTTP endpoints. The endpoints for this plan are `GET /api/bootstrap`, `POST /api/reviews`, `GET /api/reviews/{review_id}`, and `GET /api/reviews/{review_id}/files/{file_path:path}/diff`.

Second, create the frontend package in `web/`. Add Vite, React, Tailwind, Vitest, React Testing Library, and TypeScript setup. Add `web/src/App.tsx` for the application shell, `web/src/api.ts` for backend calls, `web/src/types.ts` for shared frontend types, `web/src/lib/diff.ts` for parsing unified diffs, and component files for the changed-files pane, PR/diff pane, selection chip, and AI workbench placeholder.

Third, implement PR bootstrapping. On page load, the frontend checks for `?pr=...`. If present, it immediately creates or loads the review session. If absent, it calls `/api/bootstrap`, which returns `REVIEW_ROOM_PR_URL` when configured. If neither path produces a PR URL, the UI shows a centered input for a public GitHub PR URL.

Fourth, implement the changed-files and diff flow. The backend fetches PR metadata from `https://api.github.com/repos/{owner}/{repo}/pulls/{number}` and files from `https://api.github.com/repos/{owner}/{repo}/pulls/{number}/files`. It stores the file metadata and patch text in the session JSON. The frontend renders files in the left pane. Clicking a file calls the diff endpoint and renders the returned patch in a table-like unified diff.

Fifth, implement explicit selection. Every rendered diff row carries `data-file-path`, `data-side`, `data-old-line`, and `data-new-line` attributes. On `mouseup` in the diff pane, the frontend reads `window.getSelection()`, finds the nearest diff rows for the anchor and focus nodes, orders those rows in DOM order, and computes the selected file, side, start line, end line, and selected text. The selected context is displayed in a visible chip above the diff.

Finally, add focused tests. Backend tests cover PR URL parsing, GitHub data mapping at the model boundary, and JSON session persistence. Frontend tests cover unified diff parsing and selection-context formatting/rendering. These tests keep Stage 1 and Stage 2 quick to run while protecting the behavior that later Codex and voice features depend on.

## Concrete Steps

From the repository root, install backend dependencies after the files are created:

    cd /Users/royce/.codex/worktrees/0926/syd-hackathon-04-2026/server
    uv sync

Install frontend dependencies:

    cd /Users/royce/.codex/worktrees/0926/syd-hackathon-04-2026/web
    npm install

Run backend tests:

    cd /Users/royce/.codex/worktrees/0926/syd-hackathon-04-2026/server
    uv run pytest

Current result:

    13 passed in 0.13s

Run frontend tests:

    cd /Users/royce/.codex/worktrees/0926/syd-hackathon-04-2026/web
    npm test -- --run

Current result:

    Test Files  4 passed (4)
    Tests  6 passed (6)

Run the frontend production build:

    cd /Users/royce/.codex/worktrees/0926/syd-hackathon-04-2026/web
    npm run build

Current result:

    ✓ built in 600ms

Start the backend during development:

    cd /Users/royce/.codex/worktrees/0926/syd-hackathon-04-2026/server
    REVIEW_ROOM_PR_URL="https://github.com/owner/repo/pull/123" uv run uvicorn review_room.main:app --reload --port 8000

Start the frontend in another terminal:

    cd /Users/royce/.codex/worktrees/0926/syd-hackathon-04-2026/web
    npm run dev

Then open `http://localhost:5173/?pr=https%3A%2F%2Fgithub.com%2Fowner%2Frepo%2Fpull%2F123`, replacing the URL with a real public pull request.

## Validation and Acceptance

Stage 1 is accepted when starting the backend and frontend, then loading a public PR URL, produces a three-pane dark UI. The left pane lists real changed files with status, additions, and deletions. The center pane displays the PR title, author, branch names, and PR body. The right pane displays an AI workbench placeholder.

Stage 2 is accepted when clicking a changed file loads its real unified diff in the center pane. Selecting text across one or more diff rows updates a visible chip such as `Selected: src/foo.ts:L42-L68`. The selected text and line range must correspond to the browser selection. Running backend and frontend tests should pass.

For automated validation, run the backend and frontend test commands above. For manual validation, use a small or medium public pull request that changes ordinary text files so GitHub's files API includes patch text.

## Idempotence and Recovery

The app writes session JSON files under `.review-room/sessions/`. Re-running `POST /api/reviews` for the same PR overwrites the saved metadata with the latest GitHub API response and preserves the same stable review ID. This is safe for Stage 1 and Stage 2 because there are no Codex threads or draft comments yet. If a session becomes confusing during manual testing, stop the servers and remove the relevant JSON file under `.review-room/sessions/`; the app will recreate it on the next load.

Dependency installation through `uv sync` and `npm install` is safe to repeat. The backend does not publish to GitHub. After Stage 3, the backend clones repositories only into `.review-room/repos/`. The clone is reused across PRs for the same `{owner}/{repo}` and each PR gets a worktree under `.review-room/repos/{owner}/{repo}/worktrees/pr-{number}`. If a worktree already exists, creating the same review again fetches the PR ref into `refs/remotes/review-room/pr-{number}` and checks out that ref in the existing worktree. If the worktree has local modifications, git may fail rather than silently discarding them.

## Artifacts and Notes

Initial repository inspection:

    $ find . -maxdepth 2 -type f -print
    ./README.md

The screenshot supplied by the user is a design reference only. The first implementation should evoke the same dark three-pane cockpit but should not copy the screenshot pixel-for-pixel.

## Interfaces and Dependencies

Backend dependencies:

- `fastapi` defines HTTP endpoints.
- `uvicorn` runs the development server.
- `httpx` calls GitHub's HTTP API.
- `pydantic` validates request and response models.
- `pytest` and `pytest-asyncio` run backend tests.

Frontend dependencies:

- `@vitejs/plugin-react`, `vite`, `react`, and `react-dom` provide the frontend runtime.
- `typescript` and `vitest` provide type checking and tests.
- `@testing-library/react` and `@testing-library/jest-dom` support component tests.
- `tailwindcss`, `postcss`, and `autoprefixer` provide styling.

Backend model names that must exist by the end of this plan include `PullRequestInfo`, `ChangedFile`, `ReviewSession`, `CreateReviewRequest`, and `FileDiffResponse` in `server/review_room/models.py`.

Frontend type names that must exist by the end of this plan include `PullRequestInfo`, `ChangedFile`, `ReviewSession`, `CodeSelection`, and `DiffLine` in `web/src/types.ts`.

## Debt and Future Issues

The following work is intentionally left for later milestones in this same project and should not be tracked as separate debt yet: real Codex app-server integration, manual workbench questions, real-time voice tool-calling, local draft comments, automatic initial review threads, GitHub write-back, rich Mermaid rendering, and persistent multi-user storage.

Revision note, 2026-04-29: Created the initial living ExecPlan for Stage 1 and Stage 2 so implementation can proceed from a self-contained document.

Revision note, 2026-04-29: Updated the plan after implementing Stage 1 and Stage 2, recording the completed files, tests, and live GitHub smoke validation.

Revision note, 2026-04-29: Began Stage 3. Local checkout is no longer future debt for this plan; it is the active milestone needed before Codex-backed manual threads.

Revision note, 2026-04-29: Completed Stage 3 using shared repository clones and per-PR git worktrees after the user noted the repository is huge and should be reused across sessions.
