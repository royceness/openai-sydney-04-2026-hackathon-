import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangedFile, CodeSelection, DraftComment, PullRequestInfo, ReviewSubmission, ReviewThread } from "./types";

const pr: PullRequestInfo = {
  owner: "octocat",
  repo: "Hello-World",
  number: 1,
  title: "Edited README via GitHub",
  url: "https://github.com/octocat/Hello-World/pull/1",
  author: "unoju",
  body: "",
  base_ref: "master",
  head_ref: "patch-1",
  base_sha: "base",
  head_sha: "head",
};

const files: ChangedFile[] = [
  {
    path: "README",
    status: "modified",
    additions: 1,
    deletions: 0,
    patch: "@@ -1 +1 @@\n+Hello",
  },
];

const selectedCode: CodeSelection = {
  filePath: "README",
  side: "new",
  startLine: 1,
  endLine: 2,
  selectedText: "Hello\nWorld",
};

vi.mock("./api", () => ({
  createComment: vi.fn(async ({ body, context }: { body: string; context: CodeSelection }) => ({
    id: "draft_1",
    body,
    context,
    status: "draft" as const,
    created_at: "2026-04-29T00:00:00Z",
  })),
  createReview: vi.fn(async () => ({
    review_id: "rev_1",
    pr,
    files,
    threads: [],
    comments: [],
    submission: { body: "", event: null },
    test_runs: [],
  })),
  createTestRun: vi.fn(async () => ({
    id: "test_1",
    status: "queued" as const,
    command: "npm --prefix web test -- --run",
    stdout: "",
    stderr: "",
    created_at: "2026-04-29T00:00:00Z",
    updated_at: "2026-04-29T00:00:00Z",
  })),
  createThread: vi.fn(),
  deleteComment: vi.fn(async () => ({ comment_id: "draft_1", status: "deleted" as const })),
  getBootstrapPrUrl: vi.fn(),
  getFileDiff: vi.fn(async () => ({ file_path: "README", diff: files[0].patch })),
  getReview: vi.fn(),
  publishComments: vi.fn(async ({ commentIds }: { commentIds: string[] }) => ({
    comments: commentIds.map((commentId) => ({
      id: commentId,
      body: "this needs tests",
      context: selectedCode,
      status: "published" as const,
      github_comment_url: "https://github.com/octocat/Hello-World/pull/1#discussion_r1",
    })),
    submission: {
      body: "",
      event: null,
      github_review_url: null,
    },
  })),
  updateReviewSubmission: vi.fn(async ({ body = "", event = null }: { body?: string; event?: ReviewSubmission["event"] }) => ({
    body,
    event,
    github_review_url: null,
  })),
  updateComment: vi.fn(),
}));

vi.mock("./components/ChangedFilesPane", () => ({
  ChangedFilesPane: ({ onSelectFile }: { onSelectFile: (filePath: string) => void }) => (
    <button onClick={() => onSelectFile("README")} type="button">
      README
    </button>
  ),
}));

vi.mock("./components/PullRequestPanel", () => ({
  PullRequestPanel: ({
    onDraftComment,
    onDraftCommentAtLocation,
  }: {
    onDraftComment: (body: string) => Promise<unknown>;
    onDraftCommentAtLocation: (body: string, context: CodeSelection) => Promise<unknown>;
  }) => (
    <div>
      <button onClick={() => void onDraftComment("this needs tests")} type="button">
        Draft without selection
      </button>
      <button
        onClick={() =>
          void onDraftCommentAtLocation("location-specific testing gap", {
            filePath: "README",
            side: "new",
            startLine: 1,
            endLine: 1,
            selectedText: "",
          })
        }
        type="button"
      >
        Draft at README line
      </button>
    </div>
  ),
}));

vi.mock("./components/DiffPane", () => ({
  DiffPane: ({ onSelectionChange }: { onSelectionChange: (selection: CodeSelection) => void }) => (
    <button onClick={() => onSelectionChange(selectedCode)} type="button">
      Select README lines
    </button>
  ),
}));

vi.mock("./components/AIWorkbench", () => ({
  AIWorkbench: ({
    commentError,
    comments,
    onPublishComments,
    onRunTests,
    pendingCommentBody,
  }: {
    commentError: string | null;
    comments: DraftComment[];
    onPublishComments: (body: string, event: ReviewSubmission["event"]) => Promise<void>;
    onRunTests: () => Promise<void>;
    pendingCommentBody: string | null;
    threads: ReviewThread[];
  }) => (
    <div>
      {pendingCommentBody ? <div>Pending: {pendingCommentBody}</div> : null}
      {commentError ? <div>Comment error: {commentError}</div> : null}
      <button onClick={() => void onPublishComments("", null)} type="button">
        Publish comments
      </button>
      <button onClick={() => void onRunTests()} type="button">
        Run tests
      </button>
      {comments.map((comment) => (
        <div key={comment.id}>
          <div>Comment: {comment.body}</div>
          <div>Status: {comment.status}</div>
          {comment.github_comment_url ? <a href={comment.github_comment_url}>GitHub comment</a> : null}
          {comment.error ? <div>Comment failed: {comment.error}</div> : null}
          <div>
            Location: {comment.context.filePath}:L{comment.context.startLine}-L{comment.context.endLine}
          </div>
        </div>
      ))}
    </div>
  ),
}));

describe("App draft comments", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?pr=https://github.com/octocat/Hello-World/pull/1");
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("attaches a requested PR comment to the active file when no lines are selected", async () => {
    const { default: App } = await import("./App");

    render(<App />);

    await userEvent.click(await screen.findByText("Draft without selection"));

    await screen.findByText("Comment: this needs tests");
    expect(screen.queryByText("Pending: this needs tests")).not.toBeInTheDocument();
    expect(screen.getByText("Comment: this needs tests")).toBeInTheDocument();
    expect(screen.getByText("Location: README:L1-L1")).toBeInTheDocument();
  });

  it("attaches a requested PR comment to selected lines when they exist", async () => {
    const { default: App } = await import("./App");

    render(<App />);

    await userEvent.click(await screen.findByText("Select README lines"));
    await userEvent.click(screen.getByText("Draft without selection"));

    await screen.findByText("Comment: this needs tests");
    expect(screen.queryByText("Pending: this needs tests")).not.toBeInTheDocument();
    expect(screen.getByText("Comment: this needs tests")).toBeInTheDocument();
    expect(screen.getByText("Location: README:L1-L2")).toBeInTheDocument();
  });

  it("attaches a requested PR comment to an explicit location", async () => {
    const { default: App } = await import("./App");

    render(<App />);

    await userEvent.click(await screen.findByText("Draft at README line"));

    await screen.findByText("Comment: location-specific testing gap");
    expect(screen.getByText("Location: README:L1-L1")).toBeInTheDocument();
  });

  it("publishes local draft comments to GitHub", async () => {
    const api = await import("./api");
    const { default: App } = await import("./App");

    render(<App />);

    await userEvent.click(await screen.findByText("Select README lines"));
    await userEvent.click(screen.getByText("Draft without selection"));
    await screen.findByText("Comment: this needs tests");
    await userEvent.click(screen.getByText("Publish comments"));

    expect(api.publishComments).toHaveBeenCalledWith({
      reviewId: "rev_1",
      commentIds: ["draft_1"],
      body: "",
      event: null,
    });
    expect(await screen.findByText("Status: published")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub comment" })).toHaveAttribute(
      "href",
      "https://github.com/octocat/Hello-World/pull/1#discussion_r1",
    );
  });

  it("keeps comments retryable when GitHub publishing fails", async () => {
    const api = await import("./api");
    vi.mocked(api.publishComments).mockRejectedValueOnce(new Error("GitHub rejected the line"));
    const { default: App } = await import("./App");

    render(<App />);

    await userEvent.click(await screen.findByText("Draft without selection"));
    await screen.findByText("Comment: this needs tests");
    await userEvent.click(screen.getByText("Publish comments"));

    expect(await screen.findByText("Status: failed")).toBeInTheDocument();
    expect(screen.getByText("Comment error: GitHub rejected the line")).toBeInTheDocument();
    expect(screen.getByText("Comment failed: GitHub rejected the line")).toBeInTheDocument();
  });

  it("starts a test run and refreshes the review session", async () => {
    const api = await import("./api");
    vi.mocked(api.getReview).mockResolvedValueOnce({
      id: "rev_1",
      pr,
      files,
      comments: [],
      threads: [],
      submission: { body: "", event: null },
      test_runs: [
        {
          id: "test_1",
          status: "running",
          command: "npm --prefix web test -- --run",
          stdout: "",
          stderr: "",
          created_at: "2026-04-29T00:00:00Z",
          updated_at: "2026-04-29T00:00:01Z",
        },
      ],
      created_at: "2026-04-29T00:00:00Z",
      updated_at: "2026-04-29T00:00:01Z",
    });
    const { default: App } = await import("./App");

    render(<App />);

    await userEvent.click(await screen.findByText("Run tests"));

    expect(api.createTestRun).toHaveBeenCalledWith("rev_1");
    expect(api.getReview).toHaveBeenCalledWith("rev_1");
  });

  it("announces only non-init queued or running threads that become terminal", async () => {
    const { nextThreadStatusAnnouncement } = await import("./App");
    const completeThread: ReviewThread = {
      id: "thr_1",
      source: "manual",
      title: "Diagram this flow",
      status: "complete",
      created_at: "2026-04-29T00:00:00Z",
      updated_at: "2026-04-29T00:00:01Z",
    };

    expect(nextThreadStatusAnnouncement([completeThread], new Map([["thr_1", "running"]]))).toEqual({
      requestId: expect.any(Number),
      threadId: "thr_1",
      text: 'The thread "Diagram this flow" is complete.',
    });
    expect(nextThreadStatusAnnouncement([completeThread], new Map())).toBeNull();
    expect(
      nextThreadStatusAnnouncement([{ ...completeThread, status: "running" }], new Map([["thr_1", "queued"]])),
    ).toBeNull();
    expect(
      nextThreadStatusAnnouncement([{ ...completeThread, source: "init" }], new Map([["thr_1", "running"]])),
    ).toBeNull();
  });

});
