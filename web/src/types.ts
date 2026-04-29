export type PullRequestInfo = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  author?: string | null;
  body?: string | null;
  base_ref: string;
  head_ref: string;
  base_sha: string;
  head_sha: string;
};

export type ChangedFile = {
  path: string;
  status: "added" | "modified" | "removed" | "renamed" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  patch?: string | null;
  previous_path?: string | null;
};

export type ReviewThread = {
  id: string;
  source: "init" | "voice" | "manual" | "comment";
  title: string;
  status: "queued" | "running" | "complete" | "failed";
  prompt?: string | null;
  utterance?: string | null;
  context?: CodeSelection | null;
  codex_thread_id?: string | null;
  markdown?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
};

export type TestRun = {
  id: string;
  status: "queued" | "running" | "passed" | "failed";
  command: string;
  exit_code?: number | null;
  stdout: string;
  stderr: string;
  error?: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewSession = {
  id: string;
  pr: PullRequestInfo;
  files: ChangedFile[];
  threads: ReviewThread[];
  comments: DraftComment[];
  submission: ReviewSubmission;
  test_runs: TestRun[];
  repo_path?: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateReviewResponse = {
  review_id: string;
  pr: PullRequestInfo;
  files: ChangedFile[];
  threads: ReviewThread[];
  comments: DraftComment[];
  submission: ReviewSubmission;
  test_runs: TestRun[];
};

export type FileDiffResponse = {
  file_path: string;
  diff: string;
};

export type FileContentResponse = {
  file_path: string;
  start_line: number;
  end_line: number;
  total_lines: number;
  content: string;
};

export type CreateThreadResponse = {
  thread_id: string;
  status: "queued" | "running" | "complete" | "failed";
};

export type CreateFollowUpResponse = {
  thread_id: string;
  status: "queued" | "running" | "complete" | "failed";
};

export type CodeSelection = {
  filePath: string;
  side: "old" | "new";
  startLine: number | null;
  endLine: number | null;
  selectedText: string;
  diffHunk?: string;
  commitSha?: string;
};

export type DraftComment = {
  id: string;
  source?: "github" | "draft";
  body: string;
  context: CodeSelection;
  status: "imported" | "draft" | "publishing" | "published" | "failed";
  author?: string | null;
  github_comment_id?: number | null;
  github_comment_url?: string | null;
  created_at: string;
  updated_at?: string;
  error?: string | null;
};

export type ReviewSubmissionEvent = "comment" | "approve" | "request_changes";

export type ReviewSubmission = {
  body: string;
  event: ReviewSubmissionEvent | null;
  github_review_url?: string | null;
};

export type ReviewComment = DraftComment;

export type PublishCommentsResponse = {
  comments: PublishedComment[];
  submission: ReviewSubmission;
};

export type PublishedComment = {
  id: string;
  body: string;
  context: CodeSelection;
  status: "published";
  github_comment_url: string;
};

export type DeleteCommentResponse = {
  comment_id: string;
  status: "deleted";
};

export type CodeReference = {
  filePath: string;
  startLine: number;
  endLine?: number;
};

export type ReviewContext = {
  reviewId: string;
  pr: PullRequestInfo;
  activeFile?: string;
  selection?: CodeSelection;
};

export type DiffLine = {
  id: string;
  kind: "hunk" | "add" | "del" | "context" | "meta";
  content: string;
  raw: string;
  oldLine: number | null;
  newLine: number | null;
  side: "old" | "new";
};
