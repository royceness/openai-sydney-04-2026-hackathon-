import type {
  ChangedFile,
  CodeSelection,
  DraftComment,
  PullRequestInfo,
  ReviewSubmission,
  ReviewSubmissionEvent,
  ReviewThread,
} from "../types";
import type { ThreadStatusAnnouncement } from "../App";
import { VoiceSelectionDemo } from "./VoiceSelectionDemo";

export function PullRequestPanel({
  activeFile,
  activeThreadId,
  comments,
  files,
  onAsk,
  onDeleteComment,
  onDraftComment,
  onDraftCommentAtLocation,
  onEditComment,
  onFollowUp,
  onNavigateFile,
  onNavigateThread,
  onSetReviewSubmissionBody,
  onSetReviewSubmissionEvent,
  onSubmitReview,
  pr,
  reviewId,
  submission,
  selection,
  threadStatusAnnouncement,
  threads,
}: {
  activeFile: string | null;
  activeThreadId: string | null;
  comments: DraftComment[];
  files: ChangedFile[];
  onAsk: (utterance: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<{ status: "deleted" | "not-found" | "failed"; message?: string }>;
  onDraftComment: (body: string) => Promise<{ status: "created" | "selection-required" | "empty" | "failed"; message?: string }>;
  onDraftCommentAtLocation: (
    body: string,
    context: CodeSelection,
  ) => Promise<{ status: "created" | "empty" | "failed"; message?: string }>;
  onEditComment: (commentId: string, body: string) => Promise<{ status: "updated" | "not-found" | "empty" | "failed"; message?: string }>;
  onFollowUp: (threadId: string, utterance: string) => Promise<void>;
  onNavigateFile: (filePath: string) => void;
  onNavigateThread: (threadId: string) => void;
  onSetReviewSubmissionBody: (body: string) => Promise<ReviewSubmission>;
  onSetReviewSubmissionEvent: (event: ReviewSubmissionEvent) => Promise<ReviewSubmission>;
  onSubmitReview: (body: string, event: ReviewSubmissionEvent | null) => Promise<void>;
  pr: PullRequestInfo;
  reviewId: string;
  submission: ReviewSubmission;
  selection: CodeSelection | null;
  threadStatusAnnouncement: ThreadStatusAnnouncement | null;
  threads: ReviewThread[];
}) {
  return (
    <section className="border-b border-slate-800 bg-[#0b0e14] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <a className="rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-1 font-semibold text-violet-200" href={pr.url}>
              PR #{pr.number}
            </a>
            <span>
              {pr.owner}/{pr.repo}
            </span>
            <span>
              {pr.head_ref} to {pr.base_ref}
            </span>
            {pr.author ? <span>by {pr.author}</span> : null}
          </div>
          <h1 className="mt-3 text-xl font-semibold text-white">{pr.title}</h1>
        </div>
        <VoiceSelectionDemo
          activeFile={activeFile}
          activeThreadId={activeThreadId}
          comments={comments}
          files={files}
          onAsk={onAsk}
          onDeleteComment={onDeleteComment}
          onDraftComment={onDraftComment}
          onDraftCommentAtLocation={onDraftCommentAtLocation}
          onEditComment={onEditComment}
          onFollowUp={onFollowUp}
          onNavigateFile={onNavigateFile}
          onNavigateThread={onNavigateThread}
          pr={pr}
          onSetReviewSubmissionBody={onSetReviewSubmissionBody}
          onSetReviewSubmissionEvent={onSetReviewSubmissionEvent}
          onSubmitReview={onSubmitReview}
          reviewId={reviewId}
          submission={submission}
          selection={selection}
          threadStatusAnnouncement={threadStatusAnnouncement}
          threads={threads}
        />
      </div>
      {pr.body ? (
        <div className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-300">{pr.body}</div>
      ) : (
        <div className="mt-4 text-sm text-slate-500">No PR description provided.</div>
      )}
    </section>
  );
}
