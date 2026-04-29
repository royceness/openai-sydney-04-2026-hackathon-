import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangedFile, CodeSelection } from "../types";
import { resolveFileNavigation, selectedLocationMessage, VoiceSelectionDemo } from "./VoiceSelectionDemo";

type VoiceToolOption = {
  name: string;
  execute: (args: Record<string, unknown>) => unknown;
};

type VoiceControllerOptions = {
  activationMode: string;
  auth: unknown;
  onEvent?: (event: Record<string, unknown>) => void;
  outputMode: string;
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

function renderVoiceSelectionDemo({
  activeFile = "src/review/diagram.ts",
  files = changedFiles,
  onAsk = vi.fn(() => Promise.resolve()),
  onNavigateFile = vi.fn(),
  selection = selectedCode,
}: {
  activeFile?: string | null;
  files?: ChangedFile[];
  onAsk?: (utterance: string) => Promise<void>;
  onNavigateFile?: (filePath: string) => void;
  selection?: CodeSelection | null;
} = {}) {
  render(
    <VoiceSelectionDemo
      activeFile={activeFile}
      files={files}
      onAsk={onAsk}
      onNavigateFile={onNavigateFile}
      selection={selection}
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
            name: "navigate_file",
          }),
        ]),
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
