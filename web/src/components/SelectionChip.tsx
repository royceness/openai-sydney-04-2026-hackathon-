import { formatSelection } from "../lib/diff";
import type { CodeSelection } from "../types";

export function SelectionChip({ selection }: { selection: CodeSelection | null }) {
  if (!selection) {
    return (
      <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-500">
        Select code in the diff to set review context.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
      {formatSelection(selection)}
    </div>
  );
}

