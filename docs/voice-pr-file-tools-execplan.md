# Voice Tools for Reading PR Files

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The controlling instructions for this plan are in `/Users/royce/.codex/.agent/PLANS.md`. This repository does not contain its own copy of that file, so this plan repeats the implementation context needed to continue work without relying on prior conversation.

## Purpose / Big Picture

The voice agent can currently read selected diff context and focused workbench thread context, but it cannot inspect the PR's changed files beyond what the user selected. After this change, the voice agent will have explicit app-owned tools to list changed PR files, summarize changed line ranges from patches, and fetch checked-out PR file text by line range with optional surrounding context. This lets a spoken request like "look around the changed lines in the auth file" first discover the changed ranges and then fetch nearby source text without relying on unrestricted browser or DOM access.

## Progress

- [x] (2026-04-29T03:17:52Z) Created branch `codex/voice-pr-file-tools` from the updated `main` ref in the clean 869d worktree.
- [x] (2026-04-29T03:17:52Z) Inspected existing backend review/file endpoints, frontend voice tools, diff parser, and tests.
- [x] (2026-04-29T03:17:52Z) Created this ExecPlan for the PR file-reading tools.
- [x] (2026-04-29T03:22:04Z) Added backend checked-out file range endpoint and tests.
- [x] (2026-04-29T03:22:04Z) Added frontend file-content API/types.
- [x] (2026-04-29T03:22:04Z) Added changed-line summary helpers and voice tools for listing files, summarizing changed lines, and reading file ranges.
- [x] (2026-04-29T03:22:04Z) Ran backend tests: `32 passed`.
- [x] (2026-04-29T03:22:04Z) Ran frontend tests: `31 passed`.
- [x] (2026-04-29T03:22:04Z) Ran frontend production build successfully.

## Surprises & Discoveries

- Observation: The frontend already has enough changed-file metadata to list PR files and enough patches to summarize changed ranges without another backend call.
  Evidence: `ChangedFile` in `web/src/types.ts` includes `path`, `status`, additions/deletions, previous path, and optional `patch`.

- Observation: The backend checks out PR heads locally during review creation, so file range reads should use that checkout instead of GitHub APIs.
  Evidence: `server/review_room/main.py` saves `repo_path=str(repo_path)` on each `ReviewSession` after `checkout.checkout_pull_request`.

## Decision Log

- Decision: Restrict file reads to changed files listed in the review session.
  Rationale: The user's requested tools are for the files in the PR. Restricting to changed files gives the voice agent enough context for review workflows without opening arbitrary repository reads through this endpoint.
  Date/Author: 2026-04-29 / Codex

- Decision: Implement changed-line summaries on the frontend from `ChangedFile.patch`.
  Rationale: The patch is already in app state and the voice tool needs a compact summary before deciding what surrounding text to fetch.
  Date/Author: 2026-04-29 / Codex

- Decision: Fetch source text through a backend line-range endpoint backed by the local checkout.
  Rationale: The frontend should not have filesystem access. The backend already knows the checked-out PR worktree and can enforce path and changed-file constraints.
  Date/Author: 2026-04-29 / Codex

## Outcomes & Retrospective

Implemented and validated. Voice can call a list-files tool, inspect changed line ranges from loaded patches, then call a read-file-range tool to retrieve exact surrounding text from the checked-out PR file.

Validation completed on 2026-04-29:

    server: uv run pytest
    result: 32 passed

    web: npm test -- --run
    result: 7 files passed, 31 tests passed

    web: npm run build
    result: Vite build completed successfully

## Context and Orientation

The backend lives under `server/review_room/`. `main.py` defines FastAPI routes. `models.py` defines response models. `ReviewSession.repo_path` points at the checked-out PR worktree. The existing diff route returns GitHub's patch for a changed file.

The frontend lives under `web/src/`. `VoiceSelectionDemo.tsx` owns the Realtime voice controller and all voice tools. `api.ts` contains fetch helpers. `types.ts` contains TypeScript shapes shared by components. `lib/diff.ts` parses unified patches into line records, and this plan can reuse or mirror that logic to summarize changed ranges.

## Plan of Work

First, add a backend `FileContentResponse` model in `server/review_room/models.py`. It should include `file_path`, `start_line`, `end_line`, `total_lines`, and `content`.

Second, add `GET /api/reviews/{review_id}/files/{file_path:path}/content` in `server/review_room/main.py`. It accepts optional `start_line`, optional `end_line`, and `context` query parameters. It loads the review session, verifies the file is one of `session.files`, verifies `session.repo_path` exists, resolves the path under the repo root to block traversal, reads the file as UTF-8 text, expands the requested range by `context` lines, clamps to valid line bounds, and returns inclusive one-based line numbers plus content.

Third, add backend tests in `server/tests/test_main.py` for reading a range with surrounding context and for rejecting an unlisted file.

Fourth, add frontend types and API helper. Add `FileContentResponse` in `web/src/types.ts` and `getFileContent` in `web/src/api.ts`.

Fifth, add helpers and voice tools in `web/src/components/VoiceSelectionDemo.tsx`. Add `summarizeChangedLines(files)` to group added, deleted, and touched new-side line ranges from patches. Add voice tools:

    list_pr_files
    summarize_changed_lines
    read_pr_file_range

`list_pr_files` returns changed file metadata. `summarize_changed_lines` returns compact ranges for all files or a requested file. `read_pr_file_range` resolves a filename/path against changed files and calls `getFileContent` with `startLine`, `endLine`, and optional `contextLines`.

Sixth, update `VoiceSelectionDemo.test.tsx` to cover the new helpers and tool execution.

## Concrete Steps

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

Backend acceptance: tests prove a changed file can be read by line range with context from the checked-out PR repo, and an unlisted file is rejected.

Frontend acceptance: tests prove the voice controller registers the new file tools, changed line summaries are derived correctly from patches, and the read-range voice tool calls the API helper and displays returned content.

Manual acceptance: load a PR, start voice, ask for the changed files or changed lines, and then ask for surrounding text around a changed range. The voice popup should show the structured result without requiring the user to select code first.

## Idempotence and Recovery

The new API is read-only. It does not mutate session JSON, the repo checkout, GitHub, or local files. Re-running tests and browser smoke checks is safe.

## Artifacts and Notes

Initial branch creation:

    Switched to a new branch 'codex/voice-pr-file-tools'

Important files expected to change:

    server/review_room/main.py
    server/review_room/models.py
    server/tests/test_main.py
    web/src/api.ts
    web/src/types.ts
    web/src/components/VoiceSelectionDemo.tsx
    web/src/components/VoiceSelectionDemo.test.tsx

## Interfaces and Dependencies

Backend endpoint:

    GET /api/reviews/{review_id}/files/{file_path:path}/content?start_line=10&end_line=20&context=5

Frontend voice tools:

    list_pr_files()
    summarize_changed_lines({ filePath?: string })
    read_pr_file_range({ filePath: string, startLine?: number, endLine?: number, contextLines?: number })

## Debt and Future Issues

The read endpoint is intentionally restricted to changed files. If future review workflows need arbitrary repository file reads, add a separate explicitly named tool with its own authorization and UX constraints.

Revision note, 2026-04-29: Created the initial plan after the user requested voice tools for listing PR files, summarizing changed lines, and reading surrounding source text by line range.

Revision note, 2026-04-29: Completed the implementation and recorded backend test, frontend test, and frontend build results.
