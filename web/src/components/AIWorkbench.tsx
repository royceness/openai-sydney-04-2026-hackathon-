import type { ReviewThread } from "../types";

export function AIWorkbench({ threads }: { threads: ReviewThread[] }) {
  return (
    <aside className="flex h-screen w-[34rem] shrink-0 flex-col bg-[#080a0f]">
      <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
        <div>
          <div className="text-sm font-semibold text-slate-100">AI Workbench</div>
          <div className="text-xs text-slate-500">Codex threads arrive in the next stage</div>
        </div>
        <span className="rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-500">{threads.length} threads</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {threads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/70 p-5 text-sm leading-6 text-slate-400">
            Select code in the diff first. The next implementation stage adds a manual question box here, then voice tools that create
            persistent Codex-backed accordion threads.
          </div>
        ) : (
          threads.map((thread) => (
            <article className="mb-3 rounded-lg border border-slate-800 bg-slate-950 p-4" key={thread.id}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-100">{thread.title}</h3>
                <span className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-400">{thread.status}</span>
              </div>
              {thread.markdown ? <p className="mt-3 text-sm text-slate-300">{thread.markdown}</p> : null}
            </article>
          ))
        )}
      </div>
    </aside>
  );
}

