import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  createVoiceControlController,
  defineVoiceTool,
  useVoiceControl,
  type VoiceControlController,
} from "realtime-voice-component";
import { z } from "zod";
import type { ChangedFile, CodeSelection, ReviewThread } from "../types";

type VoicePopup = {
  title: string;
  body: string;
};

type DraftCommentResult = { status: "created" | "selection-required" | "empty" };
type EditCommentResult = { status: "updated" | "not-found" | "empty" };
type DeleteCommentResult = { status: "deleted" | "not-found" };

type FileNavigationRequest =
  | {
      action: "next" | "previous";
      filePath?: string;
    }
  | {
      action: "file";
      filePath: string;
    };

type ThreadNavigationRequest = {
  threadId?: string;
  title?: string;
};

export function VoiceSelectionDemo({
  activeFile,
  activeThreadId,
  files,
  onAsk,
  onDeleteComment,
  onDraftComment,
  onEditComment,
  onFollowUp,
  onNavigateFile,
  onNavigateThread,
  selection,
  threads,
}: {
  activeFile: string | null;
  activeThreadId: string | null;
  files: ChangedFile[];
  onAsk: (utterance: string) => Promise<void>;
  onDeleteComment: (commentId: string) => DeleteCommentResult;
  onDraftComment: (body: string) => DraftCommentResult;
  onEditComment: (commentId: string, body: string) => EditCommentResult;
  onFollowUp: (threadId: string, utterance: string) => Promise<void>;
  onNavigateFile: (filePath: string) => void;
  onNavigateThread: (threadId: string) => void;
  selection: CodeSelection | null;
  threads: ReviewThread[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [popup, setPopup] = useState<VoicePopup | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const lastToggleAtRef = useRef(0);
  const activeFileRef = useRef<string | null>(activeFile);
  const activeThreadIdRef = useRef<string | null>(activeThreadId);
  const filesRef = useRef<ChangedFile[]>(files);
  const onAskRef = useRef(onAsk);
  const onDeleteCommentRef = useRef(onDeleteComment);
  const onDraftCommentRef = useRef(onDraftComment);
  const onEditCommentRef = useRef(onEditComment);
  const onFollowUpRef = useRef(onFollowUp);
  const onNavigateFileRef = useRef(onNavigateFile);
  const onNavigateThreadRef = useRef(onNavigateThread);
  const selectionRef = useRef<CodeSelection | null>(selection);
  const threadsRef = useRef<ReviewThread[]>(threads);
  const lastLoggedUserTranscriptRef = useRef<string | null>(null);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    onAskRef.current = onAsk;
  }, [onAsk]);

  useEffect(() => {
    onDeleteCommentRef.current = onDeleteComment;
  }, [onDeleteComment]);

  useEffect(() => {
    onDraftCommentRef.current = onDraftComment;
  }, [onDraftComment]);

  useEffect(() => {
    onEditCommentRef.current = onEditComment;
  }, [onEditComment]);

  useEffect(() => {
    onFollowUpRef.current = onFollowUp;
  }, [onFollowUp]);

  useEffect(() => {
    onNavigateFileRef.current = onNavigateFile;
  }, [onNavigateFile]);

  useEffect(() => {
    onNavigateThreadRef.current = onNavigateThread;
  }, [onNavigateThread]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

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
        name: "get_review_room_context",
        description: "Read the current Review Room page context, including selected diff code, selected page text, focused Codex thread, and visible workbench thread summaries. Use this when the user refers to this issue, this thread, the selected text, or what is on the page and the target may be ambiguous.",
        parameters: z.object({}),
        execute: () => {
          const context = buildReviewRoomContext({
            activeFile: activeFileRef.current,
            activeThreadId: activeThreadIdRef.current,
            selection: selectionRef.current,
            threads: threadsRef.current,
          });
          setPopup({ title: "Page context", body: context.popupText });
          return { ok: true, context };
        },
      }),
      defineVoiceTool({
        name: "list_review_threads",
        description: "List all currently loaded Review Room workbench threads, including each Review Room thread id, Codex thread id when available, title, status, and source.",
        parameters: z.object({}),
        execute: () => {
          const threads = listThreadSummariesForVoice(threadsRef.current);
          setPopup({ title: "Review threads", body: threadsPopupText(threads) });
          return { ok: true, threads };
        },
      }),
      defineVoiceTool({
        name: "get_review_thread_text",
        description: "Read Markdown text from a currently loaded Review Room thread by line range. Use 1-based inclusive line numbers.",
        parameters: z.object({
          threadId: z.string().describe("The Review Room thread id to read."),
          startLine: z.number().int().positive().optional().describe("First 1-based line to return. Defaults to line 1."),
          endLine: z.number().int().positive().optional().describe("Last 1-based line to return. Defaults to the final line."),
        }),
        execute: ({ threadId, startLine, endLine }) => {
          const result = getThreadTextByLineRange(threadsRef.current, threadId, startLine, endLine);
          if (!result.ok) {
            setPopup({ title: "Thread text", body: result.message });
            return result;
          }
          setPopup({ title: "Thread text", body: result.text || "(empty)" });
          return result;
        },
      }),
      defineVoiceTool({
        name: "search_review_threads",
        description: "Search all currently loaded Review Room thread titles and Markdown text using simple case-insensitive text matching. This is not a regular expression search.",
        parameters: z.object({
          query: z.string().min(1).describe("Plain text to search for. Do not use regular expressions."),
        }),
        execute: ({ query }) => {
          const result = searchThreadsByText(threadsRef.current, query);
          setPopup({ title: "Thread search", body: threadSearchPopupText(result) });
          return { ok: true, ...result };
        },
      }),
      defineVoiceTool({
        name: "navigate_review_thread",
        description: "Navigate the AI workbench to a loaded Review Room thread by thread id or title. This opens the accordion, scrolls to it, and briefly highlights it.",
        parameters: z.object({
          threadId: z.string().optional().describe("Review Room thread id, preferred when available."),
          title: z.string().optional().describe("Thread title or title fragment when the id is not available."),
        }),
        execute: ({ threadId, title }) => {
          const result = resolveThreadNavigation({ threadId, title }, threadsRef.current);
          if (!result.ok) {
            setPopup({ title: "Thread navigation", body: result.message });
            return result;
          }
          onNavigateThreadRef.current(result.thread.id);
          setPopup({ title: "Thread navigation", body: `Showing ${result.thread.title}` });
          return result;
        },
      }),
      defineVoiceTool({
        name: "ask_general_question",
        description: "Create a new review workbench thread for a general pull request question or request. Use this when the user asks a substantive question that is not a follow-up about the focused Codex thread. This includes requests to draw, generate, or show a Mermaid diagram.",
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
        name: "ask_thread_follow_up",
        description: "Post a follow-up question to the focused Codex workbench thread. Use this when the user asks about the active thread, this issue, that finding, it, the result, or the current Codex thread.",
        parameters: z.object({
          question: z.string().min(1).describe("The user's follow-up question, cleaned up without adding new meaning."),
          threadId: z.string().optional().describe("Specific Review Room thread id only if the user named one or context already identified it."),
        }),
        execute: async ({ question, threadId }) => {
          const resolved = resolveFollowUpThread(threadId, activeThreadIdRef.current, threadsRef.current);
          if (!resolved.ok) {
            setPopup({ title: "Choose a thread", body: resolved.message });
            return resolved;
          }
          const trimmed = question.trim();
          await onFollowUpRef.current(resolved.thread.id, trimmed);
          setPopup({ title: "Follow-up started", body: `${resolved.thread.title}\n\n${trimmed}` });
          return { ok: true, threadId: resolved.thread.id, question: trimmed };
        },
      }),
      defineVoiceTool({
        name: "draft_pr_comment",
        description: "Create a local draft PR review comment attached to the selected diff lines, or to the active file when no lines are selected.",
        parameters: z.object({
          comment: z.string().describe("The exact PR review comment body to draft."),
        }),
        execute: ({ comment }) => {
          const result = onDraftCommentRef.current(comment);
          if (result.status === "created") {
            const text = selectedLocationMessage(selectionRef.current);
            setPopup({ title: "PR comment drafted", body: text });
            return { ok: true, status: "created", selectedLocation: text };
          }
          if (result.status === "selection-required") {
            setPopup({ title: "Select lines", body: "Select lines in the diff to attach this PR comment." });
            return { ok: true, status: "selection-required" };
          }
          setPopup({ title: "PR comment", body: "No comment text was provided." });
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
            setPopup({ title: "Select comment text", body: "Select text inside a draft PR comment first." });
            return { ok: true, status: "comment-selection-required" };
          }
          const result = onEditCommentRef.current(commentId, comment);
          if (result.status === "updated") {
            setPopup({ title: "PR comment updated", body: "Draft comment updated." });
            return { ok: true, status: "updated" };
          }
          if (result.status === "empty") {
            setPopup({ title: "PR comment", body: "No replacement comment text was provided." });
            return { ok: false, status: "empty" };
          }
          setPopup({ title: "PR comment", body: "Selected draft comment was not found." });
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
            setPopup({ title: "Select comment text", body: "Select text inside a draft PR comment first." });
            return { ok: true, status: "comment-selection-required" };
          }
          const result = onDeleteCommentRef.current(commentId);
          if (result.status === "deleted") {
            setPopup({ title: "PR comment deleted", body: "Draft comment deleted." });
            return { ok: true, status: "deleted" };
          }
          setPopup({ title: "PR comment", body: "Selected draft comment was not found." });
          return { ok: false, status: "not-found" };
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
        "You are controlling a pull request review UI. Call draft_pr_comment when the user asks to add, draft, write, or create a PR comment, review comment, or comment here; extract the requested comment text into the comment parameter. When the user selects text inside a draft PR comment and asks to edit it, call edit_selected_pr_comment with the replacement text. When the user selects text inside a draft PR comment and asks to delete it, call delete_selected_pr_comment. Call show_selected_text only when the user explicitly asks what text, lines, code, or selection is selected. Call get_review_room_context when the user refers to this issue, this thread, the selected text, the page, or the focused Codex thread and you need current context. Call list_review_threads when the user asks what threads exist, asks for thread ids, or asks for thread names. Call get_review_thread_text when the user asks to read text from a thread by line range. Call search_review_threads when the user asks to search, grep, or find text across loaded threads. Call navigate_review_thread when the user asks to open, show, jump to, focus, or navigate to a specific review thread. Call ask_thread_follow_up when the user asks a follow-up about the active or focused Codex thread, including references like this issue, that finding, it, the result, or the thread. Call ask_general_question when the user asks a substantive new review question or request that is not about the focused thread; this includes requests to draw, generate, or show a Mermaid diagram. Call navigate_file for explicit file navigation requests like next file, previous file, or go to a named file. For unclear, noisy, partial, unrelated, or ambiguous audio where no UI action can be chosen, call no_action_required_or_unclear_audio. Do not answer in prose.",
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
      postToolResponse: true,
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

export type FileNavigationResult =
  | {
      ok: true;
      filePath: string;
    }
  | {
      ok: false;
      message: string;
    };

export type ThreadNavigationResult =
  | {
      ok: true;
      thread: ReviewThreadVoiceListItem;
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

export function resolveThreadNavigation(request: ThreadNavigationRequest, threads: ReviewThread[]): ThreadNavigationResult {
  const requestedThreadId = request.threadId?.trim();
  if (requestedThreadId) {
    const thread = threads.find((candidate) => candidate.id === requestedThreadId);
    if (thread) {
      return { ok: true, thread: summarizeThreadNavigationTarget(thread) };
    }
    return { ok: false, message: `No workbench thread matches ${requestedThreadId}.` };
  }

  const title = normalizeFileQuery(request.title);
  if (!title) {
    return { ok: false, message: "Provide a thread id or title to navigate to." };
  }

  const exactMatches = threads.filter((thread) => normalizeFileQuery(thread.title) === title);
  if (exactMatches.length === 1) {
    return { ok: true, thread: summarizeThreadNavigationTarget(exactMatches[0]) };
  }
  if (exactMatches.length > 1) {
    return { ok: false, message: `Multiple threads are named ${request.title}. Use a thread id.` };
  }

  const partialMatches = threads.filter((thread) => normalizeFileQuery(thread.title).includes(title));
  if (partialMatches.length === 1) {
    return { ok: true, thread: summarizeThreadNavigationTarget(partialMatches[0]) };
  }
  if (partialMatches.length > 1) {
    return { ok: false, message: `Multiple threads match ${request.title}: ${partialMatches.map((thread) => thread.id).join(", ")}` };
  }
  return { ok: false, message: `No workbench thread matches ${request.title}.` };
}

function normalizeFileQuery(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

type TranscriptEvent = {
  type?: unknown;
  transcript?: unknown;
};

type ReviewRoomContextInput = {
  activeFile: string | null;
  activeThreadId: string | null;
  selection: CodeSelection | null;
  threads: ReviewThread[];
};

export type ReviewRoomVoiceContext = {
  activeFile: string | null;
  selectedCode: CodeSelection | null;
  selectedPageText: string | null;
  activeThread: ThreadVoiceSummary | null;
  threads: ThreadVoiceSummary[];
  popupText: string;
};

type ThreadVoiceSummary = {
  id: string;
  title: string;
  status: ReviewThread["status"];
  context: CodeSelection | null;
  markdownExcerpt: string | null;
};

export type ReviewThreadVoiceListItem = {
  id: string;
  codexThreadId: string | null;
  title: string;
  status: ReviewThread["status"];
  source: ReviewThread["source"];
};

export type ThreadTextResult =
  | {
      ok: true;
      threadId: string;
      title: string;
      startLine: number;
      endLine: number;
      totalLines: number;
      text: string;
    }
  | {
      ok: false;
      message: string;
    };

export type ThreadSearchResult = {
  query: string;
  matches: ThreadSearchMatch[];
};

export type ThreadSearchMatch = {
  threadId: string;
  codexThreadId: string | null;
  title: string;
  line: number;
  text: string;
};

export function buildReviewRoomContext({
  activeFile,
  activeThreadId,
  selection,
  threads,
}: ReviewRoomContextInput): ReviewRoomVoiceContext {
  const summaries = threads.map(summarizeThreadForVoice);
  const activeThread = summaries.find((thread) => thread.id === activeThreadId) ?? null;
  const selectedPageText = selectedPageTextForVoice();
  return {
    activeFile,
    selectedCode: selection,
    selectedPageText,
    activeThread,
    threads: summaries,
    popupText: contextPopupText(selection, selectedPageText, activeThread),
  };
}

export function listThreadSummariesForVoice(threads: ReviewThread[]): ReviewThreadVoiceListItem[] {
  return threads.map(summarizeThreadNavigationTarget);
}

export function getThreadTextByLineRange(
  threads: ReviewThread[],
  threadId: string,
  startLine = 1,
  endLine?: number,
): ThreadTextResult {
  const thread = threads.find((candidate) => candidate.id === threadId);
  if (!thread) {
    return { ok: false, message: `No workbench thread matches ${threadId}.` };
  }
  const lines = splitThreadText(thread);
  const totalLines = lines.length;
  const requestedEndLine = endLine ?? totalLines;
  if (startLine > requestedEndLine) {
    return { ok: false, message: "Start line must be before or equal to end line." };
  }
  if (startLine > totalLines) {
    return { ok: false, message: `${thread.title} only has ${totalLines} line${totalLines === 1 ? "" : "s"}.` };
  }
  const clampedEndLine = Math.min(requestedEndLine, totalLines);
  return {
    ok: true,
    threadId: thread.id,
    title: thread.title,
    startLine,
    endLine: clampedEndLine,
    totalLines,
    text: lines.slice(startLine - 1, clampedEndLine).join("\n"),
  };
}

export function searchThreadsByText(threads: ReviewThread[], query: string): ThreadSearchResult {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return { query: "", matches: [] };
  }

  const matches: ThreadSearchMatch[] = [];
  for (const thread of threads) {
    const fields = [`# ${thread.title}`, ...splitThreadText(thread)];
    fields.forEach((line, index) => {
      if (!line.toLowerCase().includes(normalizedQuery)) {
        return;
      }
      matches.push({
        threadId: thread.id,
        codexThreadId: thread.codex_thread_id ?? null,
        title: thread.title,
        line: index === 0 ? 0 : index,
        text: truncateForVoice(line, 320),
      });
    });
  }
  return { query: query.trim(), matches };
}

export type FollowUpThreadResolution =
  | {
      ok: true;
      thread: ReviewThread;
    }
  | {
      ok: false;
      message: string;
    };

export function resolveFollowUpThread(
  requestedThreadId: string | undefined,
  activeThreadId: string | null,
  threads: ReviewThread[],
): FollowUpThreadResolution {
  const threadId = requestedThreadId?.trim() || activeThreadId;
  if (!threadId) {
    return { ok: false, message: "Click the relevant Codex thread, then ask the follow-up again." };
  }
  const thread = threads.find((candidate) => candidate.id === threadId);
  if (!thread) {
    return { ok: false, message: `No workbench thread matches ${threadId}.` };
  }
  if (thread.status === "queued" || thread.status === "running") {
    return { ok: false, message: "That Codex thread is still running. Ask the follow-up when it finishes." };
  }
  if (!thread.codex_thread_id) {
    return { ok: false, message: "That workbench thread is not connected to a Codex thread yet." };
  }
  return { ok: true, thread };
}

function summarizeThreadForVoice(thread: ReviewThread): ThreadVoiceSummary {
  return {
    id: thread.id,
    title: thread.title,
    status: thread.status,
    context: thread.context ?? null,
    markdownExcerpt: thread.markdown ? truncateForVoice(thread.markdown, 1200) : null,
  };
}

function summarizeThreadNavigationTarget(thread: ReviewThread): ReviewThreadVoiceListItem {
  return {
    id: thread.id,
    codexThreadId: thread.codex_thread_id ?? null,
    title: thread.title,
    status: thread.status,
    source: thread.source,
  };
}

function splitThreadText(thread: ReviewThread) {
  const text = thread.markdown ?? "";
  if (!text) {
    return [""];
  }
  return text.split(/\r?\n/);
}

function threadsPopupText(threads: ReviewThreadVoiceListItem[]) {
  if (threads.length === 0) {
    return "No review threads are loaded.";
  }
  return threads.map((thread) => `${thread.id} - ${thread.title} (${thread.status})`).join("\n");
}

function threadSearchPopupText(result: ThreadSearchResult) {
  if (!result.query) {
    return "Search query was empty.";
  }
  if (result.matches.length === 0) {
    return `No loaded thread text matches "${result.query}".`;
  }
  return result.matches
    .slice(0, 8)
    .map((match) => `${match.threadId}${match.line > 0 ? `:L${match.line}` : ":title"} - ${match.text}`)
    .join("\n");
}

function selectedPageTextForVoice() {
  const text = window.getSelection()?.toString().trim() ?? "";
  return text || null;
}

function contextPopupText(selection: CodeSelection | null, selectedPageText: string | null, activeThread: ThreadVoiceSummary | null) {
  const parts = [
    selection ? selectedLocationMessage(selection) : "No diff code is selected.",
    activeThread ? `Focused thread: ${activeThread.title}` : "No Codex thread is focused.",
  ];
  if (selectedPageText) {
    parts.push(`Selected page text: ${truncateForVoice(selectedPageText, 240)}`);
  }
  return parts.join("\n");
}

function truncateForVoice(value: string, maxLength: number) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}...`;
}

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
