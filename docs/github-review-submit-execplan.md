# GitHub Review Submission Options

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document follows `/Users/royce/.codex/.agent/PLANS.md`.

## Purpose / Big Picture

Review Room already lets a reviewer draft local inline PR comments and publish them. This change turns the PR Comments accordion into a lightweight GitHub review submission area. The reviewer can keep queued inline comments, write a top-level review discussion comment, choose comment-only / approve / request changes, and submit the whole review to GitHub. The voice agent can edit the discussion body, select the review decision, and submit when the missing details have been provided.

## Progress

- [x] (2026-04-29) Created branch `codex/github-review-submit` from `main`.
- [x] (2026-04-29) Inspected the current comment queue, GitHub client, API models, AI workbench, and voice tool registration.
- [x] (2026-04-29) Verified GitHub's pull-request review endpoint supports `COMMENT`, `APPROVE`, `REQUEST_CHANGES`, review body, and batched inline comments.
- [x] (2026-04-29) Added this ExecPlan.
- [x] (2026-04-29) Add backend models and GitHub client support for review submission.
- [x] (2026-04-29) Add persisted review submission state to sessions.
- [x] (2026-04-29) Add frontend review body and decision controls in the PR Comments accordion.
- [x] (2026-04-29) Add voice tools for review body, decision, and submission prompting.
- [x] (2026-04-29) Add backend and frontend tests.
- [x] (2026-04-29) Run server tests, web tests, and web build.

## Surprises & Discoveries

- Observation: The current backend publishes inline comments one at a time via `POST /pulls/{pull_number}/comments`.
  Evidence: `GitHubClient.create_pull_request_review_comment` posts to `/pulls/{pr.number}/comments`.
- Observation: GitHub's review endpoint can submit inline comments, a review body, and the event in one request.
  Evidence: GitHub REST docs for pull request reviews list `event` values `APPROVE`, `REQUEST_CHANGES`, and `COMMENT`, plus `body` and `comments`.
- Observation: The production web build still reports the existing Mermaid chunk-size warning.
  Evidence: `npm --prefix web run build` exits 0 with `✓ built`, then Vite prints chunk warnings for Mermaid-related assets.

## Decision Log

- Decision: Use GitHub's pull-request review endpoint for the new submit action rather than the standalone review-comment endpoint.
  Rationale: A single review maps directly to the requested UI: inline comments, discussion body, approve/request-changes, or comment-only publishing.
  Date/Author: 2026-04-29 / Codex
- Decision: Keep the existing local draft comment queue and add review submission state alongside it in the review session.
  Rationale: Draft comments are already persisted and tested; adding a small submission state keeps reload behavior and voice tools straightforward.
  Date/Author: 2026-04-29 / Codex

## Outcomes & Retrospective

The implementation is complete and validated locally. Review sessions now persist a `submission` object with body, selected event, and the last GitHub review URL. The workbench PR Comments accordion includes a discussion textarea, decision controls, and a submit button. The backend can either preserve the old inline-comment-only publish path or submit a GitHub review with inline comments, body, and `COMMENT` / `APPROVE` / `REQUEST_CHANGES`. Voice tools can set the discussion body, set the review decision, inspect submission state, and prompt for missing review details before submitting.

## Context and Orientation

Backend code lives in `server/review_room`. The relevant files are `main.py`, `github.py`, `models.py`, and `store.py`. `ReviewSession` currently persists PR metadata, changed files, threads, comments, and repository path.

Frontend code lives in `web/src`. `App.tsx` owns review state and comment mutation handlers. `AIWorkbench.tsx` renders the PR Comments accordion. `VoiceSelectionDemo.tsx` defines the voice tools and instructions. `api.ts` and `types.ts` mirror backend API shapes.

## Plan of Work

First, extend the shared data model with a `ReviewSubmission` object containing `body` and `event`, where event is `comment`, `approve`, `request_changes`, or null while unset. Store it in `ReviewSession` and include it in create/get review responses.

Next, add backend API endpoints to update the submission body and event, and replace or extend the publish endpoint so it submits a GitHub review. The request should carry comment IDs, body, and event. The GitHub client should build the review payload with `commit_id`, `event`, optional `body`, and inline comment objects using the same line/side mapping already covered by tests.

Then, update `App` and `AIWorkbench` so the PR Comments accordion includes a discussion textarea, decision controls for comment-only/approve/request changes, and a submit button. Submitting should mark publishable comments as `publishing`, call the backend, and update successful inline comments to `published`.

Finally, add voice tools to set the discussion comment, set the decision, read current submission state, and submit the GitHub review. The submit tool should return a prompt when body or decision is missing: "Are you approving or requesting changes? Also do you want to leave a discussion comment too?"

## Validation and Acceptance

Backend tests cover review payload construction, updating persisted submission state, and submitting a review with inline comments, body, and a review event. Frontend tests cover the accordion textarea, decision controls, submit button state, and voice submission prompting.

Validation run:

    cd server && uv run pytest
    npm --prefix web test -- --run
    npm --prefix web run build

Manual acceptance: load a PR, draft an inline comment, write a discussion body, choose comment-only/approve/request changes, and submit. Then verify the GitHub PR gets a review with the expected body and inline comments.

## Idempotence and Recovery

Tests are idempotent. Real GitHub submission is not idempotent, because each submit creates a review or review comments. Failed submissions should leave local drafts intact with visible errors so the reviewer can retry.
