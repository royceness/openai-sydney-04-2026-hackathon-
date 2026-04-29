import { useMemo } from "react";
import { formatSelection, lineNumberForSide, parseUnifiedDiff } from "../lib/diff";
import type { CodeSelection, DiffLine } from "../types";
import { SelectionChip } from "./SelectionChip";

export function DiffPane({
  filePath,
  diff,
  diffError,
  selection,
  onSelectionChange,
}: {
  filePath: string | null;
  diff: string;
  diffError: string | null;
  selection: CodeSelection | null;
  onSelectionChange: (selection: CodeSelection) => void;
}) {
  const lines = useMemo(() => parseUnifiedDiff(diff), [diff]);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#080a0f]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-200">{filePath ?? "No file selected"}</div>
          {selection ? <div className="mt-1 text-xs text-slate-500">{formatSelection(selection)}</div> : null}
        </div>
        <SelectionChip selection={selection} />
      </div>

      {diffError ? (
        <div className="m-5 rounded-md border border-rose-900/70 bg-rose-950/30 p-4 text-sm text-rose-100">{diffError}</div>
      ) : null}

      {!filePath ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Choose a changed file to inspect its diff.</div>
      ) : null}

      {filePath && !diffError ? (
        <div className="min-h-0 flex-1 overflow-auto" onMouseUp={() => handleMouseSelection(filePath, onSelectionChange)}>
          <table className="w-full table-fixed border-collapse font-mono text-[13px] leading-6">
            <tbody>
              {lines.map((line) => (
                <DiffRow filePath={filePath} key={line.id} line={line} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function DiffRow({ filePath, line }: { filePath: string; line: DiffLine }) {
  const oldLine = line.oldLine === null ? "" : line.oldLine;
  const newLine = line.newLine === null ? "" : line.newLine;

  return (
    <tr
      className={rowClass(line.kind)}
      data-diff-row="true"
      data-file-path={filePath}
      data-new-line={line.newLine ?? ""}
      data-old-line={line.oldLine ?? ""}
      data-side={line.side}
    >
      <td className="w-14 select-none border-r border-slate-900 px-3 text-right text-slate-600">{oldLine}</td>
      <td className="w-14 select-none border-r border-slate-900 px-3 text-right text-slate-600">{newLine}</td>
      <td className="w-8 select-none px-2 text-slate-500">{prefixFor(line.kind)}</td>
      <td className="whitespace-pre px-1 text-slate-200">
        <span>{line.content}</span>
      </td>
    </tr>
  );
}

function rowClass(kind: DiffLine["kind"]) {
  if (kind === "hunk") {
    return "bg-slate-900/80 text-slate-400";
  }
  if (kind === "add") {
    return "bg-emerald-950/40";
  }
  if (kind === "del") {
    return "bg-rose-950/40";
  }
  if (kind === "meta") {
    return "text-slate-500";
  }
  return "hover:bg-slate-900/50";
}

function prefixFor(kind: DiffLine["kind"]) {
  if (kind === "add") {
    return "+";
  }
  if (kind === "del") {
    return "-";
  }
  return "";
}

function handleMouseSelection(filePath: string, onSelectionChange: (selection: CodeSelection) => void) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    return;
  }

  const anchorRow = closestDiffRow(selection.anchorNode);
  const focusRow = closestDiffRow(selection.focusNode);
  if (!anchorRow || !focusRow) {
    return;
  }

  const [startRow, endRow] = orderRows(anchorRow, focusRow);
  const side = chooseSelectionSide(startRow, endRow);
  const startLine = lineNumberForSide(startRow, side);
  const endLine = lineNumberForSide(endRow, side);

  onSelectionChange({
    filePath,
    side,
    startLine: normalizeRange(startLine, endLine)[0],
    endLine: normalizeRange(startLine, endLine)[1],
    selectedText: selection.toString(),
  });
}

function closestDiffRow(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest<HTMLElement>("[data-diff-row='true']") ?? null;
}

function orderRows(a: HTMLElement, b: HTMLElement): [HTMLElement, HTMLElement] {
  if (a === b) {
    return [a, b];
  }
  const position = a.compareDocumentPosition(b);
  return position & Node.DOCUMENT_POSITION_PRECEDING ? [b, a] : [a, b];
}

function chooseSelectionSide(startRow: HTMLElement, endRow: HTMLElement): "old" | "new" {
  const startSide = startRow.dataset.side === "old" ? "old" : "new";
  const endSide = endRow.dataset.side === "old" ? "old" : "new";
  if (startSide === endSide) {
    return startSide;
  }
  return startRow.dataset.newLine || endRow.dataset.newLine ? "new" : "old";
}

function normalizeRange(start: number | null, end: number | null): [number | null, number | null] {
  if (start === null || end === null) {
    return [start, end];
  }
  return start <= end ? [start, end] : [end, start];
}

