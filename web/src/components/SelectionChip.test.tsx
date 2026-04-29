import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SelectionChip } from "./SelectionChip";

describe("SelectionChip", () => {
  it("prompts for a selection when no context exists", () => {
    render(<SelectionChip selection={null} />);

    expect(screen.getByText("Select code in the diff to set review context.")).toBeInTheDocument();
  });

  it("renders the selected file and line range", () => {
    render(
      <SelectionChip
        selection={{
          filePath: "src/review/diagram.ts",
          side: "new",
          startLine: 201,
          endLine: 208,
          selectedText: "edge.points = simplify(path)",
        }}
      />,
    );

    expect(screen.getByText("Selected: src/review/diagram.ts:L201-L208")).toBeInTheDocument();
  });
});
