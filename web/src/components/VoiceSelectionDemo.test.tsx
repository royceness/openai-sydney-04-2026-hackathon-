import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangedFile, CodeSelection, ReviewThread } from "../types";
import {
  buildReviewRoomContext,
  getThreadTextByLineRange,
  listThreadSummariesForVoice,
  resolveFileNavigation,
  resolveFollowUpThread,
  resolveThreadNavigation,
  searchThreadsByText,
  selectedLocationMessage,
  VoiceSelectionDemo,
} from "./VoiceSelectionDemo";

type VoiceToolOption = {
  name: string;
  execute: (args: Record<string, unknown>) => unknown;
};

type VoiceControllerOptions = {
  activationMode: string;
  auth: unknown;
  onEvent?: (event: Record<string, unknown>) => void;
  outputMode: string;
  postToolResponse?: boolean;
  tools: VoiceToolOption[];
};

const controller = {
  connect: vi.fn(() => Promise.resolve()),
  connected: false,
  destroy: vi.fn(),
  disconnect: vi.fn(),
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

function renderVoiceSelectionDemo({
  activeFile = "src/review/diagram.ts",
  activeThreadId = "thr_issue",
  files = changedFiles,
  onAsk = vi.fn(() => Promise.resolve()),
  onDeleteComment = vi.fn(() => ({ status: "deleted" as const })),
  onDraftComment = vi.fn(() => ({ status: "created" as const })),
  onEditComment = vi.fn(() => ({ status: "updated" as const })),
  onFollowUp = vi.fn(() => Promise.resolve()),
  onNavigateFile = vi.fn(),
  onNavigateThread = vi.fn(),
  selection = selectedCode,
  threads = [completedThread],
}: {
  activeFile?: string | null;
  activeThreadId?: string | null;
  files?: ChangedFile[];
  onAsk?: (utterance: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => { status: "deleted" | "not-found" };
  onDraftComment?: (body: string) => { status: "created" | "selection-required" | "empty" };
  onEditComment?: (commentId: string, body: string) => { status: "updated" | "not-found" | "empty" };
  onFollowUp?: (threadId: string, utterance: string) => Promise<void>;
  onNavigateFile?: (filePath: string) => void;
  onNavigateThread?: (threadId: string) => void;
  selection?: CodeSelection | null;
  threads?: ReviewThread[];
} = {}) {
  render(
    <VoiceSelectionDemo
      activeFile={activeFile}
      activeThreadId={activeThreadId}
      files={files}
      onAsk={onAsk}
      onDeleteComment={onDeleteComment}
      onDraftComment={onDraftComment}
      onEditComment={onEditComment}
      onFollowUp={onFollowUp}
      onNavigateFile={onNavigateFile}
      onNavigateThread={onNavigateThread}
      selection={selection}
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
      selection: selectedCode,
      threads: [completedThread],
    });

    expect(context.selectedCode).toEqual(selectedCode);
    expect(context.activeThread?.title).toBe("Found issue");
    expect(context.activeThread?.markdownExcerpt).toContain("validation issue");
    expect(context.popupText).toContain("Focused thread: Found issue");
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

  it("lists loaded review thread ids and names for voice", () => {
    expect(listThreadSummariesForVoice([completedThread])).toEqual([
      {
        id: "thr_issue",
        codexThreadId: "codex-thread-1",
        title: "Found issue",
        status: "complete",
        source: "manual",
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
          line: 2,
          text: "It needs a regression test.",
        },
      ],
    });
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
        auth: { sessionEndpoint: "/api/realtime/session" },
        outputMode: "tool-only",
        toolChoice: "required",
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
            name: "edit_selected_pr_comment",
          }),
          expect.objectContaining({
            name: "delete_selected_pr_comment",
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
            name: "navigate_file",
          }),
        ]),
        postToolResponse: true,
      }),
    );
    expect(screen.getByRole("button", { name: "Start Voice" })).toBeInTheDocument();
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
          line: 3,
          text: "The fix is small.",
        },
      ],
    });
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
      },
    });

    expect(onNavigateThread).toHaveBeenCalledWith("thr_issue");
    expect(await screen.findByText("Showing Found issue")).toBeInTheDocument();
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
