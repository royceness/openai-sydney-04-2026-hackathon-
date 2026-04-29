import type {
  CodeSelection,
  CreateFollowUpResponse,
  CreateReviewResponse,
  CreateThreadResponse,
  FileContentResponse,
  FileDiffResponse,
  ReviewSession,
  ReviewThread,
} from "./types";

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : response.statusText;
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export async function getBootstrapPrUrl(): Promise<string | null> {
  const response = await fetch("/api/bootstrap");
  const body = await readJson<{ pr_url: string | null }>(response);
  return body.pr_url;
}

export async function createReview(prUrl: string): Promise<CreateReviewResponse> {
  const response = await fetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pr_url: prUrl }),
  });
  return readJson<CreateReviewResponse>(response);
}

export async function getReview(reviewId: string): Promise<ReviewSession> {
  const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}`);
  return readJson<ReviewSession>(response);
}

export async function getFileDiff(reviewId: string, filePath: string): Promise<FileDiffResponse> {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/files/${encodedPath}/diff`);
  return readJson<FileDiffResponse>(response);
}

export async function getFileContent({
  reviewId,
  filePath,
  startLine,
  endLine,
  contextLines,
}: {
  reviewId: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  contextLines?: number;
}): Promise<FileContentResponse> {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const params = new URLSearchParams();
  if (startLine !== undefined) {
    params.set("start_line", String(startLine));
  }
  if (endLine !== undefined) {
    params.set("end_line", String(endLine));
  }
  if (contextLines !== undefined) {
    params.set("context", String(contextLines));
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/files/${encodedPath}/content${query}`);
  return readJson<FileContentResponse>(response);
}

export async function createThread({
  reviewId,
  source = "manual",
  title,
  utterance,
  context,
}: {
  reviewId: string;
  source?: ReviewThread["source"];
  title: string;
  utterance: string;
  context: CodeSelection | null;
}): Promise<CreateThreadResponse> {
  const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source,
      title,
      utterance,
      context,
    }),
  });
  return readJson<CreateThreadResponse>(response);
}

export async function createFollowUp({
  reviewId,
  threadId,
  source = "manual",
  utterance,
}: {
  reviewId: string;
  threadId: string;
  source?: "voice" | "manual";
  utterance: string;
}): Promise<CreateFollowUpResponse> {
  const response = await fetch(
    `/api/reviews/${encodeURIComponent(reviewId)}/threads/${encodeURIComponent(threadId)}/followups`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source,
        utterance,
      }),
    },
  );
  return readJson<CreateFollowUpResponse>(response);
}
