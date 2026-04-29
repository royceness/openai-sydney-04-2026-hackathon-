import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { CodeSelection, ReviewThread } from "../types";

export function AIWorkbench({
  threads,
  selection,
  threadError,
  onAsk,
}: {
  threads: ReviewThread[];
  selection: CodeSelection | null;
  threadError: string | null;
  onAsk: (utterance: string) => Promise<void>;
}) {
  const [utterance, setUtterance] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <aside className="flex h-screen w-[34rem] shrink-0 flex-col bg-[#080a0f]">
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
          threads.map((thread) => (
            <article className="mb-3 rounded-lg border border-slate-800 bg-slate-950 p-4" key={thread.id}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-100">{thread.title}</h3>
                <span className={statusClass(thread.status)}>{thread.status}</span>
              </div>
              {thread.context ? (
                <div className="mt-1 text-xs text-slate-500">
                  {thread.context.filePath}
                  {thread.context.startLine ? `:L${thread.context.startLine}` : ""}
                  {thread.context.endLine && thread.context.endLine !== thread.context.startLine ? `-L${thread.context.endLine}` : ""}
                </div>
              ) : null}
              {thread.status === "queued" || thread.status === "running" ? (
                <p className="mt-3 text-sm text-slate-400">Codex is working...</p>
              ) : null}
              {thread.error ? <p className="mt-3 text-sm text-rose-300">{thread.error}</p> : null}
              {thread.markdown ? (
                <div className="markdown-body mt-3 text-sm leading-6 text-slate-300">
                  <ReactMarkdown>{thread.markdown}</ReactMarkdown>
                </div>
              ) : null}
            </article>
          ))
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
