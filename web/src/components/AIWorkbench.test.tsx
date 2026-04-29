import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AIWorkbench } from "./AIWorkbench";

describe("AIWorkbench", () => {
  it("submits a manual question", async () => {
    const onAsk = vi.fn().mockResolvedValue(undefined);
    render(<AIWorkbench onAsk={onAsk} selection={null} threadError={null} threads={[]} />);

    await userEvent.type(screen.getByPlaceholderText("Ask about selected code..."), "Explain this function");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(onAsk).toHaveBeenCalledWith("Explain this function");
  });

  it("renders completed markdown thread output", () => {
    render(
      <AIWorkbench
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
    expect(screen.getByText(/flowchart LR/)).toBeInTheDocument();
  });
});
