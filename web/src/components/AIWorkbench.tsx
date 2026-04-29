import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { CodeReference, CodeSelection, DraftComment, ReviewThread } from "../types";
import { MermaidBlock } from "./MermaidBlock";

export function AIWorkbench({
  activeThreadId,
  comments,
  commentError,
  pendingCommentBody,
  threads,
  selection,
  threadError,
  onActivateThread,
  onAsk,
  onDeleteComment,
  onNavigateReference,
  onFollowUp,
  onPublishComments,
}: {
  activeThreadId: string | null;
  comments: DraftComment[];
  commentError: string | null;
  pendingCommentBody: string | null;
  threads: ReviewThread[];
  selection: CodeSelection | null;
  threadError: string | null;
  onActivateThread: (threadId: string) => void;
  onAsk: (utterance: string) => Promise<void>;
  onDeleteComment: (commentId: string) => { status: "deleted" | "not-found" };
  onNavigateReference: (reference: CodeReference) => void;
  onFollowUp: (threadId: string, utterance: string) => Promise<void>;
  onPublishComments: () => Promise<void>;
}) {
  const [utterance, setUtterance] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [publishingComments, setPublishingComments] = useState(false);
  const knownThreadIdsRef = useRef(new Set(threads.map((thread) => thread.id)));
  const [openThreadIds, setOpenThreadIds] = useState<Set<string>>(() => new Set(threads.map((thread) => thread.id)));
  const publishableCommentCount = comments.filter((comment) => comment.status === "draft" || comment.status === "failed").length;
  const hasPublishingComment = comments.some((comment) => comment.status === "publishing");

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
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {publishableCommentCount > 0
                    ? `${publishableCommentCount} ready to publish`
                    : comments.length > 0
                      ? "No unpublished drafts"
                      : "No comments drafted"}
                </div>
                <button
                  className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={publishableCommentCount === 0 || publishingComments || hasPublishingComment}
                  onClick={() => {
                    setPublishingComments(true);
                    void onPublishComments().finally(() => setPublishingComments(false));
                  }}
                  type="button"
                >
                  <UploadIcon />
                  {publishingComments || hasPublishingComment ? "Publishing" : "Publish"}
                </button>
              </div>
              {commentError ? <div className="rounded-md border border-rose-900/70 bg-rose-950/30 p-3 text-sm text-rose-100">{commentError}</div> : null}
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
                      <span className={commentStatusClass(comment.status)}>{comment.status}</span>
                      {comment.status === "published" && comment.github_comment_url ? (
                        <a
                          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-violet-400 hover:text-violet-100"
                          href={comment.github_comment_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          GitHub
                        </a>
                      ) : null}
                      {comment.status !== "published" ? (
                        <button
                          aria-label={`Delete draft comment at ${formatCommentLocation(comment.context)}`}
                          className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={comment.status === "publishing"}
                          onClick={() => onDeleteComment(comment.id)}
                          title="Delete draft comment"
                          type="button"
                        >
                          <TrashIcon />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200" data-comment-id={comment.id}>
                    {comment.body}
                  </div>
                  {comment.error ? <div className="mt-2 text-xs text-rose-300">{comment.error}</div> : null}
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
            const isActive = activeThreadId === thread.id;

            return (
              <article
                className={
                  isActive
                    ? "mb-3 overflow-hidden rounded-lg border border-violet-500/70 bg-slate-950 shadow-lg shadow-violet-950/30"
                    : "mb-3 overflow-hidden rounded-lg border border-slate-800 bg-slate-950"
                }
                key={thread.id}
              >
                <button
                  aria-expanded={isOpen}
                  aria-pressed={isActive}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-900/70"
                  onClick={() => {
                    onActivateThread(thread.id);
                    setOpenThreadIds((current) => {
                      const next = new Set(current);
                      if (!isActive) {
                        next.add(thread.id);
                        return next;
                      }
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
                    {isActive ? <span className="rounded bg-violet-500/10 px-2 py-1 text-xs text-violet-200">voice context</span> : null}
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
                              const reference = parseCodeReference(source);
                              if (!className && reference) {
                                return (
                                  <button
                                    className="rounded border border-violet-500/40 bg-violet-500/10 px-1 py-0.5 font-mono text-[0.95em] text-violet-200 hover:border-violet-300 hover:text-violet-100"
                                    onClick={() => onNavigateReference(reference)}
                                    type="button"
                                  >
                                    {source}
                                  </button>
                                );
                              }
                              return <code className={className}>{children}</code>;
                            },
                          }}
                        >
                          {thread.markdown}
                        </ReactMarkdown>
                      </div>
                    ) : null}
                    {isActive ? (
                      <FollowUpForm
                        onSubmit={(utterance) => onFollowUp(thread.id, utterance)}
                        disabled={thread.status === "queued" || thread.status === "running"}
                      />
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

export function parseCodeReference(value: string): CodeReference | null {
  const match = /^(?<filePath>[^:\s][^:\n]*):L(?<startLine>\d+)(?:-L?(?<endLine>\d+))?$/.exec(value.trim());
  if (!match?.groups) {
    return null;
  }

  const startLine = Number.parseInt(match.groups.startLine, 10);
  const endLineText = match.groups.endLine;
  const endLine = endLineText ? Number.parseInt(endLineText, 10) : undefined;
  if (!Number.isSafeInteger(startLine) || startLine < 1) {
    return null;
  }
  if (endLine !== undefined && (!Number.isSafeInteger(endLine) || endLine < startLine)) {
    return null;
  }
  return {
    filePath: match.groups.filePath,
    startLine,
    ...(endLine !== undefined ? { endLine } : {}),
  };
}

function FollowUpForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (utterance: string) => Promise<void>;
}) {
  const [utterance, setUtterance] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="mt-3 flex gap-2 border-t border-slate-800 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = utterance.trim();
        if (!trimmed) {
          return;
        }
        setSubmitting(true);
        void onSubmit(trimmed)
          .then(() => setUtterance(""))
          .finally(() => setSubmitting(false));
      }}
    >
      <input
        className="min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-violet-500/30 placeholder:text-slate-600 focus:ring-4"
        disabled={disabled || submitting}
        onChange={(event) => setUtterance(event.target.value)}
        placeholder="Ask a follow-up..."
        value={utterance}
      />
      <button
        className="rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!utterance.trim() || disabled || submitting}
        type="submit"
      >
        {submitting ? "Asking" : "Follow up"}
      </button>
    </form>
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

function commentStatusClass(status: DraftComment["status"]) {
  if (status === "published") {
    return "rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200";
  }
  if (status === "failed") {
    return "rounded bg-rose-500/10 px-2 py-1 text-xs text-rose-200";
  }
  if (status === "publishing") {
    return "rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-200";
  }
  return "rounded bg-slate-800 px-2 py-1 text-xs text-slate-300";
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

function UploadIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M12 16V4" strokeLinecap="round" />
      <path d="m7 9 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 20h14" strokeLinecap="round" />
    </svg>
  );
}
