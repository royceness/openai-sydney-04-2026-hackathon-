import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangedFile, CodeSelection, DraftComment, PullRequestInfo, ReviewThread } from "../types";
import {
  buildReviewRoomContext,
  formatChangedLineSummaries,
  getThreadTextByLineRange,
  listDraftCommentsForVoice,
  listThreadSummariesForVoice,
  resolveFileNavigation,
  resolveFollowUpThread,
  resolveThreadNavigation,
  searchThreadsByText,
  selectedLocationMessage,
  submitGithubReviewFromVoice,
  summarizeChangedLines,
  VoiceSelectionDemo,
} from "./VoiceSelectionDemo";

type VoiceToolOption = {
  name: string;
  execute: (args: Record<string, unknown>) => unknown;
};

type VoiceControllerOptions = {
  activationMode: string;
  audio?: unknown;
  auth: unknown;
  instructions?: string;
  onEvent?: (event: Record<string, unknown>) => void;
  outputMode: string;
  postToolResponse?: boolean;
  toolChoice?: string;
  tools: VoiceToolOption[];
};

const controller = {
  connect: vi.fn(() => Promise.resolve()),
  connected: false,
  destroy: vi.fn(),
  disconnect: vi.fn(),
  sendClientEvent: vi.fn(),
  status: "idle",
};
const createVoiceControlController = vi.fn((options: VoiceControllerOptions) => {
  void options;
  return controller;
});
const defineVoiceTool = vi.fn((definition: VoiceToolOption) => definition);

vi.mock("realtime-voice-component", () => ({
  createVoiceControlController: (options: VoiceControllerOptions) => createVoiceControlController(options),
  defineVoiceTool: (definition: VoiceToolOption) => defineVoiceTool(definition),
  useVoiceControl: () => controller,
}));

const selectedCode: CodeSelection = {
  filePath: "src/review/diagram.ts",
  side: "new",
  startLine: 201,
  endLine: 202,
  selectedText: "const total = items.length;",
};

const changedFiles: ChangedFile[] = [
  {
    path: "src/review/diagram.ts",
    status: "modified",
    additions: 12,
    deletions: 2,
    patch: "@@ -1 +1 @@",
  },
  {
    path: "docs/foo.txt",
    status: "added",
    additions: 3,
    deletions: 0,
    patch: "@@ -0,0 +1 @@",
  },
];

const pullRequestInfo: PullRequestInfo = {
  owner: "acme",
  repo: "review-room",
  number: 247,
  title: "Improve voice review context",
  url: "https://github.com/acme/review-room/pull/247",
  body: "Adds voice context for initial analysis threads.",
  base_ref: "main",
  head_ref: "voice-context",
  base_sha: "base-sha",
  head_sha: "head-sha",
};

const completedThread: ReviewThread = {
  id: "thr_issue",
  source: "manual",
  title: "Found issue",
  status: "complete",
  codex_thread_id: "codex-thread-1",
  markdown: "This thread found a validation issue.\nIt needs a regression test.\nThe fix is small.",
  context: selectedCode,
  created_at: "2026-04-29T00:00:00Z",
  updated_at: "2026-04-29T00:00:00Z",
};

const draftComments: DraftComment[] = [
  {
    id: "draft_1",
    body: "Ask for a clearer README translation.",
    context: selectedCode,
    status: "draft",
    created_at: "2026-04-29T00:01:00Z",
  },
];

function renderVoiceSelectionDemo({
  activeFile = "src/review/diagram.ts",
  activeThreadId = "thr_issue",
  comments = draftComments,
  files = changedFiles,
  onAsk = vi.fn(() => Promise.resolve()),
  onDeleteComment = vi.fn(() => Promise.resolve({ status: "deleted" as const })),
  onDraftComment = vi.fn(() => Promise.resolve({ status: "created" as const })),
  onEditComment = vi.fn(() => Promise.resolve({ status: "updated" as const })),
  onFollowUp = vi.fn(() => Promise.resolve()),
  onNavigateFile = vi.fn(),
  onNavigateThread = vi.fn(),
  pr = pullRequestInfo,
  onSetReviewSubmissionBody = vi.fn(async (body: string) => ({ body, event: null })),
  onSetReviewSubmissionEvent = vi.fn(async (event) => ({ body: "", event })),
  onSubmitReview = vi.fn(() => Promise.resolve()),
  readFileContent = vi.fn(() =>
    Promise.resolve({
      file_path: "src/review/diagram.ts",
      start_line: 200,
      end_line: 203,
      total_lines: 300,
      content: "before\nconst total = items.length;\nafter",
    }),
  ),
  reviewId = "rev_acme_review_room_247",
  selection = selectedCode,
  submission = { body: "", event: null },
  threadStatusAnnouncement = null,
  threads = [completedThread],
}: {
  activeFile?: string | null;
  activeThreadId?: string | null;
  comments?: DraftComment[];
  files?: ChangedFile[];
  onAsk?: (utterance: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<{ status: "deleted" | "not-found" | "failed"; message?: string }>;
  onDraftComment?: (body: string) => Promise<{ status: "created" | "selection-required" | "empty" | "failed"; message?: string }>;
  onEditComment?: (
    commentId: string,
    body: string,
  ) => Promise<{ status: "updated" | "not-found" | "empty" | "failed"; message?: string }>;
  onFollowUp?: (threadId: string, utterance: string) => Promise<void>;
  onNavigateFile?: (filePath: string) => void;
  onNavigateThread?: (threadId: string) => void;
  pr?: PullRequestInfo;
  onSetReviewSubmissionBody?: (body: string) => Promise<{ body: string; event: "comment" | "approve" | "request_changes" | null }>;
  onSetReviewSubmissionEvent?: (
    event: "comment" | "approve" | "request_changes",
  ) => Promise<{ body: string; event: "comment" | "approve" | "request_changes" | null }>;
  onSubmitReview?: (body: string, event: "comment" | "approve" | "request_changes" | null) => Promise<void>;
  readFileContent?: (request: {
    reviewId: string;
    filePath: string;
    startLine?: number;
    endLine?: number;
    contextLines?: number;
  }) => Promise<{
    file_path: string;
    start_line: number;
    end_line: number;
    total_lines: number;
    content: string;
  }>;
  reviewId?: string;
  selection?: CodeSelection | null;
  submission?: { body: string; event: "comment" | "approve" | "request_changes" | null; github_review_url?: string | null };
  threadStatusAnnouncement?: {
    requestId: number;
    threadId: string;
    text: string;
  } | null;
  threads?: ReviewThread[];
} = {}) {
  render(
    <VoiceSelectionDemo
      activeFile={activeFile}
      activeThreadId={activeThreadId}
      comments={comments}
      files={files}
      onAsk={onAsk}
      onDeleteComment={onDeleteComment}
      onDraftComment={onDraftComment}
      onEditComment={onEditComment}
      onFollowUp={onFollowUp}
      onNavigateFile={onNavigateFile}
      onNavigateThread={onNavigateThread}
      pr={pr}
      onSetReviewSubmissionBody={onSetReviewSubmissionBody}
      onSetReviewSubmissionEvent={onSetReviewSubmissionEvent}
      onSubmitReview={onSubmitReview}
      readFileContent={readFileContent}
      reviewId={reviewId}
      selection={selection}
      submission={submission}
      threadStatusAnnouncement={threadStatusAnnouncement}
      threads={threads}
    />,
  );
  const options = createVoiceControlController.mock.calls[0]?.[0];
  if (!options) {
    throw new Error("Expected voice controller options");
  }
  return options;
}

describe("VoiceSelectionDemo", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    controller.connected = false;
    controller.sendClientEvent.mockClear();
    controller.status = "idle";
  });

  it("returns the selected location for the popup message", () => {
    expect(selectedLocationMessage(selectedCode)).toBe("Lines 201-202 of src/review/diagram.ts");
    expect(selectedLocationMessage({ ...selectedCode, endLine: 201 })).toBe("Line 201 of src/review/diagram.ts");
    expect(selectedLocationMessage(null)).toBe("No text is selected.");
  });

  it("resolves relative and named file navigation", () => {
    expect(resolveFileNavigation({ action: "next" }, changedFiles, "src/review/diagram.ts")).toEqual({
      ok: true,
      filePath: "docs/foo.txt",
    });
    expect(resolveFileNavigation({ action: "previous" }, changedFiles, "src/review/diagram.ts")).toEqual({
      ok: true,
      filePath: "docs/foo.txt",
    });
    expect(resolveFileNavigation({ action: "file", filePath: "foo.txt" }, changedFiles, "src/review/diagram.ts")).toEqual({
      ok: true,
      filePath: "docs/foo.txt",
    });
  });

  it("builds voice page context from selected code and focused thread", () => {
    const context = buildReviewRoomContext({
      activeFile: "src/review/diagram.ts",
      activeThreadId: "thr_issue",
      comments: draftComments,
      files: changedFiles,
      pr: pullRequestInfo,
      selection: selectedCode,
      selectedCommentId: "draft_1",
      threads: [completedThread],
    });

    expect(context.selectedCode).toEqual(selectedCode);
    expect(context.pr).toEqual({
      owner: "acme",
      repo: "review-room",
      number: 247,
      title: "Improve voice review context",
      body: "Adds voice context for initial analysis threads.",
      baseRef: "main",
      headRef: "voice-context",
    });
    expect(context.changedFiles).toEqual([
      {
        path: "src/review/diagram.ts",
        status: "modified",
        additions: 12,
        deletions: 2,
      },
      {
        path: "docs/foo.txt",
        status: "added",
        additions: 3,
        deletions: 0,
      },
    ]);
    expect(context.selectedDraftComment?.id).toBe("draft_1");
    expect(context.activeThread?.title).toBe("Found issue");
    expect(context.activeThread?.markdownExcerpt).toContain("validation issue");
    expect(context.popupText).toContain("PR: #247 Improve voice review context");
    expect(context.popupText).toContain("Changed files: MODIFIED src/review/diagram.ts (+12/-2)");
    expect(context.popupText).toContain("Focused thread: Found issue");
    expect(context.popupText).toContain("Selected draft comment: draft_1");
  });

  it("includes auto-generated initial analysis thread status in voice context", () => {
    const initThread: ReviewThread = {
      ...completedThread,
      id: "thr_summary",
      source: "init",
      title: "PR summary",
      status: "running",
      codex_thread_id: null,
      markdown: null,
    };

    const context = buildReviewRoomContext({
      activeFile: "src/review/diagram.ts",
      activeThreadId: null,
      comments: [],
      files: changedFiles,
      pr: pullRequestInfo,
      selection: null,
      threads: [initThread, completedThread],
    });

    expect(context.initialAnalysisThreads).toEqual([
      {
        id: "thr_summary",
        codexThreadId: null,
        title: "PR summary",
        status: "running",
        source: "init",
        autoGeneratedInitialAnalysis: true,
      },
    ]);
    expect(context.threads[0]).toMatchObject({
      id: "thr_summary",
      status: "running",
      source: "init",
      autoGeneratedInitialAnalysis: true,
    });
    expect(context.popupText).toContain("Auto-generated initial analysis threads: PR summary: running");
  });

  it("resolves follow-up target from the focused Codex thread", () => {
    expect(resolveFollowUpThread(undefined, "thr_issue", [completedThread])).toEqual({
      ok: true,
      thread: completedThread,
    });
    expect(resolveFollowUpThread(undefined, null, [completedThread])).toEqual({
      ok: false,
      message: "Click the relevant Codex thread, then ask the follow-up again.",
    });
  });

  it("lists draft PR comments for voice with ids and locations", () => {
    expect(listDraftCommentsForVoice(draftComments)).toEqual([
      {
        id: "draft_1",
        body: "Ask for a clearer README translation.",
        status: "draft",
        filePath: "src/review/diagram.ts",
        side: "new",
        startLine: 201,
        endLine: 202,
        createdAt: "2026-04-29T00:01:00Z",
      },
    ]);
  });

  it("prompts for review details before submitting from voice", async () => {
    const onSubmitReview = { current: vi.fn(() => Promise.resolve()) };

    await expect(
      submitGithubReviewFromVoice({
        comments: draftComments,
        onSubmitReview,
        submission: { body: "", event: null },
      }),
    ).resolves.toEqual({
      status: "needs-details",
      message: "Are you approving or requesting changes? Also do you want to leave a discussion comment too?",
    });

    expect(onSubmitReview.current).not.toHaveBeenCalled();
  });

  it("submits the selected review decision from voice when details are present", async () => {
    const onSubmitReview = { current: vi.fn(() => Promise.resolve()) };

    await expect(
      submitGithubReviewFromVoice({
        comments: draftComments,
        onSubmitReview,
        submission: { body: "Looks good.", event: "approve" },
      }),
    ).resolves.toEqual({ status: "submitted" });

    expect(onSubmitReview.current).toHaveBeenCalledWith("Looks good.", "approve");
  });

  it("lists loaded review thread ids and names for voice", () => {
    expect(listThreadSummariesForVoice([completedThread])).toEqual([
      {
        id: "thr_issue",
        codexThreadId: "codex-thread-1",
        title: "Found issue",
        status: "complete",
        source: "manual",
        autoGeneratedInitialAnalysis: false,
      },
    ]);
  });

  it("reads review thread text by 1-based line range", () => {
    expect(getThreadTextByLineRange([completedThread], "thr_issue", 2, 3)).toEqual({
      ok: true,
      threadId: "thr_issue",
      title: "Found issue",
      startLine: 2,
      endLine: 3,
      totalLines: 3,
      text: "It needs a regression test.\nThe fix is small.",
    });
    expect(getThreadTextByLineRange([completedThread], "missing", 1, 1)).toEqual({
      ok: false,
      message: "No workbench thread matches missing.",
    });
  });

  it("searches loaded review threads with simple text matching", () => {
    expect(searchThreadsByText([completedThread], "REGRESSION")).toEqual({
      query: "REGRESSION",
      matches: [
        {
          threadId: "thr_issue",
          codexThreadId: "codex-thread-1",
          title: "Found issue",
          status: "complete",
          source: "manual",
          autoGeneratedInitialAnalysis: false,
          line: 2,
          text: "It needs a regression test.",
        },
      ],
      initialAnalysisThreads: [],
    });
  });

  it("summarizes changed line ranges from unified patches", () => {
    const summaries = summarizeChangedLines([
      {
        path: "src/review/diagram.ts",
        status: "modified",
        additions: 3,
        deletions: 2,
        patch: "@@ -10,4 +10,5 @@\n context\n-old one\n-old two\n+new one\n+new two\n+new three\n tail",
      },
    ]);

    expect(summaries).toEqual([
      {
        filePath: "src/review/diagram.ts",
        status: "modified",
        patchAvailable: true,
        addedRanges: [{ startLine: 11, endLine: 13 }],
        deletedRanges: [{ startLine: 11, endLine: 12 }],
        changedNewRanges: [{ startLine: 11, endLine: 13 }],
      },
    ]);
    expect(formatChangedLineSummaries(summaries)).toBe("src/review/diagram.ts: added L11-L13; deleted L11-L12");
  });

  it("resolves thread navigation by id and title", () => {
    expect(resolveThreadNavigation({ threadId: "thr_issue" }, [completedThread])).toEqual({
      ok: true,
      thread: {
        id: "thr_issue",
        codexThreadId: "codex-thread-1",
        title: "Found issue",
        status: "complete",
        source: "manual",
        autoGeneratedInitialAnalysis: false,
      },
    });
    expect(resolveThreadNavigation({ title: "issue" }, [completedThread])).toEqual({
      ok: true,
      thread: {
        id: "thr_issue",
        codexThreadId: "codex-thread-1",
        title: "Found issue",
        status: "complete",
        source: "manual",
        autoGeneratedInitialAnalysis: false,
      },
    });
    expect(resolveThreadNavigation({}, [completedThread])).toEqual({
      ok: false,
      message: "Provide a thread id or title to navigate to.",
    });
  });

  it("configures the realtime voice component with the selected-text tool", () => {
    renderVoiceSelectionDemo();

    expect(createVoiceControlController).toHaveBeenCalledWith(
      expect.objectContaining({
        activationMode: "vad",
        audio: { output: { voice: "marin" } },
        auth: { sessionEndpoint: "/api/realtime/session" },
        outputMode: "audio",
        toolChoice: "auto",
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "show_selected_text",
          }),
          expect.objectContaining({
            name: "no_action_required_or_unclear_audio",
          }),
          expect.objectContaining({
            name: "ask_general_question",
          }),
          expect.objectContaining({
            name: "ask_thread_follow_up",
          }),
          expect.objectContaining({
            name: "draft_pr_comment",
          }),
          expect.objectContaining({
            name: "list_pr_comments",
          }),
          expect.objectContaining({
            name: "edit_pr_comment",
          }),
          expect.objectContaining({
            name: "delete_pr_comment",
          }),
          expect.objectContaining({
            name: "get_review_room_context",
          }),
          expect.objectContaining({
            name: "list_review_threads",
          }),
          expect.objectContaining({
            name: "get_review_thread_text",
          }),
          expect.objectContaining({
            name: "search_review_threads",
          }),
          expect.objectContaining({
            name: "navigate_review_thread",
          }),
          expect.objectContaining({
            name: "list_pr_files",
          }),
          expect.objectContaining({
            name: "summarize_changed_lines",
          }),
          expect.objectContaining({
            name: "read_pr_file_range",
          }),
          expect.objectContaining({
            name: "navigate_file",
          }),
        ]),
        postToolResponse: true,
      }),
    );
    expect(screen.getByRole("button", { name: "Start Voice" })).toBeInTheDocument();
  });

  it("instructs the realtime model to stay quiet unless directly answering", () => {
    const options = renderVoiceSelectionDemo();

    expect(options.instructions).toContain("Usually stay quiet");
    expect(options.instructions).toContain("check auto-generated initial analysis threads for high-level PR context");
    expect(options.instructions).toContain("The auto-generated initial analysis threads have source init and are: PR summary, Tests audit, Architecture coherence report, Bug finder, and Doc validator");
    expect(options.instructions).toContain("They may take some time to complete");
    expect(options.instructions).toContain("try to answer from the PR description and changed files");
    expect(options.instructions).toContain("after the initial analysis finishes you can give a deeper answer");
    expect(options.instructions).toContain("Use thread status fields to tell whether an initial analysis thread is queued, running, complete, or failed");
    expect(options.instructions).toContain("Call list_pr_comments");
    expect(options.instructions).toContain("Call edit_pr_comment");
    expect(options.instructions).toContain("Call delete_pr_comment");
    expect(options.instructions).toContain("one or two short sentences");
    expect(options.instructions).toContain("concise and precise");
    expect(options.instructions).toContain("For UI commands, call the matching tool and do not add a spoken confirmation");
    expect(options.instructions).toContain("Call search_review_threads when the user asks whether an answer already exists, asks what previous threads said, asks to search prior answers, or refers ambiguously to something that may already be in a thread");
    expect(options.instructions).toContain("If search_review_threads does not provide enough information and repository investigation is needed, call ask_general_question next");
    expect(options.instructions).toContain("For requests to find tests, test coverage, callers, usages, risks, behavior, or edge cases");
    expect(options.instructions).toContain("search the existing and auto-generated initial analysis threads first");
    expect(options.instructions).toContain("When the user asks you to say, explain, or answer something simple");
  });

  it("logs completed user voice transcripts without repeating duplicates", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const options = renderVoiceSelectionDemo();

    options.onEvent?.({
      type: "conversation.item.input_audio_transcription.completed",
      transcript: "draw a mermaid diagram showing anything",
    });
    options.onEvent?.({
      type: "conversation.item.input_audio_transcription.completed",
      transcript: "draw a mermaid diagram showing anything",
    });
    options.onEvent?.({
      type: "response.output_text.done",
      text: "assistant text",
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith("[voice] user transcript", "draw a mermaid diagram showing anything");
    infoSpy.mockRestore();
  });

  it("logs completed assistant speech transcripts without repeating duplicates", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const options = renderVoiceSelectionDemo();

    options.onEvent?.({
      type: "response.output_audio_transcript.done",
      transcript: "Select some text for the comment.",
    });
    options.onEvent?.({
      type: "response.output_audio_transcript.done",
      transcript: "Select some text for the comment.",
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith("[voice] assistant speech", "Select some text for the comment.");
    infoSpy.mockRestore();
  });

  it("connects through the realtime runtime when the play button is clicked", async () => {
    const user = userEvent.setup();
    renderVoiceSelectionDemo();

    await user.click(screen.getByRole("button", { name: "Start Voice" }));

    expect(controller.connect).toHaveBeenCalledTimes(1);
  });

  it("shows the current selected text when the realtime tool executes", async () => {
    const user = userEvent.setup();
    const options = renderVoiceSelectionDemo();
    const showSelectedText = options.tools.find((tool) => tool.name === "show_selected_text");
    if (!showSelectedText) {
      throw new Error("Expected selected text voice tool");
    }
    showSelectedText.execute({});

    expect(await screen.findByText("Selected lines")).toBeInTheDocument();
    expect(screen.getByText("Lines 201-202 of src/review/diagram.ts")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close voice action popup" }));
    expect(screen.queryByText("Selected lines")).not.toBeInTheDocument();
  });

  it("creates a general question thread when the realtime tool executes", async () => {
    const onAsk = vi.fn(() => Promise.resolve());
    const options = renderVoiceSelectionDemo({ onAsk });
    const askGeneralQuestion = options.tools.find((tool) => tool.name === "ask_general_question");
    if (!askGeneralQuestion) {
      throw new Error("Expected general question voice tool");
    }

    await askGeneralQuestion.execute({ question: "What is the risk in this PR?" });

    expect(onAsk).toHaveBeenCalledWith("What is the risk in this PR?");
    expect(await screen.findByText("Thread started")).toBeInTheDocument();
  });

  it("lists, edits, and deletes PR comments by id when realtime tools execute", async () => {
    const onEditComment = vi.fn(() => Promise.resolve({ status: "updated" as const }));
    const onDeleteComment = vi.fn(() => Promise.resolve({ status: "deleted" as const }));
    const options = renderVoiceSelectionDemo({ onDeleteComment, onEditComment });
    const listPrComments = options.tools.find((tool) => tool.name === "list_pr_comments");
    const editPrComment = options.tools.find((tool) => tool.name === "edit_pr_comment");
    const deletePrComment = options.tools.find((tool) => tool.name === "delete_pr_comment");
    if (!listPrComments || !editPrComment || !deletePrComment) {
      throw new Error("Expected PR comment voice tools");
    }

    expect(listPrComments.execute({})).toEqual({
      ok: true,
      comments: [
        {
          id: "draft_1",
          body: "Ask for a clearer README translation.",
          status: "draft",
          filePath: "src/review/diagram.ts",
          side: "new",
          startLine: 201,
          endLine: 202,
          createdAt: "2026-04-29T00:01:00Z",
        },
      ],
    });
    expect(await screen.findByText("PR comments")).toBeInTheDocument();
    expect(screen.getByText(/draft_1 - src\/review\/diagram\.ts:L201-L202/)).toBeInTheDocument();

    await expect(editPrComment.execute({ commentId: "draft_1", comment: "Ask for Hebrew instead." })).resolves.toEqual({
      ok: true,
      status: "updated",
      commentId: "draft_1",
    });

    expect(onEditComment).toHaveBeenCalledWith("draft_1", "Ask for Hebrew instead.");
    expect(await screen.findByText("PR comment updated")).toBeInTheDocument();

    await expect(deletePrComment.execute({ commentId: "draft_1" })).resolves.toEqual({
      ok: true,
      status: "deleted",
      commentId: "draft_1",
    });

    expect(onDeleteComment).toHaveBeenCalledWith("draft_1");
    expect(await screen.findByText("PR comment deleted")).toBeInTheDocument();
  });

  it("posts a follow-up to the focused thread when the realtime tool executes", async () => {
    const onFollowUp = vi.fn(() => Promise.resolve());
    const options = renderVoiceSelectionDemo({ onFollowUp });
    const askThreadFollowUp = options.tools.find((tool) => tool.name === "ask_thread_follow_up");
    if (!askThreadFollowUp) {
      throw new Error("Expected follow-up voice tool");
    }

    await askThreadFollowUp.execute({ question: "What test would catch this?" });

    expect(onFollowUp).toHaveBeenCalledWith("thr_issue", "What test would catch this?");
    expect(await screen.findByText("Follow-up started")).toBeInTheDocument();
  });

  it("lists, reads, and searches currently loaded thread text when realtime tools execute", async () => {
    const options = renderVoiceSelectionDemo();
    const listThreads = options.tools.find((tool) => tool.name === "list_review_threads");
    const getThreadText = options.tools.find((tool) => tool.name === "get_review_thread_text");
    const searchThreads = options.tools.find((tool) => tool.name === "search_review_threads");
    if (!listThreads || !getThreadText || !searchThreads) {
      throw new Error("Expected thread inspection voice tools");
    }

    expect(listThreads.execute({})).toEqual({
      ok: true,
      threads: [
        {
          id: "thr_issue",
          codexThreadId: "codex-thread-1",
          title: "Found issue",
          status: "complete",
          source: "manual",
          autoGeneratedInitialAnalysis: false,
        },
      ],
    });
    expect(await screen.findByText("Review threads")).toBeInTheDocument();

    expect(getThreadText.execute({ threadId: "thr_issue", startLine: 2, endLine: 2 })).toEqual({
      ok: true,
      threadId: "thr_issue",
      title: "Found issue",
      startLine: 2,
      endLine: 2,
      totalLines: 3,
      text: "It needs a regression test.",
    });

    expect(searchThreads.execute({ query: "small" })).toEqual({
      ok: true,
      query: "small",
      matches: [
        {
          threadId: "thr_issue",
          codexThreadId: "codex-thread-1",
          title: "Found issue",
          status: "complete",
          source: "manual",
          autoGeneratedInitialAnalysis: false,
          line: 3,
          text: "The fix is small.",
        },
      ],
      initialAnalysisThreads: [],
    });
  });

  it("lists PR files when the realtime tool executes", async () => {
    const options = renderVoiceSelectionDemo();
    const listPrFiles = options.tools.find((tool) => tool.name === "list_pr_files");
    if (!listPrFiles) {
      throw new Error("Expected list PR files voice tool");
    }

    const result = listPrFiles.execute({});

    expect(result).toEqual({
      ok: true,
      files: [
        {
          path: "src/review/diagram.ts",
          status: "modified",
          additions: 12,
          deletions: 2,
          previousPath: null,
          patchAvailable: true,
        },
        {
          path: "docs/foo.txt",
          status: "added",
          additions: 3,
          deletions: 0,
          previousPath: null,
          patchAvailable: true,
        },
      ],
    });
    expect(await screen.findByText("Changed files")).toBeInTheDocument();
    expect(screen.getByText(/MODIFIED src\/review\/diagram\.ts \(\+12\/-2\)/)).toBeInTheDocument();
  });

  it("summarizes changed lines when the realtime tool executes", async () => {
    const options = renderVoiceSelectionDemo({
      files: [
        {
          path: "src/review/diagram.ts",
          status: "modified",
          additions: 2,
          deletions: 1,
          patch: "@@ -10,2 +10,3 @@\n-old\n+new\n+next",
        },
      ],
    });
    const summarizeChanged = options.tools.find((tool) => tool.name === "summarize_changed_lines");
    if (!summarizeChanged) {
      throw new Error("Expected changed-line summary voice tool");
    }

    const result = summarizeChanged.execute({ filePath: "diagram.ts" });

    expect(result).toEqual({
      ok: true,
      summaries: [
        {
          filePath: "src/review/diagram.ts",
          status: "modified",
          patchAvailable: true,
          addedRanges: [{ startLine: 10, endLine: 11 }],
          deletedRanges: [{ startLine: 10, endLine: 10 }],
          changedNewRanges: [{ startLine: 10, endLine: 11 }],
        },
      ],
    });
    expect(await screen.findByText("Changed lines")).toBeInTheDocument();
    expect(screen.getByText("src/review/diagram.ts: added L10-L11; deleted L10")).toBeInTheDocument();
  });

  it("reads PR file ranges through the realtime tool", async () => {
    const readFileContent = vi.fn(() =>
      Promise.resolve({
        file_path: "src/review/diagram.ts",
        start_line: 200,
        end_line: 203,
        total_lines: 300,
        content: "before\nconst total = items.length;\nafter",
      }),
    );
    const options = renderVoiceSelectionDemo({ readFileContent });
    const readPrFileRange = options.tools.find((tool) => tool.name === "read_pr_file_range");
    if (!readPrFileRange) {
      throw new Error("Expected read PR file range voice tool");
    }

    await readPrFileRange.execute({
      filePath: "diagram.ts",
      startLine: 201,
      endLine: 202,
      contextLines: 1,
    });

    expect(readFileContent).toHaveBeenCalledWith({
      reviewId: "rev_acme_review_room_247",
      filePath: "src/review/diagram.ts",
      startLine: 201,
      endLine: 202,
      contextLines: 1,
    });
    expect(await screen.findByText("File content")).toBeInTheDocument();
    expect(screen.getByText(/src\/review\/diagram\.ts:L200-L203/)).toBeInTheDocument();
    expect(screen.getByText(/const total = items\.length;/)).toBeInTheDocument();
  });

  it("navigates to a loaded review thread when the realtime tool executes", async () => {
    const onNavigateThread = vi.fn();
    const options = renderVoiceSelectionDemo({ onNavigateThread });
    const navigateThread = options.tools.find((tool) => tool.name === "navigate_review_thread");
    if (!navigateThread) {
      throw new Error("Expected thread navigation voice tool");
    }

    expect(navigateThread.execute({ threadId: "thr_issue" })).toEqual({
      ok: true,
      thread: {
        id: "thr_issue",
        codexThreadId: "codex-thread-1",
        title: "Found issue",
        status: "complete",
        source: "manual",
        autoGeneratedInitialAnalysis: false,
      },
    });

    expect(onNavigateThread).toHaveBeenCalledWith("thr_issue");
    expect(await screen.findByText("Showing Found issue")).toBeInTheDocument();
  });

  it("speaks thread status announcements only when voice is connected and ready", () => {
    controller.connected = true;
    controller.status = "ready";

    renderVoiceSelectionDemo({
      threadStatusAnnouncement: {
        requestId: 1,
        threadId: "thr_issue",
        text: 'The thread "Found issue" is complete.',
      },
    });

    expect(controller.sendClientEvent).toHaveBeenCalledWith({
      type: "response.create",
      response: {
        instructions: 'Say exactly this brief status update and nothing else: "The thread \\"Found issue\\" is complete."',
      },
    });
  });

  it("does not speak thread status announcements when voice is off", () => {
    renderVoiceSelectionDemo({
      threadStatusAnnouncement: {
        requestId: 1,
        threadId: "thr_issue",
        text: 'The thread "Found issue" is complete.',
      },
    });

    expect(controller.sendClientEvent).not.toHaveBeenCalled();
  });

  it("prompts for a focused thread when a follow-up target is ambiguous", async () => {
    const onFollowUp = vi.fn(() => Promise.resolve());
    const options = renderVoiceSelectionDemo({ activeThreadId: null, onFollowUp });
    const askThreadFollowUp = options.tools.find((tool) => tool.name === "ask_thread_follow_up");
    if (!askThreadFollowUp) {
      throw new Error("Expected follow-up voice tool");
    }

    await askThreadFollowUp.execute({ question: "What test would catch this?" });

    expect(onFollowUp).not.toHaveBeenCalled();
    expect(await screen.findByText("Choose a thread")).toBeInTheDocument();
    expect(screen.getByText("Click the relevant Codex thread, then ask the follow-up again.")).toBeInTheDocument();
  });

  it("navigates to the next and named files when the realtime tool executes", async () => {
    const onNavigateFile = vi.fn();
    const options = renderVoiceSelectionDemo({ onNavigateFile });
    const navigateFile = options.tools.find((tool) => tool.name === "navigate_file");
    if (!navigateFile) {
      throw new Error("Expected file navigation voice tool");
    }

    navigateFile.execute({ action: "next" });
    expect(onNavigateFile).toHaveBeenLastCalledWith("docs/foo.txt");
    expect(await screen.findByText("Showing docs/foo.txt")).toBeInTheDocument();

    navigateFile.execute({ action: "file", filePath: "diagram.ts" });
    expect(onNavigateFile).toHaveBeenLastCalledWith("src/review/diagram.ts");
  });
});
