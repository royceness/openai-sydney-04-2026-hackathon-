import { useEffect, useMemo, useState } from "react";
import { formatSelection, lineNumberForSide, parseUnifiedDiff } from "../lib/diff";
import type { CodeReference, CodeSelection, DiffLine, ReviewComment } from "../types";
import { SelectionChip } from "./SelectionChip";

export function DiffPane({
  filePath,
  diff,
  diffError,
  comments,
  activeCommentId,
  onActiveCommentChange,
  onUpdateComment,
  targetReference,
  selection,
  onSelectionChange,
}: {
  filePath: string | null;
  diff: string;
  diffError: string | null;
  comments: ReviewComment[];
  activeCommentId: string | null;
  onActiveCommentChange: (commentId: string | null) => void;
  onUpdateComment: (commentId: string, body: string) => Promise<ReviewComment>;
  targetReference: CodeReference | null;
  selection: CodeSelection | null;
  onSelectionChange: (selection: CodeSelection) => void;
}) {
  const lines = useMemo(() => parseUnifiedDiff(diff), [diff]);

  useEffect(() => {
    if (!filePath || !targetReference || targetReference.filePath !== filePath || lines.length === 0) {
      return;
    }

    const selector = `[data-file-path="${cssEscape(filePath)}"][data-new-line="${targetReference.startLine}"], [data-file-path="${cssEscape(
      filePath,
    )}"][data-old-line="${targetReference.startLine}"]`;
    const targetRow = document.querySelector<HTMLElement>(selector);
    targetRow?.scrollIntoView({ block: "center" });
  }, [filePath, lines, targetReference]);

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
              {lines.map((line) => {
                const lineComments = comments.filter((comment) => commentBelongsToLine(comment, filePath, line));
                const expandedComment = lineComments.find((comment) => comment.id === activeCommentId) ?? null;
                return (
                  <DiffRow
                    activeCommentId={activeCommentId}
                    comments={lineComments}
                    expandedComment={expandedComment}
                    filePath={filePath}
                    key={line.id}
                    line={line}
                    onActiveCommentChange={onActiveCommentChange}
                    onUpdateComment={onUpdateComment}
                    targetReference={targetReference}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function DiffRow({
  activeCommentId,
  comments,
  expandedComment,
  filePath,
  line,
  onActiveCommentChange,
  onUpdateComment,
  targetReference,
}: {
  activeCommentId: string | null;
  comments: ReviewComment[];
  expandedComment: ReviewComment | null;
  filePath: string;
  line: DiffLine;
  onActiveCommentChange: (commentId: string | null) => void;
  onUpdateComment: (commentId: string, body: string) => Promise<ReviewComment>;
  targetReference: CodeReference | null;
}) {
  const oldLine = line.oldLine === null ? "" : line.oldLine;
  const newLine = line.newLine === null ? "" : line.newLine;

  return (
    <>
      <tr
        className={rowClass(line.kind, isTargetLine(filePath, line, targetReference), comments.length > 0)}
        data-diff-row="true"
        data-file-path={filePath}
        data-new-line={line.newLine ?? ""}
        data-old-line={line.oldLine ?? ""}
        data-side={line.side}
      >
        <td className="w-14 select-none border-r border-slate-900 px-3 text-right text-slate-600">{oldLine}</td>
        <td className="w-14 select-none border-r border-slate-900 px-3 text-right text-slate-600">{newLine}</td>
        <td className="w-8 select-none px-2 text-slate-500">{prefixFor(line.kind)}</td>
        <td className="w-12 select-none px-2 text-center">
          {comments.length > 0 ? (
            <div className="flex justify-center gap-1">
              {comments.map((comment) => (
                <button
                  aria-label={`Show comment ${commentLabel(comment)}`}
                  aria-pressed={activeCommentId === comment.id}
                  className={
                    activeCommentId === comment.id
                      ? "h-5 min-w-5 rounded border border-amber-200 bg-amber-300 px-1 text-[11px] font-semibold leading-4 text-slate-950"
                      : "h-5 min-w-5 rounded border border-amber-400/50 bg-amber-400/15 px-1 text-[11px] font-semibold leading-4 text-amber-200 hover:border-amber-200 hover:text-amber-100"
                  }
                  key={comment.id}
                  onClick={() => onActiveCommentChange(activeCommentId === comment.id ? null : comment.id)}
                  type="button"
                >
                  {comments.length === 1 ? "C" : comments.indexOf(comment) + 1}
                </button>
              ))}
            </div>
          ) : null}
        </td>
        <td className="whitespace-pre px-1 text-slate-200">
          <span>{line.content}</span>
        </td>
      </tr>
      {expandedComment ? (
        <tr className="bg-amber-950/20">
          <td className="border-r border-slate-900" colSpan={3} />
          <td colSpan={2} className="px-2 py-2">
            <ExpandedComment comment={expandedComment} onUpdateComment={onUpdateComment} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ExpandedComment({
  comment,
  onUpdateComment,
}: {
  comment: ReviewComment;
  onUpdateComment: (commentId: string, body: string) => Promise<ReviewComment>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(comment.body);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftBody(comment.body);
    setError(null);
    setIsEditing(false);
  }, [comment.id, comment.body]);

  return (
    <div className="max-w-4xl rounded-md border border-amber-400/30 bg-slate-950/95 p-3 font-sans text-sm leading-6 text-slate-200 shadow-lg shadow-black/20">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs text-slate-500">
          <span className="font-semibold text-amber-200">{comment.author ?? comment.source}</span>
          <span> · {comment.status}</span>
          {comment.github_comment_url ? (
            <a className="ml-2 text-violet-300 hover:text-violet-200" href={comment.github_comment_url}>
              GitHub
            </a>
          ) : null}
        </div>
        {isEditing ? (
          <div className="flex shrink-0 gap-2">
            <button
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500"
              onClick={() => {
                setDraftBody(comment.body);
                setError(null);
                setIsEditing(false);
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded bg-violet-500 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSaving}
              onClick={() => {
                setError(null);
                setIsSaving(true);
                void onUpdateComment(comment.id, draftBody)
                  .then(() => setIsEditing(false))
                  .catch((caught) => setError(caught instanceof Error ? caught.message : "Failed to update comment"))
                  .finally(() => setIsSaving(false));
              }}
              type="button"
            >
              {isSaving ? "Saving" : "Save"}
            </button>
          </div>
        ) : (
          <button
            className="shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100"
            onClick={() => setIsEditing(true)}
            type="button"
          >
            Edit
          </button>
        )}
      </div>
      {isEditing ? (
        <textarea
          className="min-h-24 w-full resize-y rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs leading-5 text-slate-100 outline-none ring-violet-500/30 focus:ring-4"
          onChange={(event) => setDraftBody(event.target.value)}
          value={draftBody}
        />
      ) : (
        <div className="whitespace-pre-wrap break-words">{comment.body}</div>
      )}
      {error ? <div className="mt-2 text-xs text-rose-300">{error}</div> : null}
    </div>
  );
}

function rowClass(kind: DiffLine["kind"], isTarget: boolean, hasComments: boolean) {
  if (isTarget) {
    return "bg-violet-500/25 ring-1 ring-inset ring-violet-400/50";
  }
  if (hasComments) {
    return "bg-amber-950/25 hover:bg-amber-950/35";
  }
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

function commentBelongsToLine(comment: ReviewComment, filePath: string, line: DiffLine) {
  if (comment.context.filePath !== filePath) {
    return false;
  }
  const startLine = comment.context.startLine;
  const endLine = comment.context.endLine ?? startLine;
  if (startLine === null || endLine === null) {
    return false;
  }
  const lineNumber = comment.context.side === "old" ? line.oldLine : line.newLine;
  return lineNumber !== null && lineNumber >= startLine && lineNumber <= endLine;
}

function commentLabel(comment: ReviewComment) {
  const start = comment.context.startLine;
  const end = comment.context.endLine;
  const location = start ? (end && end !== start ? `lines ${start}-${end}` : `line ${start}`) : comment.context.filePath;
  return `${comment.source} ${location}`;
}

function isTargetLine(filePath: string, line: DiffLine, targetReference: CodeReference | null) {
  if (!targetReference || targetReference.filePath !== filePath) {
    return false;
  }
  const endLine = targetReference.endLine ?? targetReference.startLine;
  return (
    (line.newLine !== null && line.newLine >= targetReference.startLine && line.newLine <= endLine) ||
    (line.oldLine !== null && line.oldLine >= targetReference.startLine && line.oldLine <= endLine)
  );
}

function cssEscape(value: string) {
  if ("CSS" in window && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
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
