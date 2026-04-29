import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AIWorkbench } from "./AIWorkbench";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, source: string) => ({
      svg: `<svg role="img"><text>${source}</text></svg>`,
    })),
  },
}));

describe("AIWorkbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("submits a manual question", async () => {
    const onAsk = vi.fn().mockResolvedValue(undefined);
    render(<AIWorkbench comments={[]} pendingCommentBody={null} onAsk={onAsk} selection={null} threadError={null} threads={[]} />);

    await userEvent.type(screen.getByPlaceholderText("Ask about selected code..."), "Explain this function");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(onAsk).toHaveBeenCalledWith("Explain this function");
  });

  it("renders completed markdown thread output", () => {
    render(
      <AIWorkbench
        comments={[]}
        pendingCommentBody={null}
        onAsk={vi.fn()}
        selection={null}
        threadError={null}
        threads={[
          {
            id: "thr_1",
            source: "manual",
            title: "Diagram this flow",
            status: "complete",
            markdown: "Uses `buildDiagram`.\n\n```mermaid\nflowchart LR\nA --> B\n```",
            created_at: "2026-04-29T00:00:00Z",
            updated_at: "2026-04-29T00:00:00Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("Diagram this flow")).toBeInTheDocument();
    expect(screen.getByText("complete")).toBeInTheDocument();
    expect(screen.getByText("buildDiagram")).toBeInTheDocument();
    expect(screen.getByText("Rendering diagram...")).toBeInTheDocument();
  });

  it("renders local PR comment drafts and pending comment prompt", () => {
    render(
      <AIWorkbench
        comments={[
          {
            id: "draft_1",
            body: "this needs tests",
            status: "draft",
            created_at: "2026-04-29T00:00:00Z",
            context: {
              filePath: "src/review/diagram.ts",
              side: "new",
              startLine: 201,
              endLine: 203,
              selectedText: "function buildDiagram() {}",
            },
          },
        ]}
        pendingCommentBody="add null input coverage"
        onAsk={vi.fn()}
        selection={null}
        threadError={null}
        threads={[]}
      />,
    );

    expect(screen.getByRole("button", { name: /PR Comments/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Select lines to attach this comment")).toBeInTheDocument();
    expect(screen.getByText("add null input coverage")).toBeInTheDocument();
    expect(screen.getByText("src/review/diagram.ts:L201-L203")).toBeInTheDocument();
    expect(screen.getByText("this needs tests")).toBeInTheDocument();
  });

  it("collapses and reopens thread output", async () => {
    render(
      <AIWorkbench
        comments={[]}
        pendingCommentBody={null}
        onAsk={vi.fn()}
        selection={null}
        threadError={null}
        threads={[
          {
            id: "thr_1",
            source: "manual",
            title: "Explain this function",
            status: "complete",
            markdown: "This is the thread body.",
            created_at: "2026-04-29T00:00:00Z",
            updated_at: "2026-04-29T00:00:00Z",
          },
        ]}
      />,
    );

    const header = screen.getByRole("button", { name: /Explain this function/ });

    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("This is the thread body.")).toBeInTheDocument();

    await userEvent.click(header);

    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("This is the thread body.")).not.toBeInTheDocument();

    await userEvent.click(header);

    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("This is the thread body.")).toBeVisible();
  });

  it("keeps a collapsed thread closed when thread content streams in", async () => {
    const { rerender } = render(
      <AIWorkbench
        comments={[]}
        pendingCommentBody={null}
        onAsk={vi.fn()}
        selection={null}
        threadError={null}
        threads={[
          {
            id: "thr_1",
            source: "manual",
            title: "Explain this function",
            status: "running",
            markdown: "Initial body.",
            created_at: "2026-04-29T00:00:00Z",
            updated_at: "2026-04-29T00:00:00Z",
          },
        ]}
      />,
    );

    const header = screen.getByRole("button", { name: /Explain this function/ });
    await userEvent.click(header);

    rerender(
      <AIWorkbench
        comments={[]}
        pendingCommentBody={null}
        onAsk={vi.fn()}
        selection={null}
        threadError={null}
        threads={[
          {
            id: "thr_1",
            source: "manual",
            title: "Explain this function",
            status: "complete",
            markdown: "Updated streamed body.",
            created_at: "2026-04-29T00:00:00Z",
            updated_at: "2026-04-29T00:00:01Z",
          },
        ]}
      />,
    );

    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Updated streamed body.")).not.toBeInTheDocument();
  });
});
