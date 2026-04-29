import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { CodeSelection, DraftComment, ReviewThread } from "../types";
import { MermaidBlock } from "./MermaidBlock";

export function AIWorkbench({
  comments,
  pendingCommentBody,
  threads,
  selection,
  threadError,
  onAsk,
  onDeleteComment,
}: {
  comments: DraftComment[];
  pendingCommentBody: string | null;
  threads: ReviewThread[];
  selection: CodeSelection | null;
  threadError: string | null;
  onAsk: (utterance: string) => Promise<void>;
  onDeleteComment: (commentId: string) => { status: "deleted" | "not-found" };
}) {
  const [utterance, setUtterance] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const knownThreadIdsRef = useRef(new Set(threads.map((thread) => thread.id)));
  const [openThreadIds, setOpenThreadIds] = useState<Set<string>>(() => new Set(threads.map((thread) => thread.id)));

  useEffect(() => {
    const newThreadIds = threads.map((thread) => thread.id).filter((threadId) => !knownThreadIdsRef.current.has(threadId));
    for (const threadId of newThreadIds) {
      knownThreadIdsRef.current.add(threadId);
    }
    if (newThreadIds.length === 0) {
      return;
    }

    setOpenThreadIds((current) => {
      const next = new Set(current);
      for (const threadId of newThreadIds) {
        next.add(threadId);
      }
      return next;
    });
  }, [threads]);

  return (
    <aside className="flex h-screen w-[30rem] shrink-0 flex-col bg-[#080a0f]">
      <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
        <div>
          <div className="text-sm font-semibold text-slate-100">AI Workbench</div>
          <div className="text-xs text-slate-500">Manual questions run through Codex</div>
        </div>
        <span className="rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-500">{threads.length} threads</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <article className="mb-4 overflow-hidden rounded-lg border border-violet-500/40 bg-violet-950/10">
          <button
            aria-expanded={commentsOpen}
            className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-violet-950/20"
            onClick={() => setCommentsOpen((open) => !open)}
            type="button"
          >
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-slate-100">PR Comments</h2>
              <div className="mt-1 text-xs text-slate-500">
                {pendingCommentBody ? "Waiting for selected lines" : `${comments.length} local draft${comments.length === 1 ? "" : "s"}`}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {pendingCommentBody ? <span className="rounded px-2 py-1 text-xs bg-amber-500/10 text-amber-300">needs selection</span> : null}
              <span className="rounded px-2 py-1 text-xs bg-violet-500/10 text-violet-200">{comments.length}</span>
              <span aria-hidden="true" className="w-3 text-center text-sm text-slate-500">
                {commentsOpen ? "-" : "+"}
              </span>
            </div>
          </button>

          {commentsOpen ? (
            <div className="space-y-3 px-4 pb-4">
              {pendingCommentBody ? (
                <div className="rounded-md border border-amber-700/50 bg-amber-950/20 p-3 text-sm text-amber-100">
                  <div className="font-semibold">Select lines to attach this comment</div>
                  <div className="mt-2 whitespace-pre-wrap text-slate-200">{pendingCommentBody}</div>
                </div>
              ) : null}
              {comments.length === 0 && !pendingCommentBody ? (
                <div className="rounded-md border border-dashed border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-500">
                  Drafted PR comments will appear here before anything is published.
                </div>
              ) : null}
              {comments.map((comment) => (
                <div className="rounded-md border border-slate-800 bg-slate-950 p-3" key={comment.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 truncate text-xs font-semibold text-violet-200">{formatCommentLocation(comment.context)}</div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">{comment.status}</span>
                      <button
                        aria-label={`Delete draft comment at ${formatCommentLocation(comment.context)}`}
                        className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
                        onClick={() => onDeleteComment(comment.id)}
                        title="Delete draft comment"
                        type="button"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200" data-comment-id={comment.id}>
                    {comment.body}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </article>

        <form
          className="mb-4 rounded-lg border border-slate-800 bg-slate-950 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = utterance.trim();
            if (!trimmed) {
              return;
            }
            setSubmitting(true);
            void onAsk(trimmed)
              .then(() => setUtterance(""))
              .finally(() => setSubmitting(false));
          }}
        >
          <div className="mb-2 text-xs text-slate-500">
            {selection ? "Asking about the selected code." : "No explicit selection; Codex will use the PR context."}
          </div>
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-violet-500/30 placeholder:text-slate-600 focus:ring-4"
              onChange={(event) => setUtterance(event.target.value)}
              placeholder="Ask about selected code..."
              value={utterance}
            />
            <button
              className="rounded-md bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!utterance.trim() || submitting}
              type="submit"
            >
              {submitting ? "Asking" : "Ask"}
            </button>
          </div>
          {threadError ? <div className="mt-2 text-xs text-rose-300">{threadError}</div> : null}
        </form>

        {threads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/70 p-5 text-sm leading-6 text-slate-400">
            Select code in the diff, then ask a question. Each question creates a persistent Codex-backed workbench thread.
          </div>
        ) : (
          threads.map((thread) => {
            const isOpen = openThreadIds.has(thread.id);

            return (
              <article className="mb-3 overflow-hidden rounded-lg border border-slate-800 bg-slate-950" key={thread.id}>
                <button
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-900/70"
                  onClick={() => {
                    setOpenThreadIds((current) => {
                      const next = new Set(current);
                      if (next.has(thread.id)) {
                        next.delete(thread.id);
                      } else {
                        next.add(thread.id);
                      }
                      return next;
                    });
                  }}
                  type="button"
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-slate-100">{thread.title}</h3>
                    {thread.context ? (
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {thread.context.filePath}
                        {thread.context.startLine ? `:L${thread.context.startLine}` : ""}
                        {thread.context.endLine && thread.context.endLine !== thread.context.startLine ? `-L${thread.context.endLine}` : ""}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={statusClass(thread.status)}>{thread.status}</span>
                    <span aria-hidden="true" className="w-3 text-center text-sm text-slate-500">
                      {isOpen ? "-" : "+"}
                    </span>
                  </div>
                </button>

                {isOpen ? (
                  <div className="px-4 pb-4">
                    {(thread.status === "queued" || thread.status === "running") && !thread.markdown ? (
                      <p className="text-sm text-slate-400">Codex is working...</p>
                    ) : null}
                    {thread.error ? <p className="text-sm text-rose-300">{thread.error}</p> : null}
                    {thread.markdown ? (
                      <div className="markdown-body text-sm leading-6 text-slate-300">
                        <ReactMarkdown
                          components={{
                            code({ children, className }) {
                              const language = /language-(\w+)/.exec(className ?? "")?.[1];
                              const source = String(children).replace(/\n$/, "");
                              if (language === "mermaid") {
                                return <MermaidBlock source={source} />;
                              }
                              return <code className={className}>{children}</code>;
                            },
                          }}
                        >
                          {thread.markdown}
                        </ReactMarkdown>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </aside>
  );
}

function statusClass(status: ReviewThread["status"]) {
  const base = "rounded px-2 py-1 text-xs";
  if (status === "complete") {
    return `${base} bg-emerald-500/10 text-emerald-300`;
  }
  if (status === "failed") {
    return `${base} bg-rose-500/10 text-rose-300`;
  }
  if (status === "running") {
    return `${base} bg-violet-500/10 text-violet-300`;
  }
  return `${base} bg-amber-500/10 text-amber-300`;
}

function formatCommentLocation(selection: CodeSelection) {
  const start = selection.startLine;
  const end = selection.endLine;
  if (start === null || end === null) {
    return selection.filePath;
  }
  return start === end ? `${selection.filePath}:L${start}` : `${selection.filePath}:L${start}-L${end}`;
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 15h10l1-15" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
