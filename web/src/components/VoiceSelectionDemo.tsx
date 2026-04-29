import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createVoiceControlController,
  defineVoiceTool,
  useVoiceControl,
  type VoiceControlController,
} from "realtime-voice-component";
import { z } from "zod";
import type { CodeSelection } from "../types";

type DraftCommentResult = { status: "created" | "selection-required" | "empty" };
type EditCommentResult = { status: "updated" | "not-found" | "empty" };
type DeleteCommentResult = { status: "deleted" | "not-found" };

export function VoiceSelectionDemo({
  selection,
  onDeleteComment,
  onDraftComment,
  onEditComment,
}: {
  selection: CodeSelection | null;
  onDeleteComment: (commentId: string) => DeleteCommentResult;
  onDraftComment: (body: string) => DraftCommentResult;
  onEditComment: (commentId: string, body: string) => EditCommentResult;
}) {
  const [error, setError] = useState<string | null>(null);
  const [popupText, setPopupText] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const lastToggleAtRef = useRef(0);
  const selectionRef = useRef<CodeSelection | null>(selection);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const tools = useMemo(
    () => [
      defineVoiceTool({
        name: "no_action_required_or_unclear_audio",
        description: "Use this when no UI action is required, or when the audio is noisy, unclear, unrelated, or does not explicitly ask about the selected text, lines, code, or selection.",
        parameters: z.object({}),
        execute: () => ({ ok: true, ignored: true }),
      }),
      defineVoiceTool({
        name: "show_selected_text",
        description: "Show the exact text currently selected in the pull request diff.",
        parameters: z.object({}),
        execute: () => {
          const text = selectedLocationMessage(selectionRef.current);
          setPopupText(text);
          return { ok: true, selectedLocation: text };
        },
      }),
      defineVoiceTool({
        name: "draft_pr_comment",
        description: "Create a local draft PR review comment attached to the currently selected diff lines.",
        parameters: z.object({
          comment: z.string().describe("The exact PR review comment body to draft."),
        }),
        execute: ({ comment }) => {
          const result = onDraftComment(comment);
          if (result.status === "created") {
            const text = selectedLocationMessage(selectionRef.current);
            setPopupText(`Draft comment queued for ${text}.`);
            return { ok: true, status: "created", selectedLocation: text };
          }
          if (result.status === "selection-required") {
            setPopupText("Select lines in the diff to attach this PR comment.");
            return { ok: true, status: "selection-required" };
          }
          setPopupText("No comment text was provided.");
          return { ok: false, status: "empty" };
        },
      }),
      defineVoiceTool({
        name: "edit_selected_pr_comment",
        description: "Edit the local draft PR comment whose text is currently selected in the PR comments queue.",
        parameters: z.object({
          comment: z.string().describe("The replacement PR review comment body."),
        }),
        execute: ({ comment }) => {
          const commentId = selectedDraftCommentId();
          if (!commentId) {
            setPopupText("Select text inside a draft PR comment first.");
            return { ok: true, status: "comment-selection-required" };
          }
          const result = onEditComment(commentId, comment);
          if (result.status === "updated") {
            setPopupText("Draft comment updated.");
            return { ok: true, status: "updated" };
          }
          if (result.status === "empty") {
            setPopupText("No replacement comment text was provided.");
            return { ok: false, status: "empty" };
          }
          setPopupText("Selected draft comment was not found.");
          return { ok: false, status: "not-found" };
        },
      }),
      defineVoiceTool({
        name: "delete_selected_pr_comment",
        description: "Delete the local draft PR comment whose text is currently selected in the PR comments queue.",
        parameters: z.object({}),
        execute: () => {
          const commentId = selectedDraftCommentId();
          if (!commentId) {
            setPopupText("Select text inside a draft PR comment first.");
            return { ok: true, status: "comment-selection-required" };
          }
          const result = onDeleteComment(commentId);
          if (result.status === "deleted") {
            setPopupText("Draft comment deleted.");
            return { ok: true, status: "deleted" };
          }
          setPopupText("Selected draft comment was not found.");
          return { ok: false, status: "not-found" };
        },
      }),
    ],
    [onDeleteComment, onDraftComment, onEditComment],
  );

  const [controller] = useState<VoiceControlController>(() =>
    createVoiceControlController({
      activationMode: "vad",
      auth: { sessionEndpoint: "/api/realtime/session" },
      instructions:
        "You are controlling a pull request review UI. Call draft_pr_comment when the user asks to add, draft, write, or create a PR comment, review comment, or comment here. Extract the requested comment text into the comment parameter. When the user selects text inside a draft PR comment and asks to edit it, call edit_selected_pr_comment with the replacement text. When the user selects text inside a draft PR comment and asks to delete it, call delete_selected_pr_comment. Call show_selected_text only when the user explicitly asks what text, lines, code, or selection is selected. For any unclear, noisy, partial, unrelated, ambiguous audio, or case where no UI action is required, call no_action_required_or_unclear_audio. Do not answer in prose.",
      onError: (voiceError) => {
        console.error("[voice] error", voiceError);
        setError(voiceError.message);
      },
      onToolError: (call) => {
        if (call.name === "show_selected_text" || call.name === "draft_pr_comment" || call.name === "edit_selected_pr_comment" || call.name === "delete_selected_pr_comment") {
          console.error("[voice] tool error", call);
        }
      },
      onToolStart: (call) => {
        if (call.name === "show_selected_text" || call.name === "draft_pr_comment" || call.name === "edit_selected_pr_comment" || call.name === "delete_selected_pr_comment") {
          console.info("[voice] tool start", call);
        }
      },
      onToolSuccess: (call) => {
        if (call.name === "show_selected_text" || call.name === "draft_pr_comment" || call.name === "edit_selected_pr_comment" || call.name === "delete_selected_pr_comment") {
          console.info("[voice] tool success", call);
        }
      },
      outputMode: "tool-only",
      toolChoice: "required",
      tools,
    }),
  );

  const runtime = useVoiceControl(controller);
  const [optimisticStatus, setOptimisticStatus] = useState<"idle" | "connecting">("idle");
  const effectiveStatus = runtime.status === "idle" && optimisticStatus === "connecting" ? "connecting" : runtime.status;
  const isActive = effectiveStatus === "connecting" || effectiveStatus === "ready" || effectiveStatus === "listening";
  const buttonLabel = voiceButtonLabel(effectiveStatus);

  const toggleVoice = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleAtRef.current < 250) {
      return;
    }
    lastToggleAtRef.current = now;
    setError(null);
    if (runtime.connected || runtime.status === "connecting" || optimisticStatus === "connecting") {
      setOptimisticStatus("idle");
      runtime.disconnect();
      return;
    }
    setOptimisticStatus("connecting");
    void Promise.resolve(runtime.connect()).finally(() => setOptimisticStatus("idle"));
  }, [optimisticStatus, runtime]);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      event.preventDefault();
      toggleVoice();
    };
    button.addEventListener("pointerdown", handlePointerDown);
    return () => button.removeEventListener("pointerdown", handlePointerDown);
  }, [toggleVoice]);

  return (
    <div className="relative flex items-center gap-2">
      <button
        aria-pressed={isActive}
        className={
          isActive
            ? "flex items-center gap-2 rounded-full border border-emerald-300/70 bg-emerald-400/15 px-3 py-2 text-sm font-semibold text-emerald-100 shadow-lg shadow-emerald-950/30"
            : "flex items-center gap-2 rounded-full border border-slate-600 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-black/30 hover:border-violet-300"
        }
        ref={buttonRef}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleVoice();
          }
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          toggleVoice();
        }}
        type="button"
      >
        <span className={isActive ? "h-2 w-2 rounded-full bg-emerald-300" : "h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-slate-950"} />
        <span>{buttonLabel}</span>
      </button>

      {error ? <span className="max-w-64 text-xs text-rose-200">{error}</span> : null}

      {popupText ? (
        <div
          className="absolute right-0 top-12 z-20 w-80 rounded-md border border-violet-500/40 bg-slate-950 p-3 text-sm shadow-2xl shadow-black/40"
          role="status"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Selected lines</div>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-100">
            {popupText}
          </pre>
          <button
            aria-label="Close selected text popup"
            className="absolute right-2 top-2 rounded px-1 text-slate-500 hover:text-slate-200"
            onClick={() => setPopupText(null)}
            type="button"
          >
            x
          </button>
        </div>
      ) : null}
    </div>
  );
}

function voiceButtonLabel(status: ReturnType<typeof useVoiceControl>["status"] | "connecting") {
  if (status === "connecting") {
    return "Connecting";
  }
  if (status === "ready" || status === "listening") {
    return "Listening";
  }
  if (status === "processing") {
    return "Processing";
  }
  if (status === "error") {
    return "Retry Voice";
  }
  return "Start Voice";
}

export function selectedLocationMessage(selection: CodeSelection | null) {
  if (!selection) {
    return "No text is selected.";
  }
  const startLine = selection.startLine;
  const endLine = selection.endLine;
  if (startLine === null || endLine === null) {
    return `Selected text in ${selection.filePath}`;
  }
  const lineLabel = startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}-${endLine}`;
  return `${lineLabel} of ${selection.filePath}`;
}

function selectedDraftCommentId() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    return null;
  }
  return closestCommentId(selection.anchorNode) ?? closestCommentId(selection.focusNode);
}

function closestCommentId(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[data-comment-id]")?.dataset.commentId ?? null;
}
