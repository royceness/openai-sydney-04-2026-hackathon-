import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewComment } from "../types";
import { DiffPane } from "./DiffPane";

const comment: ReviewComment = {
  id: "gh_comment_101",
  source: "github",
  body: "Please rename this helper.",
  context: {
    filePath: "src/review/diagram.ts",
    side: "new",
    startLine: 1,
    endLine: 1,
    selectedText: "",
    diffHunk: "@@ -1 +1 @@",
    commitSha: "def",
  },
  status: "imported",
  author: "reviewer",
  github_comment_id: 101,
  github_comment_url: "https://github.com/acme/review-room/pull/247#discussion_r101",
  created_at: "2026-04-29T04:30:00Z",
  updated_at: "2026-04-29T04:31:00Z",
};

describe("DiffPane comments", () => {
  afterEach(() => {
    cleanup();
  });

  it("marks a commented diff line and expands the comment when clicked", async () => {
    render(<DiffPaneHarness initialComments={[comment]} />);

    await userEvent.click(screen.getByRole("button", { name: "Show comment github line 1" }));

    expect(screen.getByText("Please rename this helper.")).toBeInTheDocument();
    expect(screen.getByText("reviewer")).toBeInTheDocument();
    expect(screen.getByText(/imported/)).toBeInTheDocument();
  });

  it("edits an expanded comment through the update callback", async () => {
    const onUpdateComment = vi.fn(async (commentId: string, body: string) => ({
      ...comment,
      id: commentId,
      body,
      updated_at: "2026-04-29T04:40:00Z",
    }));
    render(<DiffPaneHarness initialComments={[comment]} onUpdateComment={onUpdateComment} />);

    await userEvent.click(screen.getByRole("button", { name: "Show comment github line 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "Updated comment body");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdateComment).toHaveBeenCalledWith("gh_comment_101", "Updated comment body");
    expect(await screen.findByText("Updated comment body")).toBeInTheDocument();
  });
});

function DiffPaneHarness({
  initialComments,
  onUpdateComment,
}: {
  initialComments: ReviewComment[];
  onUpdateComment?: (commentId: string, body: string) => Promise<ReviewComment>;
}) {
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [comments, setComments] = useState(initialComments);
  const updateComment =
    onUpdateComment ??
    (async (commentId: string, body: string) => ({
      ...comments.find((item) => item.id === commentId)!,
      body,
    }));

  return (
    <DiffPane
      activeCommentId={activeCommentId}
      comments={comments}
      diff={"@@ -1 +1 @@\n-old\n+new"}
      diffError={null}
      filePath="src/review/diagram.ts"
      onActiveCommentChange={setActiveCommentId}
      onSelectionChange={() => undefined}
      onUpdateComment={async (commentId, body) => {
        const updated = await updateComment(commentId, body);
        setComments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        return updated;
      }}
      selection={null}
      targetReference={null}
    />
  );
}
