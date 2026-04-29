import { describe, expect, it } from "vitest";
import { formatSelection, parseUnifiedDiff } from "./diff";

describe("parseUnifiedDiff", () => {
  it("tracks old and new line numbers across additions and deletions", () => {
    const lines = parseUnifiedDiff("@@ -10,3 +10,4 @@\n const a = 1;\n-old();\n+newer();\n+added();\n done();");

    expect(lines[1]).toMatchObject({ kind: "context", oldLine: 10, newLine: 10 });
    expect(lines[2]).toMatchObject({ kind: "del", oldLine: 11, newLine: null, side: "old" });
    expect(lines[3]).toMatchObject({ kind: "add", oldLine: null, newLine: 11, side: "new" });
    expect(lines[4]).toMatchObject({ kind: "add", newLine: 12 });
    expect(lines[5]).toMatchObject({ kind: "context", oldLine: 12, newLine: 13 });
  });
});

describe("formatSelection", () => {
  it("formats single-line and range selections", () => {
    expect(
      formatSelection({
        filePath: "src/foo.ts",
        side: "new",
        startLine: 42,
        endLine: 42,
        selectedText: "foo()",
      }),
    ).toBe("Selected: src/foo.ts:L42");

    expect(
      formatSelection({
        filePath: "src/foo.ts",
        side: "new",
        startLine: 42,
        endLine: 68,
        selectedText: "function foo() {}",
      }),
    ).toBe("Selected: src/foo.ts:L42-L68");
  });
});

