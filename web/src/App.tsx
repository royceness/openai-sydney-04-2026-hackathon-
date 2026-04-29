import { useCallback, useEffect, useRef, useState } from "react";
import {
  createComment,
  createFollowUp,
  createReview,
  createThread,
  deleteComment,
  getBootstrapPrUrl,
  getFileDiff,
  getReview,
  publishComments,
  updateComment,
  updateReviewSubmission,
} from "./api";
import { AIWorkbench } from "./components/AIWorkbench";
import { ChangedFilesPane } from "./components/ChangedFilesPane";
import { DiffPane } from "./components/DiffPane";
import { PullRequestPanel } from "./components/PullRequestPanel";
import type {
  ChangedFile,
  CodeReference,
  CodeSelection,
  DraftComment,
  PullRequestInfo,
  ReviewContext,
  ReviewSubmission,
  ReviewSubmissionEvent,
  ReviewThread,
} from "./types";

type LoadState = "booting" | "needs-pr" | "loading" | "ready" | "failed";

type ReviewState = {
  reviewId: string;
  pr: PullRequestInfo;
  files: ChangedFile[];
  threads: ReviewThread[];
  submission: ReviewSubmission;
};

export type ThreadNavigationRequest = {
  threadId: string;
  requestId: number;
};

export type ThreadStatusAnnouncement = {
  requestId: number;
  threadId: string;
  text: string;
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
  const [threadNavigationRequest, setThreadNavigationRequest] = useState<ThreadNavigationRequest | null>(null);
  const [threadStatusAnnouncement, setThreadStatusAnnouncement] = useState<ThreadStatusAnnouncement | null>(null);
  const [comments, setComments] = useState<DraftComment[]>([]);
  const [pendingCommentBody, setPendingCommentBody] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const reviewContextRef = useRef<ReviewContext | null>(null);
  const commentsRef = useRef<DraftComment[]>([]);
  const previousThreadStatusesRef = useRef<Map<string, ReviewThread["status"]>>(new Map());

  const loadReview = useCallback(async (prUrl: string) => {
    setLoadState("loading");
    setError(null);
    setSelection(null);
    setTargetReference(null);
    setActiveThreadId(null);
    setThreadNavigationRequest(null);
    setThreadStatusAnnouncement(null);
    previousThreadStatusesRef.current = new Map();
    setComments([]);
    setPendingCommentBody(null);
    setCommentError(null);
    try {
      const created = await createReview(prUrl);
      const nextReview = {
        reviewId: created.review_id,
        pr: created.pr,
        files: created.files,
        threads: created.threads,
        submission: created.submission,
      };
      setReview(nextReview);
      setComments(created.comments);
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
      previousThreadStatusesRef.current = new Map();
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
    if (!review) {
      return;
    }

    const announcement = nextThreadStatusAnnouncement(review.threads, previousThreadStatusesRef.current);
    previousThreadStatusesRef.current = new Map(review.threads.map((thread) => [thread.id, thread.status]));
    if (announcement) {
      setThreadStatusAnnouncement(announcement);
    }
  }, [review]);

  const addDraftComment = useCallback(async (body: string, context: CodeSelection) => {
    const reviewContext = reviewContextRef.current;
    if (!reviewContext) {
      throw new Error("Review is not loaded");
    }
    const comment = await createComment({
      reviewId: reviewContext.reviewId,
      body,
      context,
    });
    setComments((current) => [comment, ...current.filter((item) => item.id !== comment.id)]);
    return comment;
  }, []);

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  useEffect(() => {
    if (!pendingCommentBody || !selection) {
      return;
    }
    void addDraftComment(pendingCommentBody, selection)
      .then(() => setPendingCommentBody(null))
      .catch((caught) => setCommentError(caught instanceof Error ? caught.message : "Failed to create comment"));
  }, [addDraftComment, pendingCommentBody, selection]);

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
            submission: session.submission,
          });
          setComments(session.comments);
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
          submission: session.submission,
        });
        setComments(session.comments);
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
        submission: session.submission,
      });
      setComments(session.comments);
      if (response.status === "failed") {
        setThreadError("Follow-up failed to start");
      }
    } catch (caught) {
      setThreadError(caught instanceof Error ? caught.message : "Failed to create follow-up");
    }
  }, []);

  const handleDraftComment = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) {
        return { status: "empty" as const };
      }
      const context = reviewContextRef.current;
      try {
        if (context?.selection) {
          await addDraftComment(trimmed, context.selection);
          return { status: "created" as const };
        }
        if (context?.activeFile) {
          await addDraftComment(trimmed, {
            filePath: context.activeFile,
            side: "new",
            startLine: 1,
            endLine: 1,
            selectedText: "",
          });
          return { status: "created" as const };
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Failed to create comment";
        setCommentError(message);
        return { status: "failed" as const, message };
      }
      setPendingCommentBody(trimmed);
      return { status: "selection-required" as const };
    },
    [addDraftComment],
  );

  const handleEditComment = useCallback(async (commentId: string, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) {
      return { status: "empty" as const };
    }
    const context = reviewContextRef.current;
    if (!context || !commentsRef.current.some((comment) => comment.id === commentId)) {
      return { status: "not-found" as const };
    }
    try {
      const updated = await updateComment({ reviewId: context.reviewId, commentId, body: trimmed });
      setComments((current) => current.map((comment) => (comment.id === commentId ? updated : comment)));
      setCommentError(null);
      return { status: "updated" as const };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to update comment";
      setCommentError(message);
      return { status: "failed" as const, message };
    }
  }, []);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    const context = reviewContextRef.current;
    if (!context || !commentsRef.current.some((comment) => comment.id === commentId)) {
      return { status: "not-found" as const };
    }
    try {
      await deleteComment({ reviewId: context.reviewId, commentId });
      setComments((current) => current.filter((comment) => comment.id !== commentId));
      setCommentError(null);
      return { status: "deleted" as const };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to delete comment";
      setCommentError(message);
      return { status: "failed" as const, message };
    }
  }, []);

  const handleUpdateSubmissionBody = useCallback(async (body: string) => {
    const context = reviewContextRef.current;
    if (!context) {
      throw new Error("Review is not loaded");
    }
    const submission = await updateReviewSubmission({ reviewId: context.reviewId, body });
    setReview((current) => (current ? { ...current, submission } : current));
    return submission;
  }, []);

  const handleUpdateSubmissionEvent = useCallback(async (event: ReviewSubmissionEvent) => {
    const context = reviewContextRef.current;
    if (!context) {
      throw new Error("Review is not loaded");
    }
    const submission = await updateReviewSubmission({ reviewId: context.reviewId, event });
    setReview((current) => (current ? { ...current, submission } : current));
    return submission;
  }, []);

  const handlePublishComments = useCallback(async (body: string, event: ReviewSubmissionEvent | null) => {
    const context = reviewContextRef.current;
    if (!context) {
      return;
    }
    const publishableComments = commentsRef.current.filter((comment) => comment.status === "draft" || comment.status === "failed");
    if (publishableComments.length === 0 && !body.trim()) {
      return;
    }

    const publishableIds = new Set(publishableComments.map((comment) => comment.id));
    setCommentError(null);
    setComments((current) =>
      current.map((comment) =>
        publishableIds.has(comment.id) ? { ...comment, status: "publishing" as const, error: null } : comment,
      ),
    );

    try {
      const response = await publishComments({
        reviewId: context.reviewId,
        commentIds: publishableComments.map((comment) => comment.id),
        body,
        event,
      });
      const publishedById = new Map(response.comments.map((comment) => [comment.id, comment]));
      setComments((current) =>
        current.map((comment) => {
          const published = publishedById.get(comment.id);
          return published ? { ...comment, ...published, error: null } : comment;
        }),
      );
      setReview((current) => (current ? { ...current, submission: response.submission } : current));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to publish comments";
      setCommentError(message);
      setComments((current) =>
        current.map((comment) =>
          publishableIds.has(comment.id) ? { ...comment, status: "failed" as const, error: message } : comment,
        ),
      );
    }
  }, []);

  const handleNavigateThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setThreadNavigationRequest({
      threadId,
      requestId: Date.now(),
    });
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
          comments={comments}
          files={review.files}
          onAsk={(utterance) => handleAsk(utterance, "voice")}
          onDeleteComment={handleDeleteComment}
          onDraftComment={handleDraftComment}
          onEditComment={handleEditComment}
          onFollowUp={(threadId, utterance) => handleFollowUp(threadId, utterance, "voice")}
          onNavigateFile={(filePath) => {
            setActiveFile(filePath);
            setSelection(null);
          }}
          onNavigateThread={handleNavigateThread}
          pr={review.pr}
          reviewId={review.reviewId}
          submission={review.submission}
          selection={selection}
          onSetReviewSubmissionBody={handleUpdateSubmissionBody}
          onSetReviewSubmissionEvent={handleUpdateSubmissionEvent}
          onSubmitReview={(body, event) => handlePublishComments(body, event)}
          threadStatusAnnouncement={threadStatusAnnouncement}
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
        comments={comments}
        commentError={commentError}
        pendingCommentBody={pendingCommentBody}
        submission={review.submission}
        threadNavigationRequest={threadNavigationRequest}
        threads={review.threads}
        selection={selection}
        threadError={threadError}
        onActivateThread={setActiveThreadId}
        onAsk={handleAsk}
        onDeleteComment={handleDeleteComment}
        onFollowUp={handleFollowUp}
        onNavigateReference={handleNavigateReference}
        onPublishComments={handlePublishComments}
        onSetReviewSubmissionBody={handleUpdateSubmissionBody}
        onSetReviewSubmissionEvent={handleUpdateSubmissionEvent}
      />
    </div>
  );
}

export function nextThreadStatusAnnouncement(
  threads: ReviewThread[],
  previousStatuses: Map<string, ReviewThread["status"]>,
): ThreadStatusAnnouncement | null {
  const changedThread = threads.find((thread) => {
    if (thread.source === "init") {
      return false;
    }
    const previous = previousStatuses.get(thread.id);
    return previous !== undefined && isInProgressStatus(previous) && isTerminalStatus(thread.status);
  });
  if (!changedThread) {
    return null;
  }
  return {
    requestId: Date.now(),
    threadId: changedThread.id,
    text: threadStatusAnnouncementText(changedThread),
  };
}

function isInProgressStatus(status: ReviewThread["status"]) {
  return status === "queued" || status === "running";
}

function isTerminalStatus(status: ReviewThread["status"]) {
  return status === "complete" || status === "failed";
}

function threadStatusAnnouncementText(thread: ReviewThread) {
  if (thread.status === "complete") {
    return `The thread "${thread.title}" is complete.`;
  }
  return `The thread "${thread.title}" failed.`;
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
