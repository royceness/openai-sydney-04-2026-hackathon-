# Automatic Init Threads

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document follows the requirements in `/Users/royce/.codex/.agent/PLANS.md`.

## Purpose / Big Picture

When a reviewer loads a new pull request in Review Room, the app should automatically start a small set of Codex workbench threads that answer common first-pass review questions. The reviewer should see threads named `PR summary`, `Tests audit`, `Architecture coherence report`, `Bug finder`, and `Doc validator` appear without manually asking for each one. These threads should behave like ordinary workbench threads for polling and display, but voice should not announce their completion because they are background review aids rather than direct spoken requests.

## Progress

- [x] (2026-04-29 00:00Z) Created the `codex/automatic-init-threads` branch from `main`.
- [x] (2026-04-29 00:05Z) Inspected the review creation endpoint, thread worker, prompt builder, frontend announcement logic, and existing backend/frontend tests.
- [x] (2026-04-29 00:10Z) Wrote this ExecPlan with the planned backend-owned init-thread design.
- [x] (2026-04-29 00:17Z) Added configurable init prompt definitions and idempotent thread creation on the backend.
- [x] (2026-04-29 00:20Z) Wired init threads into `/api/reviews` and scheduled only newly created init threads.
- [x] (2026-04-29 00:22Z) Suppressed voice announcements for `source: "init"` thread completions.
- [x] (2026-04-29 00:28Z) Added and updated backend and frontend tests.
- [x] (2026-04-29 00:34Z) Ran focused backend and frontend validation and recorded the results here.
- [x] (2026-04-29 00:38Z) Ran the frontend production build as an additional TypeScript and bundling check.
- [x] (2026-04-29 00:41Z) Ran the full backend test suite.

## Surprises & Discoveries

- Observation: The data model already supports `ReviewThread.source == "init"` even though the public create-thread request only allows `voice` and `manual`.
  Evidence: `server/review_room/models.py` defines `ReviewThread.source` as `Literal["init", "voice", "manual", "comment"]`.

## Decision Log

- Decision: The backend will own automatic init-thread creation inside `/api/reviews`.
  Rationale: The backend already owns session persistence and background thread execution. Creating init threads there makes the behavior consistent whether the user loads the app, reloads the same PR, or another client opens the same review session.
  Date/Author: 2026-04-29 / Codex

- Decision: Init prompts are configured with the `REVIEW_ROOM_INIT_THREADS` environment variable. If it is absent, all default init prompts run. If it is set to an empty string, no init prompts run. Otherwise it is a comma-separated list of prompt keys.
  Rationale: This gives the requested configurability without adding database schema or UI. The empty string is useful for tests and local troubleshooting, while unknown prompt keys should fail loudly as a configuration error.
  Date/Author: 2026-04-29 / Codex

- Decision: Init threads are considered duplicates when an existing thread has `source == "init"` and the same title.
  Rationale: The title is what the reviewer sees, and using it avoids adding a migration field to persisted sessions. This makes repeated `/api/reviews` calls idempotent.
  Date/Author: 2026-04-29 / Codex

- Decision: Voice announcement suppression is implemented in the frontend announcement selector by ignoring `source == "init"` threads.
  Rationale: Manual and voice-created workbench threads should keep announcing terminal status, but init threads are background work and should stay quiet when they finish.
  Date/Author: 2026-04-29 / Codex

## Outcomes & Retrospective

The feature is implemented. `POST /api/reviews` now creates the default init threads, schedules them through the existing background worker, and avoids duplicating them on repeated loads. The init set can be narrowed or disabled with `REVIEW_ROOM_INIT_THREADS`. Frontend voice completion announcements still work for manual or voice-created threads and now intentionally ignore init threads.

## Context and Orientation

Review Room has a FastAPI backend under `server/review_room` and a React frontend under `web/src`. A `ReviewSession` is the persisted state for a loaded pull request. It includes PR metadata, changed files, draft comments, and `ReviewThread` objects. A thread represents one Codex workbench task and has a `source`, `title`, `status`, `prompt`, and final Markdown answer.

The endpoint `server/review_room/main.py:create_review` handles `POST /api/reviews`. It fetches the pull request, checks out the repository, loads any existing session from `ReviewStore`, saves the session, and returns it to the browser. The endpoint `create_thread` creates a normal user-requested thread and schedules `run_review_thread` as a FastAPI background task. `server/review_room/threads.py:run_review_thread` moves the thread through `queued`, `running`, and either `complete` or `failed`.

The frontend polls the backend while any thread is queued or running. In `web/src/App.tsx`, `nextThreadStatusAnnouncement` compares previous thread statuses with current statuses and returns a voice announcement when a queued or running thread becomes complete or failed.

## Plan of Work

Create `server/review_room/init_threads.py` with named prompt definitions and helpers. The helper will parse `REVIEW_ROOM_INIT_THREADS`, fail on unknown prompt keys, and create missing `ReviewThread` objects with `source="init"` and `status="queued"`. Each prompt will be converted into the same full review prompt used by manual and voice threads via `build_review_prompt`.

Update `server/review_room/main.py:create_review` to accept `BackgroundTasks`, ensure configured init threads exist after the session has a checked-out `repo_path`, save the session, and schedule `run_review_thread` only for the threads newly created in that request. Existing init threads are not requeued or duplicated.

Update `web/src/App.tsx:nextThreadStatusAnnouncement` so init threads never produce voice completion announcements.

Update tests. Backend tests should prove that default init threads are created and completed, repeated PR loads do not duplicate them, and `REVIEW_ROOM_INIT_THREADS` can select or disable the set. Frontend tests should prove that a manual thread completion is still announced and an init thread completion is not.

## Concrete Steps

Work from `/Users/royce/.codex/worktrees/c8e0/syd-hackathon-04-2026`.

First, edit the backend:

    server/review_room/init_threads.py
    server/review_room/main.py

Then edit tests:

    server/tests/test_main.py
    web/src/App.test.tsx

Finally, run focused validation:

    cd /Users/royce/.codex/worktrees/c8e0/syd-hackathon-04-2026/server
    uv run pytest tests/test_main.py

    cd /Users/royce/.codex/worktrees/c8e0/syd-hackathon-04-2026/web
    npm test -- App.test.tsx

The first attempted frontend command used `--runInBand`, but Vitest rejected that Jest option. The accepted command is shown above.

## Validation and Acceptance

After implementation, loading a PR through `POST /api/reviews` should return a session whose `threads` list includes five init threads by default. Each should have `source` set to `init` and one of the requested titles. In the browser, they should appear in the thread list and complete as the existing background worker finishes them. Reloading the same PR should preserve those threads without adding another copy.

When `REVIEW_ROOM_INIT_THREADS=pr-summary,bug-finder`, only `PR summary` and `Bug finder` should be created. When `REVIEW_ROOM_INIT_THREADS` is set to an empty string, no init threads should be created. If the variable contains an unknown key, the request should fail clearly rather than silently ignoring the typo.

When an init thread transitions from `running` to `complete`, `nextThreadStatusAnnouncement` should return `null`. When a manual thread makes the same transition, it should still return a spoken completion announcement.

## Idempotence and Recovery

The backend helper only appends missing init threads. Re-running `POST /api/reviews` for the same PR should refresh PR/file metadata and checkout path while keeping existing threads and comments. If a test or local run creates unwanted persisted sessions, delete the test workspace directory or use a fresh `ReviewStore` path; the code change itself does not perform destructive operations.

## Artifacts and Notes

Focused backend validation passed:

    cd /Users/royce/.codex/worktrees/c8e0/syd-hackathon-04-2026/server
    uv run pytest tests/test_main.py
    tests/test_main.py .................. [100%]
    18 passed in 0.33s

Focused frontend validation passed:

    cd /Users/royce/.codex/worktrees/c8e0/syd-hackathon-04-2026/web
    npm test -- App.test.tsx
    src/App.test.tsx (5 tests)
    5 passed

Frontend build validation passed:

    cd /Users/royce/.codex/worktrees/c8e0/syd-hackathon-04-2026/web
    npm run build
    tsc -b && vite build
    built in 4.97s

Full backend validation passed:

    cd /Users/royce/.codex/worktrees/c8e0/syd-hackathon-04-2026/server
    uv run pytest
    42 passed in 0.32s

## Interfaces and Dependencies

`server/review_room/init_threads.py` will expose:

    @dataclass(frozen=True)
    class InitThreadPrompt:
        key: str
        title: str
        utterance: str

    def configured_init_thread_prompts(raw_value: str | None) -> list[InitThreadPrompt]:
        ...

    def ensure_init_threads(session: ReviewSession, prompts: Sequence[InitThreadPrompt]) -> list[ReviewThread]:
        ...

`configured_init_thread_prompts` accepts the raw environment variable value so tests can exercise parsing without mutating global process state. `main.py` will pass `os.environ.get("REVIEW_ROOM_INIT_THREADS")`.

## Debt and Future Issues

The first version uses environment variable configuration rather than an in-app settings UI. That is enough for the current request, but a future product pass may want a per-repository or per-user configuration surface.

Revision note, 2026-04-29: Initial ExecPlan created before implementation to document the backend-owned init-thread approach and the voice announcement suppression requirement.

Revision note, 2026-04-29: Updated after implementation to record completed progress, the Vitest command correction, and passing backend/frontend validation evidence.
