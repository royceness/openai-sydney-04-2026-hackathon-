import type { CodeSelection, DiffLine } from "../types";

const HUNK_RE = /^@@ -(?<oldStart>\d+)(?:,\d+)? \+(?<newStart>\d+)(?:,\d+)? @@/;

export function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  let oldLine = 0;
  let newLine = 0;

  return lines.map((raw, index) => {
    const hunkMatch = HUNK_RE.exec(raw);
    if (hunkMatch?.groups) {
      oldLine = Number(hunkMatch.groups.oldStart);
      newLine = Number(hunkMatch.groups.newStart);
      return {
        id: `hunk-${index}`,
        kind: "hunk",
        content: raw,
        raw,
        oldLine: null,
        newLine: null,
        side: "new",
      };
    }

    if (raw.startsWith("+")) {
      const line: DiffLine = {
        id: `line-${index}`,
        kind: "add",
        content: raw.slice(1),
        raw,
        oldLine: null,
        newLine,
        side: "new",
      };
      newLine += 1;
      return line;
    }

    if (raw.startsWith("-")) {
      const line: DiffLine = {
        id: `line-${index}`,
        kind: "del",
        content: raw.slice(1),
        raw,
        oldLine,
        newLine: null,
        side: "old",
      };
      oldLine += 1;
      return line;
    }

    if (raw.startsWith(" ")) {
      const line: DiffLine = {
        id: `line-${index}`,
        kind: "context",
        content: raw.slice(1),
        raw,
        oldLine,
        newLine,
        side: "new",
      };
      oldLine += 1;
      newLine += 1;
      return line;
    }

    return {
      id: `meta-${index}`,
      kind: "meta",
      content: raw,
      raw,
      oldLine: null,
      newLine: null,
      side: "new",
    };
  });
}

export function formatSelection(selection: CodeSelection): string {
  const start = selection.startLine;
  const end = selection.endLine;
  if (start === null || end === null) {
    return `Selected: ${selection.filePath}`;
  }
  return start === end
    ? `Selected: ${selection.filePath}:L${start}`
    : `Selected: ${selection.filePath}:L${start}-L${end}`;
}

export function lineNumberForSide(row: HTMLElement, side: "old" | "new"): number | null {
  const raw = side === "old" ? row.dataset.oldLine : row.dataset.newLine;
  if (!raw) {
    return null;
  }
  return Number(raw);
}

