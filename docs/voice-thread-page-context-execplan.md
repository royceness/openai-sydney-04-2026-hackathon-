# Voice-Aware Codex Thread Follow-Ups

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The controlling instructions for this plan are in `/Users/royce/.codex/.agent/PLANS.md`. This repository does not contain its own copy of that file, so this plan repeats the implementation context needed to continue work without relying on prior conversation.

## Purpose / Big Picture

Review Room already has voice commands that can show selected diff lines, navigate files, and start new Codex-backed workbench threads. The user wants to speak about what is visible in a Codex thread and ask follow-up questions like "what test would catch this?" without starting an unrelated new thread. After this change, clicking a workbench thread marks it as the voice context, and a spoken follow-up is sent as another turn to the same Codex app-server thread. If no Codex thread is focused, the voice UI prompts the reviewer to click the relevant thread.

This plan intentionally does not implement PR drafting or GitHub comment publishing. Another session owns that work.

## Progress

- [x] (2026-04-29T02:56:06Z) Created branch `codex/voice-thread-page-context` from the detached worktree state.
- [x] (2026-04-29T02:56:06Z) Read the existing voice component, workbench thread UI, backend thread endpoint, prompt construction, and existing tests.
- [x] (2026-04-29T02:56:06Z) Created an initial draft-comment-oriented plan after the first request.
- [x] (2026-04-29T03:10:00Z) Pivoted after user clarification: removed draft-comment API/test edits and changed scope to focused Codex thread follow-ups.
- [x] (2026-04-29T03:10:00Z) Added backend follow-up request/response models, a Codex agent `continue_thread` method, and a follow-up endpoint that queues another turn on the same Codex thread.
- [x] (2026-04-29T03:10:00Z) Added frontend active-thread state, workbench voice-context marking, manual follow-up form, follow-up API helper, and voice tools for page-context snapshots and focused-thread follow-ups.
- [x] (2026-04-29T03:03:17Z) Ran backend tests: `30 passed in 1.01s`.
- [x] (2026-04-29T03:03:17Z) Ran frontend tests after installing locked dependencies: `25 passed`.
- [x] (2026-04-29T03:03:17Z) Ran frontend production build successfully with Vite.
- [x] (2026-04-29T03:03:17Z) Updated outcomes with final validation results.
- [x] (2026-04-29T03:07:52Z) Ran an in-app browser smoke test without voice against `octocat/Hello-World#1`, using a seeded completed workbench thread to verify the focused thread marker and follow-up form.

## Surprises & Discoveries

- Observation: The voice component reads only app state passed through narrow tools; it has no general unrestricted DOM-reading or browser automation capability.
  Evidence: `web/src/components/VoiceSelectionDemo.tsx` registers app-owned tools, and the Realtime session can only call those tools.

- Observation: A persisted workbench thread stores `codex_thread_id` after the first Codex turn completes.
  Evidence: `server/review_room/threads.py` sets `thread.codex_thread_id = result.codex_thread_id` when `run_review_thread` finishes.

- Observation: The existing Codex app-server adapter already has all lower-level pieces needed for follow-ups.
  Evidence: `server/review_room/agent.py` already starts a persistent app-server process and has `_turn_start_params(codex_thread_id, repo_path, prompt)`, so a follow-up can reuse the saved thread ID and call another `turn/start`.

## Decision Log

- Decision: Expose page reading through an explicit `get_review_room_context` voice tool rather than giving the voice agent broad browser or DOM access.
  Rationale: The existing voice integration is built around app-owned tools. A structured snapshot lets the voice model reason over selected text and the focused thread while keeping the UI responsible for state.
  Date/Author: 2026-04-29 / Codex

- Decision: Do not touch PR drafting in this branch.
  Rationale: The user clarified that PR drafting is being implemented in another Codex session. This branch now focuses only on follow-up questions.
  Date/Author: 2026-04-29 / Codex

- Decision: A clicked workbench thread is the focused voice context, and follow-ups continue that thread instead of creating a new Review Room thread.
  Rationale: This matches the spoken workflow: "this issue" or "that thread" should refer to the visible Codex thread the reviewer clicked.
  Date/Author: 2026-04-29 / Codex

- Decision: Refuse a follow-up when the target workbench thread has no `codex_thread_id` or is still running.
  Rationale: Without a Codex thread ID, there is no existing Codex conversation to continue. If the thread is already running, another turn would race with the current one.
  Date/Author: 2026-04-29 / Codex

## Outcomes & Retrospective

The focused-thread follow-up slice is implemented and validated. A reviewer can click a completed Codex workbench thread, use the inline follow-up box or ask a follow-up by voice, and the same workbench thread is queued for another Codex turn. The answer streams into the existing thread markdown under a `### Follow-up` section. If no thread is focused, the voice popup tells the reviewer to click the relevant Codex thread.

Validation completed on 2026-04-29:

    server: uv run pytest
    result: 30 passed in 1.01s

    web: npm test -- --run
    result: 7 files passed, 25 tests passed

    web: npm run build
    result: Vite build completed successfully

Additional in-app browser smoke validation completed on 2026-04-29: started the FastAPI backend on `127.0.0.1:8033` and Vite on `127.0.0.1:5193`, loaded `octocat/Hello-World#1`, seeded one completed local workbench thread in the temporary smoke-test session, clicked that thread, and observed the right pane showing `voice context`, the completed thread body, the `Ask a follow-up...` field, and an enabled `Follow up` button after typing a question. This tested the UI behavior without starting microphone capture or invoking the voice runtime.

## Context and Orientation

The application has a FastAPI backend under `server/review_room/` and a Vite React frontend under `web/src/`.

`server/review_room/main.py` defines HTTP endpoints. It can create a review from a GitHub PR URL, serve the review session, serve per-file diffs, and create Codex-backed workbench threads. This plan adds `POST /api/reviews/{review_id}/threads/{thread_id}/followups`.

`server/review_room/agent.py` adapts the local `codex app-server`. `run_thread` starts a new Codex thread and runs the first turn. The new `continue_thread` method runs another turn against an existing `codex_thread_id`.

`server/review_room/threads.py` owns persisted thread lifecycle. The new follow-up runner appends a Markdown heading with the reviewer question, streams answer deltas into the existing thread markdown, and marks the same thread complete when the follow-up finishes.

`web/src/App.tsx` owns the current loaded review session, active file, selected diff code, and now the active workbench thread ID. It passes active-thread state into `AIWorkbench` and `VoiceSelectionDemo`.

`web/src/components/AIWorkbench.tsx` renders workbench threads. Clicking a thread calls `onActivateThread(thread.id)` and marks it as voice context. When the active thread is open, it also shows a small follow-up form that posts to the same backend endpoint.

`web/src/components/VoiceSelectionDemo.tsx` creates a `realtime-voice-component` controller. The controller can call only registered tools. This plan adds `get_review_room_context` and `ask_thread_follow_up` tools.

## Plan of Work

First, add backend support for follow-up turns. Add `CreateFollowUpRequest` and `CreateFollowUpResponse` in `server/review_room/models.py`. Add `continue_thread` to the `CodeAgent` protocol and `CodexAppServerAgent`. Add `build_follow_up_prompt` in `server/review_room/prompting.py`. Add `run_thread_follow_up` in `server/review_room/threads.py`. Add `POST /api/reviews/{review_id}/threads/{thread_id}/followups` in `server/review_room/main.py`.

Second, add backend tests. Extend `server/tests/test_main.py` so the fake agent implements `continue_thread`. Add a test that creates a review, creates a workbench thread, posts a follow-up, and verifies the same thread markdown contains the original answer, a `### Follow-up` heading, the follow-up question, and the follow-up answer.

Third, add frontend API and active-thread state. Add `CreateFollowUpResponse` in `web/src/types.ts` and `createFollowUp` in `web/src/api.ts`. In `web/src/App.tsx`, track `activeThreadId`, implement `handleFollowUp`, pass active-thread props to `PullRequestPanel` and `AIWorkbench`, and clear active thread when a new review loads.

Fourth, update the workbench UI. In `web/src/components/AIWorkbench.tsx`, clicking a thread marks it as the voice context. The active thread gets a visible "voice context" marker and a follow-up form. The form is disabled while that thread is queued or running.

Fifth, update voice tools. In `web/src/components/VoiceSelectionDemo.tsx`, add a context snapshot builder that returns selected diff code, selected page text from `window.getSelection()`, focused thread summary, and compact thread summaries. Add `ask_thread_follow_up`, which resolves the requested thread ID or active thread ID, prompts when no target is available, and calls `onFollowUp` when a completed Codex thread is focused.

Sixth, add frontend tests. Extend `VoiceSelectionDemo.test.tsx` for context snapshots, follow-up target resolution, follow-up tool execution, and ambiguous target prompting. Extend `AIWorkbench.test.tsx` for voice-context marking and follow-up form submission.

## Concrete Steps

Run these commands from the repository root unless stated otherwise:

    cd /Users/royce/.codex/worktrees/869d/syd-hackathon-04-2026
    git status --short --branch

Run backend tests:

    cd /Users/royce/.codex/worktrees/869d/syd-hackathon-04-2026/server
    uv run pytest

Run frontend tests:

    cd /Users/royce/.codex/worktrees/869d/syd-hackathon-04-2026/web
    npm test -- --run

Run the frontend production build:

    cd /Users/royce/.codex/worktrees/869d/syd-hackathon-04-2026/web
    npm run build

## Validation and Acceptance

The backend is accepted when the follow-up test proves that a follow-up continues the same Codex thread ID and appends the answer to the existing Review Room thread markdown.

The frontend is accepted when tests prove that clicking a workbench thread marks it as voice context, the inline follow-up form calls the follow-up handler, the voice context snapshot includes the focused thread, and the voice follow-up tool either starts a follow-up or prompts the reviewer to click a relevant thread.

Manual acceptance after starting the app is: open a PR, create a Codex thread, wait for it to complete, click that thread in the workbench, then ask a follow-up by voice or use the inline follow-up box. The same workbench thread should move through queued/running and then append a `### Follow-up` section with the new answer.

## Idempotence and Recovery

The follow-up endpoint mutates the existing local Review Room thread by appending Markdown. Repeating a follow-up intentionally appends another follow-up section. If manual testing creates unwanted conversation history, remove the relevant session JSON under `.review-room/sessions/` or reload a fresh PR session.

The code fails visibly when a follow-up cannot be sent: the backend returns `409` if the target thread is still running or lacks a Codex thread ID, and the voice UI shows a prompt if no focused thread exists.

## Artifacts and Notes

Initial branch creation:

    Switched to a new branch 'codex/voice-thread-page-context'

Important source files changed by this plan:

    server/review_room/agent.py
    server/review_room/main.py
    server/review_room/models.py
    server/review_room/prompting.py
    server/review_room/threads.py
    server/tests/test_main.py
    web/src/App.tsx
    web/src/api.ts
    web/src/types.ts
    web/src/components/AIWorkbench.tsx
    web/src/components/AIWorkbench.test.tsx
    web/src/components/PullRequestPanel.tsx
    web/src/components/PullRequestPanel.test.tsx
    web/src/components/VoiceSelectionDemo.tsx
    web/src/components/VoiceSelectionDemo.test.tsx

## Interfaces and Dependencies

Backend endpoint:

    POST /api/reviews/{review_id}/threads/{thread_id}/followups
    request body: {"source": "voice" | "manual", "utterance": string}
    response body: {"thread_id": string, "status": "queued" | "running" | "complete" | "failed"}

Frontend `VoiceSelectionDemo` accepts:

    threads: ReviewThread[]
    activeThreadId: string | null
    onFollowUp: (threadId: string, utterance: string) => Promise<void>

The voice tools remain narrow app-owned functions. `get_review_room_context` reads current app state and selected browser text. `ask_thread_follow_up` posts a question only after resolving a completed focused Codex thread.

## Debt and Future Issues

This plan does not publish GitHub comments or integrate with any future PR drafting workflow. When PR drafting lands, voice commands that explicitly say "raise a PR comment" can be routed to that separate capability while follow-up questions continue to use this thread-continuation path.

Revision note, 2026-04-29: Replaced the initial draft-comment plan after the user clarified another session owns PR drafting. The current plan focuses only on reading structured page/thread context and posting follow-up questions to focused Codex threads.

Revision note, 2026-04-29: Completed the focused-thread follow-up implementation and recorded backend test, frontend test, and frontend build results.

Revision note, 2026-04-29: Added the no-voice in-app browser smoke-test result after the user asked whether the UI had been tested in the app browser.
