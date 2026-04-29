import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangedFile, CodeSelection, ReviewThread } from "../types";
import {
  buildReviewRoomContext,
  formatChangedLineSummaries,
  resolveFileNavigation,
  resolveFollowUpThread,
  selectedLocationMessage,
  summarizeChangedLines,
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
  markdown: "This thread found a validation issue.",
  context: selectedCode,
  created_at: "2026-04-29T00:00:00Z",
  updated_at: "2026-04-29T00:00:00Z",
};

function renderVoiceSelectionDemo({
  activeFile = "src/review/diagram.ts",
  activeThreadId = "thr_issue",
  files = changedFiles,
  onAsk = vi.fn(() => Promise.resolve()),
  onFollowUp = vi.fn(() => Promise.resolve()),
  onNavigateFile = vi.fn(),
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
  threads = [completedThread],
}: {
  activeFile?: string | null;
  activeThreadId?: string | null;
  files?: ChangedFile[];
  onAsk?: (utterance: string) => Promise<void>;
  onFollowUp?: (threadId: string, utterance: string) => Promise<void>;
  onNavigateFile?: (filePath: string) => void;
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
  threads?: ReviewThread[];
} = {}) {
  render(
    <VoiceSelectionDemo
      activeFile={activeFile}
      activeThreadId={activeThreadId}
      files={files}
      onAsk={onAsk}
      onFollowUp={onFollowUp}
      onNavigateFile={onNavigateFile}
      readFileContent={readFileContent}
      reviewId={reviewId}
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
            name: "get_review_room_context",
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
