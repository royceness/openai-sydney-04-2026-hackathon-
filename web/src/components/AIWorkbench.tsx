import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { CodeReference, CodeSelection, ReviewThread } from "../types";
import { MermaidBlock } from "./MermaidBlock";

export function AIWorkbench({
  threads,
  selection,
  threadError,
  onAsk,
  onNavigateReference,
}: {
  threads: ReviewThread[];
  selection: CodeSelection | null;
  threadError: string | null;
  onAsk: (utterance: string) => Promise<void>;
  onNavigateReference: (reference: CodeReference) => void;
}) {
  const [utterance, setUtterance] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
