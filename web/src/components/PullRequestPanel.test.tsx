import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
        files={[]}
        onAsk={async () => undefined}
        onNavigateFile={() => undefined}
        selection={null}
      />,
    );

    expect(screen.getByText("PR #247")).toBeInTheDocument();
    expect(screen.getByText("acme/review-room")).toBeInTheDocument();
    expect(screen.getByText("feature/diagram to main")).toBeInTheDocument();
    expect(screen.getByText("by sarah-lee")).toBeInTheDocument();
    expect(screen.getByText("Adds smarter diagram layout.")).toBeInTheDocument();
  });
});
