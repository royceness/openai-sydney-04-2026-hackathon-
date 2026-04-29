import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  createVoiceControlController,
  defineVoiceTool,
  useVoiceControl,
  type VoiceControlController,
} from "realtime-voice-component";
import { z } from "zod";
import type { ChangedFile, CodeSelection } from "../types";

type VoicePopup = {
  title: string;
  body: string;
};

type FileNavigationRequest =
  | {
      action: "next" | "previous";
      filePath?: string;
    }
  | {
      action: "file";
      filePath: string;
    };

export function VoiceSelectionDemo({
  activeFile,
  files,
  onAsk,
  onNavigateFile,
  selection,
}: {
  activeFile: string | null;
  files: ChangedFile[];
  onAsk: (utterance: string) => Promise<void>;
  onNavigateFile: (filePath: string) => void;
  selection: CodeSelection | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [popup, setPopup] = useState<VoicePopup | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const lastToggleAtRef = useRef(0);
  const activeFileRef = useRef<string | null>(activeFile);
  const filesRef = useRef<ChangedFile[]>(files);
  const onAskRef = useRef(onAsk);
  const onNavigateFileRef = useRef(onNavigateFile);
  const selectionRef = useRef<CodeSelection | null>(selection);
  const lastLoggedUserTranscriptRef = useRef<string | null>(null);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    onAskRef.current = onAsk;
  }, [onAsk]);

  useEffect(() => {
    onNavigateFileRef.current = onNavigateFile;
  }, [onNavigateFile]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const tools = useMemo(
    () => [
      defineVoiceTool({
        name: "no_action_required_or_unclear_audio",
        description: "Use this when no UI action is required, or when the audio is noisy, unclear, unrelated, or does not explicitly ask to show the selected text, create a review thread, or navigate files.",
        parameters: z.object({}),
        execute: () => ({ ok: true, ignored: true }),
      }),
      defineVoiceTool({
        name: "show_selected_text",
        description: "Show the exact text currently selected in the pull request diff.",
        parameters: z.object({}),
        execute: () => {
          const text = selectedLocationMessage(selectionRef.current);
          setPopup({ title: "Selected lines", body: text });
          return { ok: true, selectedLocation: text };
        },
      }),
      defineVoiceTool({
        name: "ask_general_question",
        description: "Create a new review workbench thread for a general pull request question or request. Use this when the user asks a substantive question or asks to draw, explain, summarize, review, compare, or generate something, including Mermaid diagrams.",
        parameters: z.object({
          question: z.string().min(1).describe("The user's question, cleaned up without adding new meaning."),
        }),
        execute: async ({ question }) => {
          const trimmed = question.trim();
          await onAskRef.current(trimmed);
          setPopup({ title: "Thread started", body: trimmed });
          return { ok: true, question: trimmed };
        },
      }),
      defineVoiceTool({
        name: "navigate_file",
        description: "Navigate the pull request diff to another changed file. Use action next for commands like 'show me the next file', previous for 'previous file', and file for commands like 'go to foo.txt'.",
        parameters: z.object({
          action: z.enum(["next", "previous", "file"]),
          filePath: z.string().optional().describe("Target file path or basename when action is file."),
        }),
        execute: ({ action, filePath }) => {
          const result = resolveFileNavigation({ action, filePath } as FileNavigationRequest, filesRef.current, activeFileRef.current);
          if (!result.ok) {
            setPopup({ title: "File navigation", body: result.message });
            return result;
          }
          onNavigateFileRef.current(result.filePath);
          setPopup({ title: "File navigation", body: `Showing ${result.filePath}` });
          return result;
        },
      }),
    ],
    [],
  );

  const [controller] = useState<VoiceControlController>(() =>
    createVoiceControlController({
      activationMode: "vad",
      auth: { sessionEndpoint: "/api/realtime/session" },
      instructions:
        "You are controlling a pull request review UI. Call show_selected_text only when the user explicitly asks what text, lines, code, or selection is selected. Call ask_general_question when the user asks a substantive review question or request and pass the question. This includes requests to draw, generate, or show a Mermaid diagram. Call navigate_file for explicit file navigation requests like next file, previous file, or go to a named file. For any unclear, noisy, partial, unrelated, ambiguous audio, or case where no UI action is required, call no_action_required_or_unclear_audio. Do not answer in prose.",
      onEvent: (event) => {
        logCompletedUserTranscript(event, lastLoggedUserTranscriptRef);
      },
      onError: (voiceError) => {
        console.error("[voice] error", voiceError);
        setError(voiceError.message);
      },
      onToolError: (call) => {
        if (call.name !== "no_action_required_or_unclear_audio") {
          console.error("[voice] tool error", call);
        }
      },
      onToolStart: (call) => {
        if (call.name !== "no_action_required_or_unclear_audio") {
          console.info("[voice] tool start", call);
        }
      },
      onToolSuccess: (call) => {
        if (call.name !== "no_action_required_or_unclear_audio") {
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

      {popup ? (
        <div
          className="absolute right-0 top-12 z-20 w-80 rounded-md border border-violet-500/40 bg-slate-950 p-3 text-sm shadow-2xl shadow-black/40"
          role="status"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">{popup.title}</div>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-100">
            {popup.body}
          </pre>
          <button
            aria-label="Close voice action popup"
            className="absolute right-2 top-2 rounded px-1 text-slate-500 hover:text-slate-200"
            onClick={() => setPopup(null)}
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

export type FileNavigationResult =
  | {
      ok: true;
      filePath: string;
    }
  | {
      ok: false;
      message: string;
    };

export function resolveFileNavigation(
  request: FileNavigationRequest,
  files: ChangedFile[],
  activeFile: string | null,
): FileNavigationResult {
  if (files.length === 0) {
    return { ok: false, message: "No changed files are loaded." };
  }

  if (request.action === "next" || request.action === "previous") {
    const currentIndex = activeFile ? files.findIndex((file) => file.path === activeFile) : -1;
    const direction = request.action === "next" ? 1 : -1;
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + files.length) % files.length;
    return { ok: true, filePath: files[nextIndex].path };
  }

  const query = normalizeFileQuery(request.filePath);
  const matches = files.filter((file) => {
    const normalizedPath = normalizeFileQuery(file.path);
    const basename = normalizeFileQuery(file.path.split("/").at(-1) ?? file.path);
    return normalizedPath === query || basename === query || normalizedPath.endsWith(`/${query}`);
  });

  if (matches.length === 1) {
    return { ok: true, filePath: matches[0].path };
  }
  if (matches.length > 1) {
    return { ok: false, message: `Multiple files match ${request.filePath}: ${matches.map((file) => file.path).join(", ")}` };
  }

  const partialMatches = files.filter((file) => normalizeFileQuery(file.path).includes(query));
  if (partialMatches.length === 1) {
    return { ok: true, filePath: partialMatches[0].path };
  }
  if (partialMatches.length > 1) {
    return { ok: false, message: `Multiple files match ${request.filePath}: ${partialMatches.map((file) => file.path).join(", ")}` };
  }
  return { ok: false, message: `No changed file matches ${request.filePath}.` };
}

function normalizeFileQuery(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

type TranscriptEvent = {
  type?: unknown;
  transcript?: unknown;
};

function logCompletedUserTranscript(event: TranscriptEvent, lastLoggedUserTranscriptRef: MutableRefObject<string | null>) {
  if (event.type !== "conversation.item.input_audio_transcription.completed") {
    return;
  }
  if (typeof event.transcript !== "string") {
    return;
  }
  const transcript = event.transcript.trim();
  if (!transcript || transcript === lastLoggedUserTranscriptRef.current) {
    return;
  }
  lastLoggedUserTranscriptRef.current = transcript;
  console.info("[voice] user transcript", transcript);
}
