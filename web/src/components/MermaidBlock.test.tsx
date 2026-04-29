import { render, screen, waitFor } from "@testing-library/react";
import mermaid from "mermaid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MermaidBlock } from "./MermaidBlock";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, source: string) => ({
      svg: `<svg role="img"><text>${source}</text></svg>`,
    })),
  },
}));

describe("MermaidBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Mermaid source as SVG", async () => {
    render(<MermaidBlock source={"flowchart LR\nA --> B"} />);

    await waitFor(() => expect(screen.getByText(/flowchart LR/)).toBeInTheDocument());
    const [id, source] = vi.mocked(mermaid.render).mock.calls[0];
    expect(id).toMatch(/^mermaid-/);
    expect(source).toBe("flowchart LR\nA --> B");
  });

  it("falls back to source when Mermaid render fails", async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error("Parse error"));

    render(<MermaidBlock source="flowchart nope" />);

    await waitFor(() => expect(screen.getByText("Mermaid render failed")).toBeInTheDocument());
    expect(screen.getByText("flowchart nope")).toBeInTheDocument();
  });
});
