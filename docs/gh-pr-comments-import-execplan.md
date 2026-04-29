# Import and edit GitHub PR line comments

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The controlling instructions for this plan are in `/Users/royce/.codex/.agent/PLANS.md`. This document is self-contained so a new contributor can continue from only this file and the current working tree.

## Purpose / Big Picture

Review Room can already load a GitHub pull request, render changed files, show unified diffs, and create Codex-backed workbench threads. After this change, loading a PR also imports existing GitHub pull request review comments, the diff viewer visibly marks any line that has either an imported GitHub comment or a local draft/enqueued comment, and clicking a comment marker expands the comment text in the diff. A reviewer can edit a comment directly inside the diff viewer; voice and other selection flows can refer to the active comment because the app keeps it as explicit UI state.

## Progress

- [x] (2026-04-29T04:40:22Z) Read the local planning instructions and current backend/frontend code paths for PR loading, persisted sessions, diff rendering, voice tools, and workbench threads.
- [x] (2026-04-29T04:40:22Z) Created this ExecPlan for the GitHub PR comments import and diff editor work.
- [x] (2026-04-29T04:44:44Z) Implemented backend comment import, persistence merge, and a local comment update endpoint.
- [x] (2026-04-29T04:44:44Z) Implemented frontend comment types, API calls, diff markers, expanded comment text, and in-diff editing.
- [x] (2026-04-29T04:44:44Z) Added backend and frontend tests for imported comments, merged persisted comments, markers, expansion, and editing.
- [x] (2026-04-29T04:46:25Z) Ran the server test suite, web test suite, and frontend build successfully.

## Surprises & Discoveries

- Observation: `ReviewSession.comments` exists but the frontend currently types it as `unknown[]`, and no component reads or writes comments.
  Evidence: `rg -n "DraftComment|comments|comment|enqueue|draft|github_comment" server web/src` only found the model placeholder and preservation of existing comments during `POST /api/reviews`.

- Observation: Installing frontend dependencies with the current npm version changed optional package `libc` metadata in `web/package-lock.json` without changing project dependencies.
  Evidence: `git diff -- web/package-lock.json` showed only optional package metadata movement; the lockfile was restored so this feature does not include install-time churn.

## Decision Log

- Decision: Treat GitHub-imported comments and local draft/enqueued comments as one persisted comment type in `ReviewSession.comments`.
  Rationale: The diff viewer only needs to know which comments attach to each file/side/line and whether they are imported, draft, or enqueued. A single shape avoids parallel UI paths and lets editing work the same way for imported and local comments.
  Date/Author: 2026-04-29 / Codex

- Decision: Import GitHub pull request review comments from `GET /repos/{owner}/{repo}/pulls/{number}/comments`, not issue-level PR conversation comments.
  Rationale: The user asked for the diff viewer to show lines that have PR comments. GitHub's review comments endpoint returns file path, side, line, and hunk data needed to attach comments to diff rows; issue comments do not.
  Date/Author: 2026-04-29 / Codex

- Decision: Editing a comment in this slice updates Review Room's local persisted copy, not GitHub.
  Rationale: The current app has no publish/write-back flow or GitHub mutation endpoint. Local editing makes the diff editor behavior real and testable while keeping GitHub write-back as a later explicit feature.
  Date/Author: 2026-04-29 / Codex

- Decision: When an imported GitHub comment is edited locally, change its status to `draft` and preserve that local edited copy on later PR loads.
  Rationale: Review Room loads GitHub data on page bootstrap. Without this rule, a reviewer could edit an imported comment and lose that local draft on the next reload. Untouched imported comments still refresh from GitHub.
  Date/Author: 2026-04-29 / Codex

## Outcomes & Retrospective

Implemented the full slice. Loading a PR now fetches GitHub review comments from the pull request review comments API, stores them in the review session, and returns them to the frontend. Diff rows with imported or local comments are highlighted and show a comment marker. Clicking the marker expands the comment inline with author, status, source link when present, and body text. The inline Edit flow saves through a backend patch endpoint and keeps locally edited imported comments as drafts across subsequent PR loads. Remaining work is GitHub write-back and publishing queued drafts, which is intentionally outside this plan.

## Context and Orientation

The backend lives in `server/review_room`. `server/review_room/main.py` defines FastAPI HTTP endpoints. `server/review_room/github.py` calls GitHub and maps API JSON into Pydantic models. `server/review_room/models.py` contains the shared backend data shapes. `server/review_room/store.py` persists one `ReviewSession` JSON file per pull request under `.review-room/sessions/`.

The frontend lives in `web/src`. `web/src/App.tsx` owns the loaded review state, selected file, active diff, and selection state. `web/src/api.ts` wraps HTTP calls. `web/src/types.ts` mirrors backend JSON types. `web/src/components/DiffPane.tsx` parses a unified diff and renders rows. `web/src/lib/diff.ts` converts GitHub patch text into rows with old and new line numbers.

A "pull request review comment" is a GitHub comment attached to a file line in a PR review. A "draft" or "enqueued" comment is a Review Room local comment that has not been published to GitHub yet. A "comment marker" is the button rendered next to a diff line when at least one comment belongs to that row. A "comment context" is the file path, side (`old` or `new`), start line, end line, selected text, and optional diff hunk that identify where the comment belongs.

## Plan of Work

First, extend `server/review_room/models.py` so comments have enough metadata for both GitHub and local sources. The comment model should include `id`, `source`, `body`, `context`, `status`, optional `author`, optional GitHub numeric ID, optional GitHub URL, and timestamps. Keep existing `DraftComment` session data loadable by providing defaults for new fields.

Second, update `server/review_room/github.py`. `GitHubClient.fetch_pull_request` should fetch PR metadata, changed files, and review comments in one call. It should page through `/pulls/{number}/comments`, map each GitHub review comment into the shared comment model, and include path, line range, side, body, author, hunk, commit SHA, and GitHub URL. A comment should attach to `line` when GitHub returns a current line, and fall back to `original_line` when only the original line is available. Side should be `old` when GitHub says `LEFT`, otherwise `new`.

Third, update `server/review_room/main.py` so `POST /api/reviews` saves imported GitHub comments while preserving local comments that are not imported from GitHub. When the same GitHub comment ID is already present and the existing copy is still untouched with status `imported`, replace it with the newly imported version so the local session reflects the latest GitHub body and location. When the existing copy has been locally edited and has status `draft`, preserve it. Add `PATCH /api/reviews/{review_id}/comments/{comment_id}` that updates the local persisted body for a comment and returns the updated comment.

Fourth, update frontend types and API wrappers for `ReviewComment` and the patch endpoint. `App.tsx` should store `comments` alongside files and threads, pass comments for the active file into `DiffPane`, and update state when a comment is edited. It should also keep the active comment ID so a voice or selection flow can refer to the currently expanded comment.

Fifth, update `DiffPane.tsx`. For each diff row, find comments whose context matches the active file and whose start/end range includes the row's old or new line on the appropriate side. Render a stable marker button in a dedicated narrow column. Clicking the marker expands a row below the code line with author/status/source and the comment body. In expanded state, an Edit button should switch to a textarea plus Save/Cancel buttons; Save calls the update callback. Existing browser text selection behavior should keep working.

Sixth, add tests. Backend tests should verify GitHub comment mapping, PR load importing comments, preserving local draft comments across reload, replacing matching imported GitHub comments, and patching a comment body. Frontend tests should verify that `DiffPane` marks a commented line, expands the comment body on click, and saves an edited body through the callback.

## Concrete Steps

Run backend tests from the repository root with:

    npm run test:server

Run frontend tests from the repository root with:

    npm run test:web

Run the frontend build from the repository root with:

    npm --prefix web run build

For manual development, start the backend and frontend:

    npm run dev:server
    npm run dev:web

Current validation results:

    npm run test:server
    34 passed in 0.26s

    npm run test:web
    Test Files  8 passed (8)
    Tests  24 passed (24)

    npm --prefix web run build
    ✓ built in 4.42s

Then open `http://localhost:5173/?pr=https%3A%2F%2Fgithub.com%2Fowner%2Frepo%2Fpull%2F123` with a PR that has line review comments. The expected behavior is that affected diff lines show comment markers, clicking a marker expands text, editing and saving changes the text without reloading the page, and reloading the same review keeps the edited local body as a draft.

## Validation and Acceptance

The feature is accepted when loading a pull request imports GitHub review comments into `ReviewSession.comments`, the diff viewer displays a marker on every line that has an imported or local comment, clicking the marker expands readable comment text, and editing a comment in the diff persists through `GET /api/reviews/{review_id}`.

Automated acceptance is the backend test suite, frontend test suite, and frontend production build all passing. The new backend tests must fail before the backend import/update changes and pass after. The new frontend tests must fail before the diff marker/editor changes and pass after.

## Idempotence and Recovery

Re-running `POST /api/reviews` for the same PR is safe. Imported GitHub comments are keyed by `github_comment_id`, so re-import updates untouched imported records rather than duplicating them. Local comments without a GitHub comment ID are preserved, and locally edited imported comments are preserved as drafts. If a local session becomes confusing during manual testing, stop the servers and delete the relevant JSON file under `.review-room/sessions/`; the app will recreate it on the next PR load.

The comment edit endpoint only mutates the local session JSON file. It does not write to GitHub, so it can be tested without changing a real PR.

## Artifacts and Notes

The current backend shape before this plan:

    class DraftComment(BaseModel):
        id: str
        body: str
        context: CodeSelection
        status: Literal["draft", "published", "failed"] = "draft"
        github_comment_url: str | None = None

The current frontend shape before this plan:

    export type ReviewSession = {
      ...
      comments: unknown[];
    };

## Interfaces and Dependencies

The backend continues to use FastAPI, Pydantic, and httpx. The new GitHub API endpoint is `GET https://api.github.com/repos/{owner}/{repo}/pulls/{number}/comments` with `per_page=100` pagination and the existing GitHub headers.

`server/review_room/models.py` must expose a comment model with this effective JSON shape:

    {
      "id": "gh_comment_123456",
      "source": "github",
      "body": "Comment text",
      "context": {
        "filePath": "src/foo.ts",
        "side": "new",
        "startLine": 42,
        "endLine": 42,
        "selectedText": "",
        "diffHunk": "@@ ...",
        "commitSha": "abc123"
      },
      "status": "imported",
      "author": "octocat",
      "github_comment_id": 123456,
      "github_comment_url": "https://github.com/...",
      "created_at": "...",
      "updated_at": "..."
    }

`web/src/components/DiffPane.tsx` should receive `comments`, `activeCommentId`, `onActiveCommentChange`, and `onUpdateComment` props. `onUpdateComment` takes a comment ID and next body and returns a promise that resolves with the updated comment.

## Debt and Future Issues

GitHub write-back for edited imported comments and publishing local draft/enqueued comments is intentionally out of scope for this plan. No GitHub issue is created from this environment during the implementation because the project currently tracks this work in checked-in ExecPlans.

Revision note, 2026-04-29: Created the initial living ExecPlan after reading the current code and finding the comment model is only a placeholder.

Revision note, 2026-04-29: Completed the import, marker, expansion, and local editing implementation; recorded the validation commands and the decision to preserve locally edited imported comments as drafts.
