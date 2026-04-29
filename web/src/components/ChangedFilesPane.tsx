import type { ChangedFile } from "../types";

export function ChangedFilesPane({
  files,
  activeFile,
  onSelectFile,
}: {
  files: ChangedFile[];
  activeFile: string | null;
  onSelectFile: (filePath: string) => void;
}) {
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return (
    <aside className="flex h-screen w-[19rem] shrink-0 flex-col border-r border-slate-800/80 bg-[#07090d]">
      <div className="flex h-16 items-center gap-3 border-b border-slate-800/80 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-violet-500 font-bold">RR</div>
        <div>
          <div className="font-semibold">Review Room</div>
          <div className="text-xs text-slate-500">Changed files</div>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-4">
        <h2 className="text-sm font-semibold text-slate-200">Changed Files</h2>
        <span className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-400">{files.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {files.map((file) => (
          <button
            className={`grid w-full grid-cols-[2rem_1fr_auto] items-center gap-2 border-t border-slate-900 px-4 py-3 text-left text-sm hover:bg-slate-900/70 ${
              activeFile === file.path ? "bg-violet-500/15 text-white ring-1 ring-inset ring-violet-500/40" : "text-slate-300"
            }`}
            key={file.path}
            onClick={() => onSelectFile(file.path)}
            type="button"
          >
            <span className={statusClass(file.status)}>{file.status.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 truncate font-medium">{file.path}</span>
            <span className="tabular-nums">
              <span className="text-emerald-400">+{file.additions}</span>
              <span className="ml-2 text-rose-400">-{file.deletions}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-slate-800 px-4 py-4 text-sm">
        <span className="text-slate-300">{files.length} files changed</span>
        <span className="tabular-nums">
          <span className="text-emerald-400">+{totalAdditions}</span>
          <span className="ml-3 text-rose-400">-{totalDeletions}</span>
        </span>
      </div>
    </aside>
  );
}

function statusClass(status: ChangedFile["status"]) {
  const base = "flex h-6 w-6 items-center justify-center rounded border text-xs font-bold";
  if (status === "added") {
    return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-300`;
  }
  if (status === "removed") {
    return `${base} border-rose-500/30 bg-rose-500/10 text-rose-300`;
  }
  if (status === "renamed") {
    return `${base} border-amber-500/30 bg-amber-500/10 text-amber-300`;
  }
  return `${base} border-slate-600 bg-slate-900 text-slate-300`;
}
