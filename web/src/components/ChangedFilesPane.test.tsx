import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChangedFilesPane } from "./ChangedFilesPane";

describe("ChangedFilesPane", () => {
  it("renders changed files and calls back with the selected path", async () => {
    const onSelectFile = vi.fn();
    render(
      <ChangedFilesPane
        activeFile="src/review/diagram.ts"
        files={[
          {
            path: "src/review/diagram.ts",
            status: "modified",
            additions: 48,
            deletions: 17,
            patch: "@@ -1 +1 @@",
          },
          {
            path: "tests/review/diagram.test.ts",
            status: "added",
            additions: 143,
            deletions: 0,
            patch: "@@ -1 +1 @@",
          },
        ]}
        onSelectFile={onSelectFile}
      />,
    );

    expect(screen.getByText("2 files changed")).toBeInTheDocument();
    expect(screen.getByText("+191")).toBeInTheDocument();
    expect(screen.getAllByText("-17")).toHaveLength(2);

    await userEvent.click(screen.getByText("tests/review/diagram.test.ts"));

    expect(onSelectFile).toHaveBeenCalledWith("tests/review/diagram.test.ts");
  });
});
