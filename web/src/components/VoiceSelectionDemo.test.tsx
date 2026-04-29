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
    render(<VoiceSelectionDemo onDeleteComment={vi.fn()} onEditComment={vi.fn()} onDraftComment={vi.fn()} selection={selectedCode} />);

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
            name: "edit_selected_pr_comment",
          }),
          expect.objectContaining({
            name: "delete_selected_pr_comment",
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
    render(<VoiceSelectionDemo onDeleteComment={vi.fn()} onEditComment={vi.fn()} onDraftComment={vi.fn()} selection={selectedCode} />);

    await user.click(screen.getByRole("button", { name: "Start Voice" }));

    expect(controller.connect).toHaveBeenCalledTimes(1);
  });

  it("shows the current selected text when the realtime tool executes", async () => {
    const user = userEvent.setup();
    render(<VoiceSelectionDemo onDeleteComment={vi.fn()} onEditComment={vi.fn()} onDraftComment={vi.fn()} selection={selectedCode} />);

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
    render(<VoiceSelectionDemo onDeleteComment={vi.fn()} onEditComment={vi.fn()} onDraftComment={onDraftComment} selection={selectedCode} />);

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
    render(<VoiceSelectionDemo onDeleteComment={vi.fn()} onEditComment={vi.fn()} onDraftComment={onDraftComment} selection={null} />);

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

  it("edits the selected draft PR comment through the realtime tool", async () => {
    const onEditComment = vi.fn(() => ({ status: "updated" as const }));
    render(
      <>
        <VoiceSelectionDemo onDeleteComment={vi.fn()} onEditComment={onEditComment} onDraftComment={vi.fn()} selection={null} />
        <div data-comment-id="draft_1">old comment text</div>
      </>,
    );
    selectText(screen.getByText("old comment text"));

    const options = createVoiceControlController.mock.calls[0]?.[0];
    if (!options) {
      throw new Error("Expected voice controller options");
    }
    const editComment = options.tools.find((tool) => tool.name === "edit_selected_pr_comment");
    if (!editComment) {
      throw new Error("Expected edit comment voice tool");
    }
    editComment.execute({ comment: "new comment text" });

    expect(onEditComment).toHaveBeenCalledWith("draft_1", "new comment text");
    expect(await screen.findByText("Draft comment updated.")).toBeInTheDocument();
  });

  it("deletes the selected draft PR comment through the realtime tool", async () => {
    const onDeleteComment = vi.fn(() => ({ status: "deleted" as const }));
    render(
      <>
        <VoiceSelectionDemo onDeleteComment={onDeleteComment} onEditComment={vi.fn()} onDraftComment={vi.fn()} selection={null} />
        <div data-comment-id="draft_1">delete this text</div>
      </>,
    );
    selectText(screen.getByText("delete this text"));

    const options = createVoiceControlController.mock.calls[0]?.[0];
    if (!options) {
      throw new Error("Expected voice controller options");
    }
    const deleteComment = options.tools.find((tool) => tool.name === "delete_selected_pr_comment");
    if (!deleteComment) {
      throw new Error("Expected delete comment voice tool");
    }
    deleteComment.execute({});

    expect(onDeleteComment).toHaveBeenCalledWith("draft_1");
    expect(await screen.findByText("Draft comment deleted.")).toBeInTheDocument();
  });
});

function selectText(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  if (!selection) {
    throw new Error("Expected DOM selection");
  }
  selection.removeAllRanges();
  selection.addRange(range);
}
