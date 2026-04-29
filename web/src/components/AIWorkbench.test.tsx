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

function renderWorkbench(props: Partial<Parameters<typeof AIWorkbench>[0]> = {}) {
  return render(
    <AIWorkbench
      activeThreadId={null}
      onActivateThread={vi.fn()}
      onAsk={vi.fn()}
      onFollowUp={vi.fn()}
      selection={null}
      threadError={null}
      threads={[]}
      {...props}
    />,
  );
}

describe("AIWorkbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("submits a manual question", async () => {
    const onAsk = vi.fn().mockResolvedValue(undefined);
    renderWorkbench({ onAsk });

    await userEvent.type(screen.getByPlaceholderText("Ask about selected code..."), "Explain this function");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(onAsk).toHaveBeenCalledWith("Explain this function");
  });

  it("renders completed markdown thread output", () => {
    renderWorkbench({
      threads: [
        {
          id: "thr_1",
          source: "manual",
          title: "Diagram this flow",
          status: "complete",
          markdown: "Uses `buildDiagram`.\n\n```mermaid\nflowchart LR\nA --> B\n```",
          created_at: "2026-04-29T00:00:00Z",
          updated_at: "2026-04-29T00:00:00Z",
        },
      ],
    });

    expect(screen.getByText("Diagram this flow")).toBeInTheDocument();
    expect(screen.getByText("complete")).toBeInTheDocument();
    expect(screen.getByText("buildDiagram")).toBeInTheDocument();
    expect(screen.getByText("Rendering diagram...")).toBeInTheDocument();
  });

  it("collapses and reopens thread output", async () => {
    renderWorkbench({
      activeThreadId: "thr_1",
      threads: [
        {
          id: "thr_1",
          source: "manual",
          title: "Explain this function",
          status: "complete",
          markdown: "This is the thread body.",
          created_at: "2026-04-29T00:00:00Z",
          updated_at: "2026-04-29T00:00:00Z",
        },
      ],
    });

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
    const { rerender } = renderWorkbench({
      activeThreadId: "thr_1",
      threads: [
        {
          id: "thr_1",
          source: "manual",
          title: "Explain this function",
          status: "running",
          markdown: "Initial body.",
          created_at: "2026-04-29T00:00:00Z",
          updated_at: "2026-04-29T00:00:00Z",
        },
      ],
    });

    const header = screen.getByRole("button", { name: /Explain this function/ });
    await userEvent.click(header);

    rerender(
      <AIWorkbench
        activeThreadId={null}
        onActivateThread={vi.fn()}
        onAsk={vi.fn()}
        onFollowUp={vi.fn()}
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

  it("marks a clicked thread as voice context and submits a follow-up", async () => {
    const onActivateThread = vi.fn();
    const onFollowUp = vi.fn().mockResolvedValue(undefined);
    const thread = {
      id: "thr_1",
      source: "manual" as const,
      title: "Found issue",
      status: "complete" as const,
      markdown: "This thread found an issue.",
      codex_thread_id: "codex-thread-1",
      created_at: "2026-04-29T00:00:00Z",
      updated_at: "2026-04-29T00:00:00Z",
    };
    const { rerender } = renderWorkbench({
      activeThreadId: null,
      onActivateThread,
      onFollowUp,
      threads: [thread],
    });

    const header = screen.getByRole("button", { name: /Found issue/ });
    await userEvent.click(header);
    expect(onActivateThread).toHaveBeenCalledWith("thr_1");

    rerender(
      <AIWorkbench
        activeThreadId="thr_1"
        onActivateThread={onActivateThread}
        onAsk={vi.fn()}
        onFollowUp={onFollowUp}
        selection={null}
        threadError={null}
        threads={[thread]}
      />,
    );

    expect(screen.getByRole("button", { name: /Found issue/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("voice context")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Ask a follow-up..."), "What test catches this?");
    await userEvent.click(screen.getByRole("button", { name: "Follow up" }));

    expect(onFollowUp).toHaveBeenCalledWith("thr_1", "What test catches this?");
  });
});
