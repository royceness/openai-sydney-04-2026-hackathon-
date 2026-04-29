import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodeSelection } from "../types";
import { selectedLocationMessage, VoiceSelectionDemo } from "./VoiceSelectionDemo";

type VoiceToolOption = {
  name: string;
  execute: (args: { comment?: string }) => unknown;
};

type VoiceControllerOptions = {
  activationMode: string;
  auth: unknown;
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

  it("configures the realtime voice component with the selected-text tool", () => {
    render(<VoiceSelectionDemo onDraftComment={vi.fn()} selection={selectedCode} />);

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
            name: "draft_pr_comment",
          }),
          expect.objectContaining({
            name: "no_action_required_or_unclear_audio",
          }),
        ]),
      }),
    );
    expect(screen.getByRole("button", { name: "Start Voice" })).toBeInTheDocument();
  });

  it("connects through the realtime runtime when the play button is clicked", async () => {
    const user = userEvent.setup();
    render(<VoiceSelectionDemo onDraftComment={vi.fn()} selection={selectedCode} />);

    await user.click(screen.getByRole("button", { name: "Start Voice" }));

    expect(controller.connect).toHaveBeenCalledTimes(1);
  });

  it("shows the current selected text when the realtime tool executes", async () => {
    const user = userEvent.setup();
    render(<VoiceSelectionDemo onDraftComment={vi.fn()} selection={selectedCode} />);

    const options = createVoiceControlController.mock.calls[0]?.[0];
    if (!options) {
      throw new Error("Expected voice controller options");
    }
    const showSelectedText = options.tools.find((tool) => tool.name === "show_selected_text");
    if (!showSelectedText) {
      throw new Error("Expected selected text voice tool");
    }
    showSelectedText.execute({});

    expect(await screen.findByText("Selected lines")).toBeInTheDocument();
    expect(screen.getByText("Lines 201-202 of src/review/diagram.ts")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close selected text popup" }));
    expect(screen.queryByText("Selected lines")).not.toBeInTheDocument();
  });

  it("drafts a PR comment through the realtime tool", async () => {
    const onDraftComment = vi.fn(() => ({ status: "created" as const }));
    render(<VoiceSelectionDemo onDraftComment={onDraftComment} selection={selectedCode} />);

    const options = createVoiceControlController.mock.calls[0]?.[0];
    if (!options) {
      throw new Error("Expected voice controller options");
    }
    const draftComment = options.tools.find((tool) => tool.name === "draft_pr_comment");
    if (!draftComment) {
      throw new Error("Expected draft comment voice tool");
    }
    draftComment.execute({ comment: "this needs tests" });

    expect(onDraftComment).toHaveBeenCalledWith("this needs tests");
    expect(await screen.findByText("Selected lines")).toBeInTheDocument();
    expect(screen.getByText("Draft comment queued for Lines 201-202 of src/review/diagram.ts.")).toBeInTheDocument();
  });

  it("prompts for a line selection before drafting a PR comment", async () => {
    const onDraftComment = vi.fn(() => ({ status: "selection-required" as const }));
    render(<VoiceSelectionDemo onDraftComment={onDraftComment} selection={null} />);

    const options = createVoiceControlController.mock.calls[0]?.[0];
    if (!options) {
      throw new Error("Expected voice controller options");
    }
    const draftComment = options.tools.find((tool) => tool.name === "draft_pr_comment");
    if (!draftComment) {
      throw new Error("Expected draft comment voice tool");
    }
    draftComment.execute({ comment: "this needs tests" });

    expect(onDraftComment).toHaveBeenCalledWith("this needs tests");
    expect(await screen.findByText("Selected lines")).toBeInTheDocument();
    expect(screen.getByText("Select lines in the diff to attach this PR comment.")).toBeInTheDocument();
  });
});
