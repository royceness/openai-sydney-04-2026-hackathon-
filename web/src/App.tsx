import { useCallback, useEffect, useRef, useState } from "react";
import { createFollowUp, createReview, createThread, getBootstrapPrUrl, getFileDiff, getReview } from "./api";
import { AIWorkbench } from "./components/AIWorkbench";
import { ChangedFilesPane } from "./components/ChangedFilesPane";
import { DiffPane } from "./components/DiffPane";
import { PullRequestPanel } from "./components/PullRequestPanel";
import type { ChangedFile, CodeReference, CodeSelection, PullRequestInfo, ReviewContext, ReviewThread } from "./types";

type LoadState = "booting" | "needs-pr" | "loading" | "ready" | "failed";

type ReviewState = {
  reviewId: string;
  pr: PullRequestInfo;
  files: ChangedFile[];
  threads: ReviewThread[];
};

export default function App() {
  const [loadState, setLoadState] = useState<LoadState>("booting");
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeDiff, setActiveDiff] = useState<string>("");
  const [diffError, setDiffError] = useState<string | null>(null);
  const [selection, setSelection] = useState<CodeSelection | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [targetReference, setTargetReference] = useState<CodeReference | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const reviewContextRef = useRef<ReviewContext | null>(null);

  const loadReview = useCallback(async (prUrl: string) => {
    setLoadState("loading");
    setError(null);
    setSelection(null);
    setTargetReference(null);
    setActiveThreadId(null);
    try {
      const created = await createReview(prUrl);
      const nextReview = {
        reviewId: created.review_id,
        pr: created.pr,
        files: created.files,
        threads: created.threads,
      };
      setReview(nextReview);
      setLoadState("ready");
      const firstPatchFile = created.files.find((file) => file.patch);
      if (firstPatchFile) {
        setActiveFile(firstPatchFile.path);
      }
    } catch (caught) {
      setLoadState("failed");
      setError(caught instanceof Error ? caught.message : "Failed to load PR");
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      const prFromUrl = params.get("pr");
      if (prFromUrl) {
        await loadReview(prFromUrl);
        return;
      }

      try {
        const bootPr = await getBootstrapPrUrl();
        if (bootPr) {
          await loadReview(bootPr);
        } else {
          setLoadState("needs-pr");
        }
      } catch (caught) {
        setLoadState("failed");
        setError(caught instanceof Error ? caught.message : "Failed to bootstrap app");
      }
    };

    void boot();
  }, [loadReview]);

  useEffect(() => {
    if (!review || !activeFile) {
      setActiveDiff("");
      return;
    }

    let cancelled = false;
    setDiffError(null);
    getFileDiff(review.reviewId, activeFile)
      .then((response) => {
        if (!cancelled) {
          setActiveDiff(response.diff);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setActiveDiff("");
          setDiffError(caught instanceof Error ? caught.message : "Failed to load diff");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeFile, review?.reviewId]);

  useEffect(() => {
    if (!review) {
      reviewContextRef.current = null;
      return;
    }
    reviewContextRef.current = {
      reviewId: review.reviewId,
      pr: review.pr,
      activeFile: activeFile ?? undefined,
      selection: selection ?? undefined,
    };
  }, [activeFile, review, selection]);

  useEffect(() => {
    if (!review || !review.threads.some((thread) => thread.status === "queued" || thread.status === "running")) {
      return;
    }

    const interval = window.setInterval(() => {
      getReview(review.reviewId)
        .then((session) => {
          setReview({
            reviewId: session.id,
            pr: session.pr,
            files: session.files,
            threads: session.threads,
          });
        })
        .catch((caught) => setThreadError(caught instanceof Error ? caught.message : "Failed to refresh threads"));
    }, 500);

    return () => window.clearInterval(interval);
  }, [review]);

  const handleAsk = useCallback(
    async (utterance: string, source: ReviewThread["source"] = "manual") => {
      const context = reviewContextRef.current;
      if (!context) {
        return;
      }
      setThreadError(null);
      try {
        const response = await createThread({
          reviewId: context.reviewId,
          source,
          title: utterance,
          utterance,
          context: context.selection ?? null,
        });
        const session = await getReview(context.reviewId);
        setReview({
          reviewId: session.id,
          pr: session.pr,
          files: session.files,
          threads: session.threads,
        });
        if (response.status === "failed") {
          setThreadError("Thread failed to start");
        }
      } catch (caught) {
        setThreadError(caught instanceof Error ? caught.message : "Failed to create thread");
      }
    },
    [],
  );

  const handleNavigateReference = useCallback((reference: CodeReference) => {
    setActiveFile(reference.filePath);
    setSelection(null);
    setTargetReference(reference);
  }, []);

  const handleFollowUp = useCallback(async (threadId: string, utterance: string, source: "voice" | "manual" = "manual") => {
    const context = reviewContextRef.current;
    if (!context) {
      return;
    }
    setThreadError(null);
    try {
      const response = await createFollowUp({
        reviewId: context.reviewId,
        threadId,
        source,
        utterance,
      });
      const session = await getReview(context.reviewId);
      setReview({
        reviewId: session.id,
        pr: session.pr,
        files: session.files,
        threads: session.threads,
      });
      if (response.status === "failed") {
        setThreadError("Follow-up failed to start");
      }
    } catch (caught) {
      setThreadError(caught instanceof Error ? caught.message : "Failed to create follow-up");
    }
  }, []);

  if (loadState === "booting" || loadState === "loading") {
    return <LoadingScreen label={loadState === "booting" ? "Starting Review Room" : "Loading pull request"} />;
  }

  if (loadState === "needs-pr") {
    return <PrUrlForm onSubmit={loadReview} />;
  }

  if (loadState === "failed" || !review) {
    return <ErrorScreen error={error ?? "Review Room failed to start"} onRetry={() => setLoadState("needs-pr")} />;
  }

  return (
    <div className="flex h-screen min-w-[1320px] bg-[#080a0f] text-slate-100">
      <ChangedFilesPane
        files={review.files}
        activeFile={activeFile}
        onSelectFile={(filePath) => {
          setActiveFile(filePath);
          setSelection(null);
        }}
      />
      <main className="flex min-w-[38rem] flex-1 flex-col border-x border-slate-800/80">
        <PullRequestPanel
          activeFile={activeFile}
          activeThreadId={activeThreadId}
          files={review.files}
          onAsk={(utterance) => handleAsk(utterance, "voice")}
          onFollowUp={(threadId, utterance) => handleFollowUp(threadId, utterance, "voice")}
          onNavigateFile={(filePath) => {
            setActiveFile(filePath);
            setSelection(null);
          }}
          pr={review.pr}
          reviewId={review.reviewId}
          selection={selection}
          threads={review.threads}
        />
        <DiffPane
          filePath={activeFile}
          diff={activeDiff}
          diffError={diffError}
          targetReference={targetReference}
          selection={selection}
          onSelectionChange={setSelection}
        />
      </main>
      <AIWorkbench
        activeThreadId={activeThreadId}
        threads={review.threads}
        selection={selection}
        threadError={threadError}
        onActivateThread={setActiveThreadId}
        onAsk={handleAsk}
        onFollowUp={handleFollowUp}
        onNavigateReference={handleNavigateReference}
      />
    </div>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#080a0f] text-slate-100">
      <div className="rounded-lg border border-slate-800 bg-slate-950 px-6 py-5 shadow-2xl">
        <div className="text-sm uppercase tracking-[0.25em] text-violet-300">Review Room</div>
        <div className="mt-2 text-lg font-semibold">{label}</div>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#080a0f] text-slate-100">
      <div className="w-full max-w-md rounded-lg border border-red-900/70 bg-red-950/30 p-6">
        <h1 className="text-xl font-semibold">Could not load Review Room</h1>
        <p className="mt-3 text-sm leading-6 text-red-100">{error}</p>
        <button
          className="mt-5 rounded-md bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400"
          onClick={onRetry}
        >
          Enter PR URL
        </button>
      </div>
    </div>
  );
}

function PrUrlForm({ onSubmit }: { onSubmit: (prUrl: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="flex h-screen items-center justify-center bg-[#080a0f] px-4 text-slate-100">
      <form
        className="w-full max-w-xl rounded-lg border border-slate-800 bg-slate-950 p-6 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitting(true);
          void onSubmit(value).finally(() => setSubmitting(false));
        }}
      >
        <div className="text-sm uppercase tracking-[0.25em] text-violet-300">Review Room</div>
        <h1 className="mt-3 text-2xl font-semibold">Open a public GitHub PR</h1>
        <div className="mt-5 flex gap-3">
          <input
            className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-violet-500/40 placeholder:text-slate-500 focus:ring-4"
            placeholder="https://github.com/owner/repo/pull/123"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button
            className="rounded-md bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
            disabled={!value || submitting}
            type="submit"
          >
            {submitting ? "Loading" : "Load"}
          </button>
        </div>
      </form>
    </div>
  );
}
