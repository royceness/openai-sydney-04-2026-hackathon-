import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangedFile, CodeSelection, DraftComment, PullRequestInfo, ReviewThread } from "./types";

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
  createReview: vi.fn(async () => ({
    review_id: "rev_1",
    pr,
    files,
    threads: [],
  })),
  createThread: vi.fn(),
  getBootstrapPrUrl: vi.fn(),
  getFileDiff: vi.fn(async () => ({ file_path: "README", diff: files[0].patch })),
  getReview: vi.fn(),
}));

vi.mock("./components/ChangedFilesPane", () => ({
  ChangedFilesPane: ({ onSelectFile }: { onSelectFile: (filePath: string) => void }) => (
    <button onClick={() => onSelectFile("README")} type="button">
      README
    </button>
  ),
}));

vi.mock("./components/PullRequestPanel", () => ({
  PullRequestPanel: ({ onDraftComment }: { onDraftComment: (body: string) => void }) => (
    <button onClick={() => onDraftComment("this needs tests")} type="button">
      Draft without selection
    </button>
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
    comments,
    pendingCommentBody,
  }: {
    comments: DraftComment[];
    pendingCommentBody: string | null;
    threads: ReviewThread[];
  }) => (
    <div>
      {pendingCommentBody ? <div>Pending: {pendingCommentBody}</div> : null}
      {comments.map((comment) => (
        <div key={comment.id}>
          <div>Comment: {comment.body}</div>
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
  });

  it("queues a requested PR comment until the user selects diff lines", async () => {
    const { default: App } = await import("./App");

    render(<App />);

    await userEvent.click(await screen.findByText("Draft without selection"));

    expect(screen.getByText("Pending: this needs tests")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Select README lines"));

    expect(screen.queryByText("Pending: this needs tests")).not.toBeInTheDocument();
    expect(screen.getByText("Comment: this needs tests")).toBeInTheDocument();
    expect(screen.getByText("Location: README:L1-L2")).toBeInTheDocument();
  });
});
