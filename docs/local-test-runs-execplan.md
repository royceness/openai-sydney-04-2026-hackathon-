# Local Test Runs ExecPlan

## Purpose

Add a Review Room workflow that runs one explicitly configured test command inside the checked-out pull request worktree, persists the result in the review session, and displays it in the AI Workbench. This gives reviewers a concrete path from browser action to local repository verification.

## Plan

- Add a `TestRun` session model with status, command, exit code, stdout, stderr, error, and timestamps.
- Add a backend test runner that reads `REVIEW_ROOM_TEST_COMMAND`, splits it with `shlex`, runs it in `session.repo_path`, and saves `queued`, `running`, `passed`, or `failed`.
- Add `POST /api/reviews/{review_id}/test-runs` to create and schedule a test run.
- Include `test_runs` in review create/get responses.
- Add frontend API/types/state for test runs.
- Add AI Workbench controls to start a run and inspect recent output.
- Extend polling while test runs are queued or running.
- Add focused backend and frontend tests, then run the relevant suites.

## Acceptance

Loading a review with `REVIEW_ROOM_TEST_COMMAND` configured shows a Run tests button. Clicking it creates a persisted test run, executes the configured command in the PR worktree, refreshes the session while running, and shows pass/fail output in the workbench.
