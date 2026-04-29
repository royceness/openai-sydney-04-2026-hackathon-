import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PullRequestPanel } from "./PullRequestPanel";

describe("PullRequestPanel", () => {
  it("renders PR identity, branches, author, and body", () => {
    render(
      <PullRequestPanel
        pr={{
          owner: "acme",
          repo: "review-room",
          number: 247,
          title: "Improve diagram layout",
          url: "https://github.com/acme/review-room/pull/247",
          author: "sarah-lee",
          body: "Adds smarter diagram layout.",
          base_ref: "main",
          head_ref: "feature/diagram",
          base_sha: "abc",
          head_sha: "def",
        }}
        activeFile={null}
        activeThreadId={null}
        comments={[]}
        files={[]}
        onAsk={async () => undefined}
        onDeleteComment={vi.fn()}
        onDraftComment={vi.fn()}
        onEditComment={vi.fn()}
        onFollowUp={async () => undefined}
        onNavigateFile={() => undefined}
        onNavigateThread={() => undefined}
        onSetReviewSubmissionBody={vi.fn()}
        onSetReviewSubmissionEvent={vi.fn()}
        onSubmitReview={vi.fn()}
        reviewId="rev_acme_review_room_247"
        selection={null}
        submission={{ body: "", event: null }}
        threadStatusAnnouncement={null}
        threads={[]}
      />,
    );

    expect(screen.getByText("PR #247")).toBeInTheDocument();
    expect(screen.getByText("acme/review-room")).toBeInTheDocument();
    expect(screen.getByText("feature/diagram to main")).toBeInTheDocument();
    expect(screen.getByText("by sarah-lee")).toBeInTheDocument();
    expect(screen.getByText("Adds smarter diagram layout.")).toBeInTheDocument();
  });
});
