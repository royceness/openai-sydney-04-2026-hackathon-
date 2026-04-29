# Publish Draft PR Comments to GitHub

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document follows `/Users/royce/.codex/.agent/PLANS.md`.

## Purpose / Big Picture

Review Room can already draft local pull request comments from typed or voice interactions, but those drafts disappear unless the user manually copies them to GitHub. After this change, a reviewer can draft comments in the right-hand PR Comments queue, click a publish button, and have those comments written back as GitHub pull request review comments on the selected file lines. The behavior is observable by loading a GitHub PR in Review Room, drafting a comment on a changed line, clicking the publish control, and seeing the comment appear on GitHub.

## Progress

- [x] (2026-04-29) Created a dedicated branch, `codex/pr-comments-work`, from `main`.
- [x] (2026-04-29) Inspected the current local comment queue, GitHub client, API models, tests, and diff selection code.
- [x] (2026-04-29) Added this ExecPlan to describe the implementation and validation path.
- [x] (2026-04-29) Add backend models and GitHub client support for creating PR review comments.
- [x] (2026-04-29) Add a backend publish endpoint that accepts queued draft comments and returns their GitHub URLs.
- [x] (2026-04-29) Add frontend API/types and wire `App` and `AIWorkbench` so drafts can be published from the UI.
- [x] (2026-04-29) Add backend and frontend tests that prove publishing works and failures are surfaced.
- [x] (2026-04-29) Run backend tests, frontend tests, and frontend build.
- [ ] Commit, push the branch, open a draft PR, and test publishing a comment against that PR.

## Surprises & Discoveries

- Observation: The existing `ReviewSession.comments` field exists on the server model but current frontend draft comments are maintained only in `web/src/App.tsx` local state.
  Evidence: `App` initializes `const [comments, setComments] = useState<DraftComment[]>([])` and does not call any comment API.
- Observation: GitHub's current REST guidance recommends line-based fields for pull request review comments: `line`, `side`, and optional `start_line`/`start_side`, with `position` treated as deprecated.
  Evidence: GitHub Docs search result for "Create a review comment for a pull request" states this recommendation.
- Observation: The app's production build still reports the existing large Mermaid-related chunk warning, but the build succeeds.
  Evidence: `npm run build` exits 0 and prints `✓ built`, followed by Rollup chunk-size warnings for generated assets.

## Decision Log

- Decision: Publish individual draft comments through the GitHub "create a review comment for a pull request" endpoint instead of creating a pending review.
  Rationale: The current product has a queue of standalone local drafts, not a review-submission workflow with approve/request-changes state. Publishing each draft directly matches the existing UI and gives immediate URLs for each comment.
  Date/Author: 2026-04-29 / Codex
- Decision: Use the PR head SHA as the default `commit_id`, while preserving `CodeSelection.commitSha` if a future selection supplies it.
  Rationale: The app already stores `pr.head_sha`, and the current diff selection code does not attach per-line commit SHAs.
  Date/Author: 2026-04-29 / Codex
- Decision: Fail the publish request if GitHub rejects any comment rather than silently skipping or falling back.
  Rationale: The repository instructions prefer fail-fast behavior and no swallowed errors. This also avoids reporting that comments were published when GitHub did not accept them.
  Date/Author: 2026-04-29 / Codex

## Outcomes & Retrospective

The code implementation is complete and validated locally. The backend now creates GitHub pull request review comments, the frontend can publish queued drafts, and tests cover successful publishing plus failure display. The remaining outcome is the live GitHub test on this branch's draft PR.

## Context and Orientation

The backend is a FastAPI app in `server/review_room/main.py`. It stores review sessions with `ReviewStore`, fetches pull request metadata with `GitHubClient` in `server/review_room/github.py`, and defines API data shapes in `server/review_room/models.py`. A `CodeSelection` is a file path plus old/new side and line range selected in the diff.

The frontend is a React app under `web/src`. `web/src/App.tsx` owns the loaded review, active file, selected diff lines, and local draft comment state. `web/src/components/AIWorkbench.tsx` renders the PR Comments queue. `web/src/components/VoiceSelectionDemo.tsx` can create, edit, and delete local draft comments by calling handlers passed from `App`. `web/src/api.ts` contains fetch helpers and `web/src/types.ts` contains matching TypeScript types.

GitHub pull request review comments are line-level comments attached to a changed file in a pull request diff. The GitHub REST API needs the repository owner, repository name, pull request number, comment body, file path, commit SHA, and line information. In this project those values come from `ReviewSession.pr`, the draft comment's `context`, and the current pull request's head SHA.

## Plan of Work

First, extend `server/review_room/models.py` with request and response models for publishing comments. The request should carry a list of draft comments with IDs, bodies, and `CodeSelection` contexts. The response should return comments with the same local IDs, status `published`, and the GitHub HTML URL.

Next, add a `GitHubClient.create_pull_request_review_comment` method in `server/review_room/github.py`. It should build the REST request body using `body`, `commit_id`, `path`, `side`, `line`, and for ranges `start_line` and `start_side`. It should map `CodeSelection.side` values to GitHub's `RIGHT` for new-side comments and `LEFT` for old-side comments. If line numbers are missing, it should raise a clear error instead of sending an invalid GitHub request.

Then, add `POST /api/reviews/{review_id}/comments/publish` in `server/review_room/main.py`. The endpoint should load the session, validate each comment path is in the changed file list, call the GitHub client for each draft, update the saved session comments to published records, and return the published comments. If GitHub returns an error, it should propagate as an HTTP error and leave the frontend able to show the failure.

On the frontend, add `publishComments` to `web/src/api.ts` and matching types to `web/src/types.ts`. Update `App` to pass an `onPublishComments` handler into `AIWorkbench`. That handler should send only draft comments to the backend, mark them as publishing while the request is in flight, update successful drafts to `published` with GitHub URLs, and show errors in the workbench when publishing fails.

Finally, update `AIWorkbench` so the PR Comments panel has a clear publish button when draft comments exist, disables it while publishing, and renders published comments with a GitHub link. Add tests in `server/tests/test_main.py`, `server/tests/test_github.py`, `web/src/App.test.tsx`, and `web/src/components/AIWorkbench.test.tsx`.

## Concrete Steps

Run these commands from `/Users/royce/.codex/worktrees/869d/syd-hackathon-04-2026` while implementing:

    git status --short --branch
    cd server && uv run pytest
    cd ../web && npm test -- --run
    npm run build

After the implementation is committed, publish the test branch:

    git push -u origin codex/pr-comments-work
    gh pr create --draft --fill --head codex/pr-comments-work

Then load the created pull request in Review Room and test that a draft comment can be published to GitHub.

## Validation and Acceptance

Backend acceptance: `server` tests pass and include coverage that a publish request calls GitHub with the expected REST payload for a single-line and range comment. A request for an unchanged or unknown file returns an error instead of posting. This has been verified with `uv run pytest`, which reported 36 passed.

Frontend acceptance: `web` tests pass and include coverage that a draft comment can be published, the publish button disables when no drafts remain, a returned GitHub URL is rendered for the published comment, and failures remain visible for retry. This has been verified with `npm test -- --run`, which reported 42 passed. The production build has been verified with `npm run build`.

Manual acceptance: after pushing this branch and opening a draft PR, load that PR in Review Room, draft a comment on a changed line, click publish, and verify the comment appears on the GitHub PR conversation or files view.

## Idempotence and Recovery

The implementation is additive. Tests can be run repeatedly. Publishing comments to a real GitHub PR is not idempotent because each click creates a real comment; use a deliberately small test comment on this branch's draft PR and delete or resolve it manually after testing if needed. If a publish request fails, the frontend should keep the comments available for retry and display the error.

## Artifacts and Notes

Relevant current files:

    server/review_room/github.py
    server/review_room/main.py
    server/review_room/models.py
    web/src/App.tsx
    web/src/api.ts
    web/src/components/AIWorkbench.tsx
    web/src/types.ts

## Interfaces and Dependencies

Backend model names to add:

    PublishCommentRequest
    PublishCommentsRequest
    PublishedComment
    PublishCommentsResponse

Backend client method to add:

    GitHubClient.create_pull_request_review_comment(session: ReviewSession, comment: PublishCommentRequest) -> PublishedComment

Frontend API helper to add:

    publishComments({ reviewId, comments }): Promise<PublishCommentsResponse>

## Debt and Future Issues

No future issues have been identified yet.

Revision note, 2026-04-29: Updated progress and validation after implementing the backend publish endpoint, frontend publish UI, and tests. The live GitHub PR test remains.
