"use strict";
"use client";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  GhostCursorOverlay: () => GhostCursorOverlay,
  VoiceControlWidget: () => VoiceControlWidget,
  createVoiceControlController: () => createVoiceControlController,
  defineVoiceTool: () => defineVoiceTool,
  useGhostCursor: () => useGhostCursor,
  useVoiceControl: () => useVoiceControl
});
module.exports = __toCommonJS(index_exports);

// src/schema.ts
var import_zod = require("zod");
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isZodSchema(schema) {
  return isPlainObject(schema) && "safeParse" in schema && typeof schema.safeParse === "function";
}
function stripSchemaMetadata(schema) {
  const { $schema, definitions, $ref, ...rest } = schema;
  if (typeof $ref === "string" && definitions && typeof definitions === "object") {
    const key = $ref.split("/").at(-1);
    const definitionMap = definitions;
    if (key && key in definitionMap) {
      return stripSchemaMetadata(definitionMap[key]);
    }
  }
  return rest;
}
function normalizeToolSchema(schema) {
  return stripSchemaMetadata((0, import_zod.toJSONSchema)(schema));
}
function parseToolArguments(schema, rawArgs) {
  const parsed = rawArgs.trim().length === 0 ? {} : JSON.parse(rawArgs);
  return schema.parse(parsed);
}

// src/defineVoiceTool.ts
function defineVoiceTool(definition) {
  if (!isZodSchema(definition.parameters)) {
    throw new Error(
      "Plain JSON Schema tool definitions are no longer supported. Pass a Zod schema to defineVoiceTool()."
    );
  }
  const jsonSchema = normalizeToolSchema(definition.parameters);
  return {
    ...definition,
    jsonSchema,
    realtimeTool: {
      type: "function",
      name: definition.name,
      description: definition.description,
      parameters: jsonSchema
    },
    parseArguments(rawArgs) {
      return parseToolArguments(definition.parameters, rawArgs);
    }
  };
}

// src/internal/cx.ts
function cx(...values) {
  return values.filter(Boolean).join(" ");
}

// src/components/GhostCursorOverlay.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function GhostCursorOverlay({ state, className }) {
  const renderCursor = (cursor) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      "aria-hidden": "true",
      className: cx("vc-ghost-cursor", className),
      "data-phase": cursor.phase,
      "data-role": cursor.role,
      style: {
        "--vc-ghost-cursor-duration": `${cursor.durationMs}ms`,
        "--vc-ghost-cursor-fade": `${cursor.fade ?? 1}`,
        "--vc-ghost-cursor-timing": cursor.easing === "expressive" ? "cubic-bezier(0.16, 1.18, 0.3, 1)" : "cubic-bezier(0.22, 0.84, 0.26, 1)",
        "--vc-ghost-cursor-x": `${cursor.position.x}px`,
        "--vc-ghost-cursor-y": `${cursor.position.y}px`
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vc-ghost-cursor__halo" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vc-ghost-cursor__trail" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vc-ghost-cursor__pointer", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vc-ghost-cursor__core" }) })
      ]
    },
    cursor.id
  );
  const visibleMainCursor = state.main.phase === "hidden" ? null : state.main;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    visibleMainCursor ? renderCursor(visibleMainCursor) : null,
    state.satellites.map(renderCursor)
  ] });
}

// src/useVoiceControl.ts
var import_react = require("react");

// src/internal/session.ts
function outputModalitiesForMode(outputMode) {
  switch (outputMode) {
    case "audio":
      return ["audio"];
    case "text+audio":
      return ["audio"];
    case "tool-only":
      return ["text"];
    case "text":
    default:
      return ["text"];
  }
}
function buildDefaultTurnDetection(session) {
  if (session.activationMode !== "vad") {
    return null;
  }
  return {
    type: "server_vad",
    createResponse: true,
    ...session.outputMode === "audio" || session.outputMode === "text+audio" ? {} : { interruptResponse: false },
    prefixPaddingMs: 300,
    silenceDurationMs: 200,
    threshold: 0.5
  };
}
function mapTurnDetection(turnDetection) {
  if (!turnDetection) {
    return null;
  }
  switch (turnDetection.type) {
    case "semantic_vad":
      return {
        type: "semantic_vad",
        ...turnDetection.createResponse !== void 0 ? { create_response: turnDetection.createResponse } : {},
        ...turnDetection.eagerness !== void 0 ? { eagerness: turnDetection.eagerness } : {},
        ...turnDetection.interruptResponse !== void 0 ? { interrupt_response: turnDetection.interruptResponse } : {}
      };
    case "server_vad":
    default:
      return {
        type: "server_vad",
        ...turnDetection.createResponse !== void 0 ? { create_response: turnDetection.createResponse } : {},
        ...turnDetection.idleTimeoutMs !== void 0 ? { idle_timeout_ms: turnDetection.idleTimeoutMs } : {},
        ...turnDetection.interruptResponse !== void 0 ? { interrupt_response: turnDetection.interruptResponse } : {},
        ...turnDetection.prefixPaddingMs !== void 0 ? { prefix_padding_ms: turnDetection.prefixPaddingMs } : {},
        ...turnDetection.silenceDurationMs !== void 0 ? { silence_duration_ms: turnDetection.silenceDurationMs } : {},
        ...turnDetection.threshold !== void 0 ? { threshold: turnDetection.threshold } : {}
      };
  }
}
function mapNoiseReduction(noiseReduction) {
  if (noiseReduction === null) {
    return null;
  }
  if (!noiseReduction) {
    return void 0;
  }
  return {
    ...noiseReduction.type !== void 0 ? { type: noiseReduction.type } : {}
  };
}
function mapTranscription(transcription) {
  if (transcription === null) {
    return null;
  }
  if (!transcription) {
    return void 0;
  }
  return {
    ...transcription.language !== void 0 ? { language: transcription.language } : {},
    ...transcription.model !== void 0 ? { model: transcription.model } : {},
    ...transcription.prompt !== void 0 ? { prompt: transcription.prompt } : {}
  };
}
function mapAudioConfig(session, audio) {
  const input = audio?.input;
  const output = audio?.output;
  const turnDetection = session.activationMode === "vad" ? input?.turnDetection ?? buildDefaultTurnDetection(session) : null;
  return {
    input: {
      ...input?.format !== void 0 ? { format: input.format } : {},
      ...input?.noiseReduction !== void 0 ? { noise_reduction: mapNoiseReduction(input.noiseReduction) } : {},
      ...input?.transcription !== void 0 ? { transcription: mapTranscription(input.transcription) } : {},
      turn_detection: mapTurnDetection(turnDetection)
    },
    ...output ? {
      output: {
        ...output.format !== void 0 ? { format: output.format } : {},
        ...output.speed !== void 0 ? { speed: output.speed } : {},
        ...output.voice !== void 0 ? { voice: output.voice } : {}
      }
    } : {}
  };
}
function mapToolChoice(toolChoice) {
  if (typeof toolChoice === "string") {
    return toolChoice;
  }
  if (toolChoice.type === "mcp") {
    return {
      type: "mcp",
      server_label: toolChoice.serverLabel,
      ...toolChoice.name !== void 0 ? { name: toolChoice.name } : {}
    };
  }
  return toolChoice;
}
function mapPrompt(prompt) {
  if (!prompt) {
    return void 0;
  }
  return {
    id: prompt.id,
    ...prompt.version !== void 0 ? { version: prompt.version } : {},
    ...prompt.variables !== void 0 ? { variables: prompt.variables } : {}
  };
}
function mapTracing(tracing) {
  if (tracing === null) {
    return null;
  }
  if (tracing === void 0 || tracing === "auto") {
    return tracing;
  }
  return {
    ...tracing.groupId !== void 0 ? { group_id: tracing.groupId } : {},
    ...tracing.metadata !== void 0 ? { metadata: tracing.metadata } : {},
    ...tracing.workflowName !== void 0 ? { workflow_name: tracing.workflowName } : {}
  };
}
function mapTruncation(truncation) {
  if (!truncation || typeof truncation === "string") {
    return truncation;
  }
  return {
    type: truncation.type,
    retention_ratio: truncation.retentionRatio
  };
}
function buildRealtimeSessionPayload(session) {
  const toolChoice = session.toolChoice ?? (session.tools.length > 0 && session.outputMode === "tool-only" ? "required" : "auto");
  return {
    type: "realtime",
    model: session.model,
    instructions: session.instructions,
    tool_choice: mapToolChoice(toolChoice),
    tools: session.tools,
    output_modalities: outputModalitiesForMode(session.outputMode),
    audio: mapAudioConfig(session, session.audio),
    ...session.include !== void 0 ? { include: session.include } : {},
    ...session.maxOutputTokens !== void 0 ? { max_response_output_tokens: session.maxOutputTokens } : {},
    ...session.metadata !== void 0 ? { metadata: session.metadata } : {},
    ...session.prompt !== void 0 ? { prompt: mapPrompt(session.prompt) } : {},
    ...session.tracing !== void 0 ? { tracing: mapTracing(session.tracing) } : {},
    ...session.truncation !== void 0 ? { truncation: mapTruncation(session.truncation) } : {},
    ...session.raw ?? {}
  };
}
function buildSessionUpdateEvent(session) {
  return {
    type: "session.update",
    session: buildRealtimeSessionPayload(session)
  };
}

// src/transport/webRtcRealtimeTransport.ts
var DATA_CHANNEL_OPEN_TIMEOUT_MS = 15e3;
function invariantBrowserApi(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
function createTransportError(message, options) {
  const error = new Error(message);
  if (options?.code) {
    error.code = options.code;
  }
  if (options?.name) {
    error.name = options.name;
  }
  return error;
}
function createAbortError() {
  return createTransportError("Voice control connection was cancelled.", {
    code: "aborted",
    name: "AbortError"
  });
}
function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}
async function withAbort(promise, signal, onResolvedAfterAbort) {
  throwIfAborted(signal);
  if (!signal) {
    return promise;
  }
  return await new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener("abort", handleAbort);
    };
    const settle = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };
    const handleAbort = () => {
      settle(() => {
        reject(createAbortError());
      });
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    void promise.then(
      (value) => {
        if (signal.aborted) {
          onResolvedAfterAbort?.(value);
          settle(() => {
            reject(createAbortError());
          });
          return;
        }
        settle(() => {
          resolve(value);
        });
      },
      (error) => {
        settle(() => {
          reject(error);
        });
      }
    );
  });
}
function waitForDataChannelOpen(dataChannel, peerConnection, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = setTimeout(() => {
      settle(
        new Error(
          `Timed out waiting ${DATA_CHANNEL_OPEN_TIMEOUT_MS}ms for the Realtime data channel to open.`
        )
      );
    }, DATA_CHANNEL_OPEN_TIMEOUT_MS);
    const cleanup = () => {
      dataChannel.removeEventListener("open", handleOpen);
      dataChannel.removeEventListener("error", handleError);
      dataChannel.removeEventListener("close", handleClose);
      peerConnection.removeEventListener("connectionstatechange", handleConnectionStateChange);
      signal?.removeEventListener("abort", handleAbort);
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    const settle = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };
    const handleOpen = () => {
      settle();
    };
    const handleAbort = () => {
      settle(createAbortError());
    };
    const handleError = () => {
      settle(new Error("Realtime data channel failed before opening."));
    };
    const handleClose = () => {
      settle(new Error("Realtime data channel closed before opening."));
    };
    const handleConnectionStateChange = () => {
      switch (peerConnection.connectionState) {
        case "failed":
        case "closed":
        case "disconnected":
          settle(
            new Error(
              `Realtime peer connection ${peerConnection.connectionState} before the data channel opened.`
            )
          );
          break;
        default:
          break;
      }
    };
    dataChannel.addEventListener("open", handleOpen, { once: true });
    dataChannel.addEventListener("error", handleError, { once: true });
    dataChannel.addEventListener("close", handleClose, { once: true });
    peerConnection.addEventListener("connectionstatechange", handleConnectionStateChange);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}
function buildSessionEndpointRequest(sessionEndpoint, sessionRequestInit, sdp, session, signal) {
  const formData = new FormData();
  formData.set("sdp", sdp);
  formData.set("session", JSON.stringify(buildRealtimeSessionPayload(session)));
  const headers = new Headers(sessionRequestInit?.headers);
  headers.delete("Content-Type");
  return fetch(sessionEndpoint, {
    ...sessionRequestInit,
    method: "POST",
    headers,
    body: formData,
    ...signal ? { signal } : {}
  });
}
function buildDirectRealtimeRequest(authToken, sdp, signal) {
  return fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/sdp"
    },
    body: sdp,
    ...signal ? { signal } : {}
  });
}
var WebRtcRealtimeTransport = class {
  state = {
    audioElement: null,
    dataChannel: null,
    localTrack: null,
    peerConnection: null,
    session: null
  };
  onServerEvent = null;
  onError = null;
  isCapturing = false;
  isDisconnecting = false;
  hasOpenedDataChannel = false;
  async connect(options) {
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      throw createTransportError(
        "Voice control requires HTTPS or localhost because microphone access only works in secure contexts.",
        {
          code: "insecure_context",
          name: "NotAllowedError"
        }
      );
    }
    invariantBrowserApi(
      typeof window !== "undefined" && "RTCPeerConnection" in window && navigator?.mediaDevices?.getUserMedia,
      "WebRTC voice control requires a browser with mediaDevices and RTCPeerConnection support."
    );
    this.disconnect();
    throwIfAborted(options.signal);
    let openPromise = null;
    try {
      this.onServerEvent = options.onServerEvent;
      this.onError = options.onError;
      this.state.session = options.session;
      this.state.audioElement = document.createElement("audio");
      this.state.audioElement.autoplay = true;
      this.state.audioElement.muted = !options.audioPlaybackEnabled;
      const peerConnection = new RTCPeerConnection();
      this.state.peerConnection = peerConnection;
      peerConnection.ontrack = (event) => {
        if (this.state.audioElement) {
          this.state.audioElement.srcObject = event.streams[0] ?? null;
        }
      };
      const dataChannel = peerConnection.createDataChannel("oai-events");
      this.state.dataChannel = dataChannel;
      dataChannel.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(String(event.data));
          this.onServerEvent?.(payload);
        } catch (error) {
          this.onError?.(
            error instanceof Error ? error : new Error("Invalid Realtime event payload.")
          );
        }
      });
      dataChannel.addEventListener("error", () => {
        if (this.hasOpenedDataChannel) {
          this.handleRuntimeFailure("Realtime data channel error during the active session.");
        }
      });
      dataChannel.addEventListener("close", () => {
        if (this.hasOpenedDataChannel) {
          this.handleRuntimeFailure("Realtime data channel closed during the active session.");
        }
      });
      peerConnection.addEventListener("connectionstatechange", () => {
        if (!this.hasOpenedDataChannel) {
          return;
        }
        switch (peerConnection.connectionState) {
          case "failed":
          case "closed":
          case "disconnected":
            this.handleRuntimeFailure(
              `Realtime peer connection ${peerConnection.connectionState} during the active session.`
            );
            break;
          default:
            break;
        }
      });
      openPromise = waitForDataChannelOpen(dataChannel, peerConnection, options.signal).then(() => {
        this.hasOpenedDataChannel = true;
        if (this.state.session) {
          this.sendClientEventInternal(buildSessionUpdateEvent(this.state.session));
          this.applyTrackMode(this.state.session.activationMode);
        }
      });
      void openPromise.catch(() => {
      });
      const mediaStream = await withAbort(
        navigator.mediaDevices.getUserMedia({ audio: true }),
        options.signal,
        (stream) => {
          stream.getTracks().forEach((track) => track.stop());
        }
      );
      const [localTrack] = mediaStream.getAudioTracks();
      this.state.localTrack = localTrack ?? null;
      if (localTrack) {
        peerConnection.addTrack(localTrack, mediaStream);
      }
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      const sdp = peerConnection.localDescription?.sdp;
      if (!sdp) {
        throw new Error("Failed to generate a local SDP offer.");
      }
      const response = await withAbort(
        options.auth.type === "session_endpoint" ? buildSessionEndpointRequest(
          options.auth.sessionEndpoint,
          options.auth.sessionRequestInit,
          sdp,
          options.session,
          options.signal
        ) : buildDirectRealtimeRequest(options.auth.authToken, sdp, options.signal),
        options.signal
      );
      if (!response.ok) {
        const details = await withAbort(response.text(), options.signal);
        throw new Error(`Failed to establish Realtime WebRTC session: ${details}`);
      }
      const answerSdp = await withAbort(response.text(), options.signal);
      if (!answerSdp.trim()) {
        throw new Error("Failed to establish Realtime WebRTC session: empty SDP answer.");
      }
      await withAbort(
        peerConnection.setRemoteDescription({
          type: "answer",
          sdp: answerSdp
        }),
        options.signal
      );
      await openPromise;
      throwIfAborted(options.signal);
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }
  disconnect() {
    if (this.isDisconnecting) {
      return;
    }
    this.isDisconnecting = true;
    this.state.localTrack?.stop();
    if (this.state.dataChannel && this.state.dataChannel.readyState !== "closed") {
      this.state.dataChannel.close();
    }
    if (this.state.peerConnection && this.state.peerConnection.connectionState !== "closed") {
      this.state.peerConnection.close();
    }
    this.state.audioElement?.remove();
    this.state = {
      audioElement: null,
      dataChannel: null,
      localTrack: null,
      peerConnection: null,
      session: null
    };
    this.isCapturing = false;
    this.hasOpenedDataChannel = false;
    this.onServerEvent = null;
    this.onError = null;
    this.isDisconnecting = false;
  }
  updateSession(session) {
    this.state.session = session;
    if (this.state.dataChannel?.readyState === "open") {
      this.sendClientEventInternal(buildSessionUpdateEvent(session));
      this.applyTrackMode(session.activationMode);
    }
  }
  startCapture() {
    if (!this.state.session || this.state.session.activationMode === "vad") {
      return;
    }
    this.sendClientEventInternal({ type: "input_audio_buffer.clear" });
    this.isCapturing = true;
    if (this.state.localTrack) {
      this.state.localTrack.enabled = true;
    }
  }
  stopCapture() {
    if (!this.state.session || this.state.session.activationMode === "vad" || !this.isCapturing) {
      return;
    }
    this.isCapturing = false;
    if (this.state.localTrack) {
      this.state.localTrack.enabled = false;
    }
    this.sendClientEventInternal({ type: "input_audio_buffer.commit" });
    this.sendClientEventInternal({ type: "response.create" });
  }
  sendFunctionResult(callId, output) {
    this.sendClientEventInternal({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output)
      }
    });
  }
  requestResponse() {
    this.sendClientEventInternal({ type: "response.create" });
  }
  sendClientEvent(event) {
    this.sendClientEventInternal(event);
  }
  setAudioPlaybackEnabled(enabled) {
    if (this.state.audioElement) {
      this.state.audioElement.muted = !enabled;
    }
  }
  handleRuntimeFailure(message) {
    if (this.isDisconnecting) {
      return;
    }
    const onError = this.onError;
    this.disconnect();
    onError?.(new Error(message));
  }
  applyTrackMode(mode) {
    if (!this.state.localTrack) {
      return;
    }
    if (mode === "vad") {
      this.state.localTrack.enabled = true;
      return;
    }
    this.state.localTrack.enabled = this.isCapturing;
  }
  sendClientEventInternal(event) {
    if (this.state.dataChannel?.readyState === "open") {
      this.state.dataChannel.send(JSON.stringify(event));
    }
  }
};
function createWebRtcRealtimeTransport() {
  return new WebRtcRealtimeTransport();
}

// src/voiceControlController.ts
var DEFAULT_MODEL = "gpt-realtime-1.5";
var DEFAULT_INSTRUCTIONS = "You are a voice control agent for a React web app. Use only the registered tools to act on the UI. Prefer tool calls over chat when a tool can satisfy the request. Ask one short clarification question when required tool arguments are missing or ambiguous. Do not invent capabilities or successful outcomes. Keep any reply brief, and only reply when no tool is appropriate.";
var DEFAULT_MAX_TOOL_CALL_HISTORY = 500;
function createAbortError2() {
  const error = new Error("Voice control connection was cancelled.");
  error.name = "AbortError";
  error.code = "aborted";
  return error;
}
function isAbortError(error) {
  return error instanceof Error && (error.name === "AbortError" || error.code === "aborted");
}
function throwIfAborted2(signal) {
  if (signal?.aborted) {
    throw createAbortError2();
  }
}
function inferErrorCode(error) {
  const errorWithCode = error;
  if (errorWithCode.code) {
    return errorWithCode.code;
  }
  const message = error.message.toLowerCase();
  if (error.name === "AbortError") {
    return "aborted";
  }
  if (error.name === "NotAllowedError") {
    return message.includes("secure context") || message.includes("https") ? "insecure_context" : "permission_denied";
  }
  if (error.name === "NotFoundError" || error.name === "NotReadableError" || error.name === "OverconstrainedError") {
    return "device_unavailable";
  }
  if (error.name === "NotSupportedError") {
    return "unsupported_browser";
  }
  if (message.includes("secure context") || message.includes("https or localhost")) {
    return "insecure_context";
  }
  if (message.includes("mediadevices") || message.includes("rtcpeerconnection support")) {
    return "unsupported_browser";
  }
  if (message.includes("timed out")) {
    return "media_timeout";
  }
  if (message.includes("failed to establish realtime webrtc session")) {
    return "network_error";
  }
  if (message.includes("failed to fetch realtime client secret")) {
    return "network_error";
  }
  return "unknown";
}
function normalizeError(error) {
  if (error instanceof Error) {
    return {
      code: inferErrorCode(error),
      message: error.message,
      cause: error
    };
  }
  if (typeof error === "string") {
    return { code: "unknown", message: error };
  }
  return {
    code: "unknown",
    message: "Unknown voice control error.",
    cause: error
  };
}
function includesAudio(outputMode) {
  return outputMode === "audio" || outputMode === "text+audio";
}
function extractTextDelta(event) {
  if (event.type === "response.text.delta" || event.type === "response.output_text.delta" || event.type === "response.output_audio_transcript.delta") {
    const delta = event.delta;
    return typeof delta === "string" ? delta : null;
  }
  return null;
}
function extractCompletedText(event) {
  if (event.type === "response.output_text.done") {
    return typeof event.text === "string" ? event.text : null;
  }
  if (event.type === "response.output_audio_transcript.done") {
    return typeof event.transcript === "string" ? event.transcript : null;
  }
  return null;
}
function extractResponseId(event) {
  if (typeof event.response_id === "string") {
    return event.response_id;
  }
  const response = event.response;
  return typeof response?.id === "string" ? response.id : null;
}
function isFunctionCallItem(item) {
  return typeof item === "object" && item !== null && item.type === "function_call";
}
function normalizeToolCallHistoryLimit(limit) {
  if (limit === null) {
    return null;
  }
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_MAX_TOOL_CALL_HISTORY;
  }
  return Math.max(0, Math.floor(limit));
}
function finalizeToolCallRecord(record) {
  const finishedAt = record.finishedAt;
  return {
    id: record.id,
    ...record.responseId ? { responseId: record.responseId } : {},
    sequence: record.sequence,
    name: record.name,
    status: record.status,
    ...record.args !== void 0 ? { args: record.args } : {},
    ...record.output !== void 0 ? { output: record.output } : {},
    ...record.error ? { error: record.error } : {},
    startedAt: record.startedAt,
    ...finishedAt === void 0 ? {} : {
      finishedAt,
      durationMs: Math.max(0, finishedAt - record.startedAt)
    }
  };
}
function deriveStatus(activity, connected, activationMode, capturing) {
  if (activity === "error") {
    return "error";
  }
  if (activity === "connecting") {
    return "connecting";
  }
  if (!connected) {
    return "idle";
  }
  if (activity === "processing" || activity === "executing") {
    return "processing";
  }
  if (activationMode === "vad" || capturing) {
    return "listening";
  }
  return "ready";
}
async function resolveClientSecret(options, model, signal) {
  if ("getClientSecret" in options) {
    const clientSecret = await options.getClientSecret();
    throwIfAborted2(signal);
    return clientSecret;
  }
  if (!("tokenEndpoint" in options)) {
    throw new Error("Session endpoint auth does not provide a client secret.");
  }
  const requestUrl = new URL(
    options.tokenEndpoint,
    typeof window === "undefined" ? "http://localhost" : window.location.origin
  );
  requestUrl.searchParams.set("model", model);
  const response = await fetch(requestUrl.toString(), {
    method: "GET",
    ...signal ? { signal } : {},
    ...options.tokenRequestInit
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Realtime client secret: ${response.status}`);
  }
  const payload = await response.json();
  const fromNested = typeof payload.client_secret === "object" && payload.client_secret !== null ? payload.client_secret.value : void 0;
  const value = payload.value ?? fromNested ?? payload.client_secret;
  if (typeof value !== "string") {
    throw new Error("Token endpoint did not return a usable Realtime client secret.");
  }
  return value;
}
function resolveEndpointUrl(endpoint) {
  return new URL(
    endpoint,
    typeof window === "undefined" ? "http://localhost" : window.location.origin
  ).toString();
}
async function resolveTransportAuth(options, model, signal) {
  if ("sessionEndpoint" in options) {
    return {
      type: "session_endpoint",
      sessionEndpoint: resolveEndpointUrl(options.sessionEndpoint),
      ...options.sessionRequestInit !== void 0 ? { sessionRequestInit: options.sessionRequestInit } : {}
    };
  }
  return {
    type: "auth_token",
    authToken: await resolveClientSecret(options, model, signal)
  };
}
function mergeAudioConfig(base, patch) {
  if (!base) {
    return patch;
  }
  if (!patch) {
    return base;
  }
  const input = base.input || patch.input ? {
    ...base.input ?? {},
    ...patch.input ?? {}
  } : void 0;
  const output = base.output || patch.output ? {
    ...base.output ?? {},
    ...patch.output ?? {}
  } : void 0;
  return {
    ...input ? { input } : {},
    ...output ? { output } : {}
  };
}
function withOptionalField(target, key, value) {
  if (value !== void 0) {
    target[key] = value;
  }
  return target;
}
function resolveClearablePatch(base, patch) {
  if (patch === void 0) {
    return base;
  }
  return patch ?? void 0;
}
function mergeRealtimeSessionOptions(base, patch) {
  const next = {};
  const audio = patch.audio === void 0 ? base.audio : patch.audio ? mergeAudioConfig(base.audio, patch.audio) : void 0;
  withOptionalField(next, "audio", audio);
  withOptionalField(next, "include", resolveClearablePatch(base.include, patch.include));
  withOptionalField(
    next,
    "maxOutputTokens",
    resolveClearablePatch(base.maxOutputTokens, patch.maxOutputTokens)
  );
  withOptionalField(next, "metadata", resolveClearablePatch(base.metadata, patch.metadata));
  withOptionalField(next, "prompt", resolveClearablePatch(base.prompt, patch.prompt));
  withOptionalField(next, "toolChoice", resolveClearablePatch(base.toolChoice, patch.toolChoice));
  withOptionalField(next, "tracing", patch.tracing !== void 0 ? patch.tracing : base.tracing);
  withOptionalField(next, "truncation", resolveClearablePatch(base.truncation, patch.truncation));
  withOptionalField(next, "raw", resolveClearablePatch(base.raw, patch.raw));
  return next;
}
function resolveAdvancedRealtimeSessionOptions(options, runtimePatch) {
  const mergedTopLevel = {
    ...options.session ?? {},
    ...options.audio !== void 0 ? { audio: options.audio } : {},
    ...options.include !== void 0 ? { include: options.include } : {},
    ...options.maxOutputTokens !== void 0 ? { maxOutputTokens: options.maxOutputTokens } : {},
    ...options.prompt !== void 0 ? { prompt: options.prompt } : {},
    ...options.toolChoice !== void 0 ? { toolChoice: options.toolChoice } : {},
    ...options.tracing !== void 0 ? { tracing: options.tracing } : {},
    ...options.truncation !== void 0 ? { truncation: options.truncation } : {}
  };
  return mergeRealtimeSessionOptions(mergedTopLevel, runtimePatch);
}
function resolveSessionConfig(options, instructions, tools, runtimePatch) {
  const advanced = resolveAdvancedRealtimeSessionOptions(options, runtimePatch);
  return {
    model: options.model ?? DEFAULT_MODEL,
    instructions,
    tools: tools.map((tool) => tool.realtimeTool),
    activationMode: options.activationMode ?? "push-to-talk",
    outputMode: options.outputMode ?? "tool-only",
    ...advanced.audio !== void 0 ? { audio: advanced.audio } : {},
    ...advanced.include !== void 0 ? { include: advanced.include } : {},
    ...advanced.maxOutputTokens !== void 0 ? { maxOutputTokens: advanced.maxOutputTokens } : {},
    ...advanced.metadata !== void 0 ? { metadata: advanced.metadata } : {},
    ...advanced.prompt !== void 0 ? { prompt: advanced.prompt } : {},
    ...advanced.toolChoice !== void 0 ? { toolChoice: advanced.toolChoice } : {},
    ...advanced.tracing !== void 0 ? { tracing: advanced.tracing } : {},
    ...advanced.truncation !== void 0 ? { truncation: advanced.truncation } : {},
    ...advanced.raw !== void 0 ? { raw: advanced.raw } : {}
  };
}
function createInitialSnapshot(options) {
  const sessionConfig = resolveSessionConfig(
    options,
    options.instructions ?? DEFAULT_INSTRUCTIONS,
    options.tools,
    {}
  );
  return {
    status: "idle",
    activity: "idle",
    connected: false,
    transcript: "",
    toolCalls: [],
    latestToolCall: null,
    sessionConfig
  };
}
function isVoiceControlController(value) {
  return typeof value === "object" && value !== null && "configure" in value && typeof value.configure === "function" && "getSnapshot" in value && typeof value.getSnapshot === "function" && "subscribe" in value && typeof value.subscribe === "function";
}
var VoiceControlControllerImpl = class {
  #listeners = /* @__PURE__ */ new Set();
  #options;
  #snapshot;
  #liveInstructions;
  #liveTools;
  #runtimeSessionPatch = {};
  #capturing = false;
  #transport = null;
  #connectAbortController = null;
  #sessionQueue = Promise.resolve();
  #historyLimit;
  #executedCallIds = /* @__PURE__ */ new Set();
  #responseToolCounts = /* @__PURE__ */ new Map();
  #toolExecutedDuringResponse = false;
  #responseInFlight = false;
  #pendingPostToolResponse = false;
  #currentResponseIsPostTool = false;
  #runningToolCallCount = 0;
  #toolCallRecords = /* @__PURE__ */ new Map();
  #toolCallOrder = [];
  #nextToolCallSequence = 1;
  #destroyed = false;
  constructor(options) {
    this.#options = options;
    this.#snapshot = createInitialSnapshot(options);
    this.#liveInstructions = this.#snapshot.sessionConfig.instructions;
    this.#liveTools = options.tools;
    this.#historyLimit = normalizeToolCallHistoryLimit(options.maxToolCallHistory);
    if (options.autoConnect) {
      void this.connect();
    }
  }
  get status() {
    return this.#snapshot.status;
  }
  get activity() {
    return this.#snapshot.activity;
  }
  get connected() {
    return this.#snapshot.connected;
  }
  get transcript() {
    return this.#snapshot.transcript;
  }
  get toolCalls() {
    return this.#snapshot.toolCalls;
  }
  get latestToolCall() {
    return this.#snapshot.latestToolCall;
  }
  get sessionConfig() {
    return this.#snapshot.sessionConfig;
  }
  subscribe = (listener) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  getSnapshot = () => this.#snapshot;
  configure = (options) => {
    if (this.#destroyed) {
      return;
    }
    const previous = this.#options;
    this.#options = options;
    let shouldSyncSession = false;
    if (previous.instructions !== options.instructions) {
      this.#liveInstructions = options.instructions ?? DEFAULT_INSTRUCTIONS;
      shouldSyncSession = true;
    }
    if (previous.tools !== options.tools) {
      this.#liveTools = options.tools;
      shouldSyncSession = true;
    }
    if (previous.maxToolCallHistory !== options.maxToolCallHistory) {
      this.#historyLimit = normalizeToolCallHistoryLimit(options.maxToolCallHistory);
      this.#syncToolCallSnapshot();
    }
    shouldSyncSession ||= previous.activationMode !== options.activationMode || previous.audio !== options.audio || previous.include !== options.include || previous.maxOutputTokens !== options.maxOutputTokens || previous.model !== options.model || previous.outputMode !== options.outputMode || previous.prompt !== options.prompt || previous.session !== options.session || previous.toolChoice !== options.toolChoice || previous.tracing !== options.tracing || previous.truncation !== options.truncation;
    if (shouldSyncSession) {
      this.#setSessionConfig(
        resolveSessionConfig(
          this.#options,
          this.#liveInstructions,
          this.#liveTools,
          this.#runtimeSessionPatch
        )
      );
    }
    if (options.autoConnect && !previous.autoConnect) {
      void this.connect();
    }
  };
  destroy = () => {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#connectAbortController?.abort();
    this.#connectAbortController = null;
    this.#transport?.disconnect();
    this.#transport = null;
    this.#listeners.clear();
  };
  clearToolCalls = () => {
    this.#toolCallRecords.clear();
    this.#toolCallOrder = [];
    this.#nextToolCallSequence = 1;
    this.#publish({ toolCalls: [] });
  };
  connect = async () => {
    if (this.#destroyed || this.connected || this.activity === "connecting") {
      return;
    }
    this.#connectAbortController?.abort();
    const connectAbortController = new AbortController();
    this.#connectAbortController = connectAbortController;
    this.#setActivity("connecting");
    this.#debugLog("connect.start", this.sessionConfig);
    try {
      const auth = await resolveTransportAuth(
        this.#options.auth,
        this.sessionConfig.model,
        connectAbortController.signal
      );
      throwIfAborted2(connectAbortController.signal);
      const transport = this.#options.transportFactory?.() ?? createWebRtcRealtimeTransport();
      this.#resetTransientState("connecting", { clearTranscript: true });
      this.clearToolCalls();
      await transport.connect({
        auth,
        session: this.sessionConfig,
        audioPlaybackEnabled: includesAudio(this.sessionConfig.outputMode),
        signal: connectAbortController.signal,
        onServerEvent: this.#handleServerEvent,
        onError: (error) => {
          this.#emitError(error, { disconnect: true });
        }
      });
      throwIfAborted2(connectAbortController.signal);
      this.#transport = transport;
      this.#connectAbortController = null;
      this.#setConnected(true);
      this.#setActivity("listening");
      this.#debugLog("connect.ready");
      this.#emitEvent({ type: "voice.transport.connected" });
    } catch (error) {
      if (this.#connectAbortController === connectAbortController) {
        this.#connectAbortController = null;
      }
      if (isAbortError(error)) {
        this.#resetTransientState("idle");
        return;
      }
      this.#emitError(error);
    }
  };
  disconnect = () => {
    if (this.#destroyed) {
      return;
    }
    this.#debugLog("disconnect");
    this.#connectAbortController?.abort();
    this.#connectAbortController = null;
    const wasConnected = this.connected;
    this.#transport?.disconnect();
    this.#transport = null;
    this.#setConnected(false);
    this.#resetTransientState("idle");
    if (wasConnected) {
      this.#emitEvent({ type: "voice.transport.disconnected" });
    }
  };
  startCapture = () => {
    if (this.#destroyed || !this.connected || this.sessionConfig.activationMode === "vad" || this.#capturing) {
      return;
    }
    this.#setCapturing(true);
    this.#setActivity("listening");
    this.#transport?.startCapture();
    this.#emitEvent({ type: "voice.capture.started" });
  };
  stopCapture = () => {
    if (this.#destroyed || !this.connected || this.sessionConfig.activationMode === "vad" || !this.#capturing) {
      return;
    }
    this.#setCapturing(false);
    this.#responseInFlight = true;
    this.#setActivity("processing");
    this.#transport?.stopCapture();
    this.#emitEvent({ type: "voice.capture.stopped" });
  };
  updateInstructions = (instructions) => {
    this.#liveInstructions = instructions;
    this.#setSessionConfig(
      resolveSessionConfig(
        this.#options,
        this.#liveInstructions,
        this.#liveTools,
        this.#runtimeSessionPatch
      )
    );
  };
  updateTools = (tools) => {
    this.#liveTools = tools;
    this.#setSessionConfig(
      resolveSessionConfig(
        this.#options,
        this.#liveInstructions,
        this.#liveTools,
        this.#runtimeSessionPatch
      )
    );
  };
  updateSession = (patch) => {
    this.#runtimeSessionPatch = mergeRealtimeSessionOptions(this.#runtimeSessionPatch, patch);
    this.#debugLog("session.patch", patch, this.#runtimeSessionPatch);
    this.#setSessionConfig(
      resolveSessionConfig(
        this.#options,
        this.#liveInstructions,
        this.#liveTools,
        this.#runtimeSessionPatch
      )
    );
  };
  requestResponse = () => {
    if (this.#destroyed || !this.connected) {
      return;
    }
    this.#pendingPostToolResponse = false;
    this.#currentResponseIsPostTool = false;
    this.#responseInFlight = true;
    this.#setActivity("processing");
    this.#debugLog("response.create");
    this.#transport?.requestResponse();
  };
  sendClientEvent = (event) => {
    if (this.#destroyed) {
      return;
    }
    this.#debugLog("client.send", event);
    this.#transport?.sendClientEvent(event);
  };
  #notify() {
    if (this.#destroyed) {
      return;
    }
    for (const listener of this.#listeners) {
      listener();
    }
  }
  #publish(partial = {}) {
    const nextActivity = partial.activity ?? this.#snapshot.activity;
    const nextConnected = partial.connected ?? this.#snapshot.connected;
    const nextTranscript = partial.transcript ?? this.#snapshot.transcript;
    const nextToolCalls = partial.toolCalls ?? this.#snapshot.toolCalls;
    const nextSessionConfig = partial.sessionConfig ?? this.#snapshot.sessionConfig;
    const nextStatus = deriveStatus(
      nextActivity,
      nextConnected,
      nextSessionConfig.activationMode,
      this.#capturing
    );
    const nextLatestToolCall = nextToolCalls.at(-1) ?? null;
    if (this.#snapshot.activity === nextActivity && this.#snapshot.connected === nextConnected && this.#snapshot.transcript === nextTranscript && this.#snapshot.toolCalls === nextToolCalls && this.#snapshot.sessionConfig === nextSessionConfig && this.#snapshot.status === nextStatus && this.#snapshot.latestToolCall === nextLatestToolCall) {
      return;
    }
    this.#snapshot = {
      activity: nextActivity,
      connected: nextConnected,
      transcript: nextTranscript,
      toolCalls: nextToolCalls,
      latestToolCall: nextLatestToolCall,
      sessionConfig: nextSessionConfig,
      status: nextStatus
    };
    this.#notify();
  }
  #setActivity(next) {
    this.#publish({ activity: next });
  }
  #setCapturing(next) {
    if (this.#capturing === next) {
      return;
    }
    this.#capturing = next;
    this.#publish();
  }
  #setConnected(next) {
    this.#publish({ connected: next });
  }
  #setTranscript(next) {
    this.#publish({ transcript: next });
  }
  #setSessionConfig(next) {
    this.#publish({ sessionConfig: next });
    if (this.connected) {
      this.#applySessionUpdate();
    }
  }
  #debugLog(...parts) {
    if (this.#options.debug && typeof console !== "undefined" && console.debug) {
      console.debug("[voice-control]", ...parts);
    }
  }
  #emitEvent(event) {
    if (this.#destroyed) {
      return;
    }
    if ("type" in event) {
      this.#debugLog("event", event.type, event);
    }
    this.#options.onEvent?.(event);
  }
  #resetResponseState() {
    this.#executedCallIds.clear();
    this.#responseToolCounts.clear();
    this.#toolExecutedDuringResponse = false;
    this.#responseInFlight = false;
    this.#pendingPostToolResponse = false;
    this.#currentResponseIsPostTool = false;
    this.#runningToolCallCount = 0;
    this.#setCapturing(false);
  }
  #emitError(error, options) {
    if (this.#destroyed) {
      return;
    }
    const normalized = normalizeError(error);
    const shouldDisconnect = options?.disconnect ?? false;
    if (shouldDisconnect) {
      const wasConnected = this.connected;
      this.#transport = null;
      this.#setConnected(false);
      if (wasConnected) {
        this.#emitEvent({ type: "voice.transport.disconnected" });
      }
    }
    this.#resetResponseState();
    this.#setActivity("error");
    this.#debugLog("error", normalized);
    this.#options.onError?.(normalized);
  }
  #resetTransientState(nextActivity, options) {
    this.#resetResponseState();
    if (options?.clearTranscript) {
      this.#setTranscript("");
    }
    this.#setActivity(nextActivity);
  }
  #restingActivity() {
    return this.connected ? "listening" : "idle";
  }
  #applySessionUpdate() {
    this.#debugLog("session.update", this.sessionConfig);
    this.#transport?.updateSession(this.sessionConfig);
    this.#transport?.setAudioPlaybackEnabled(includesAudio(this.sessionConfig.outputMode));
  }
  #requestPostToolResponse() {
    this.#pendingPostToolResponse = true;
    this.#debugLog("response.create.post-tool");
    this.#transport?.requestResponse();
    this.#setActivity("processing");
  }
  #finishToolExecution() {
    this.#runningToolCallCount = Math.max(0, this.#runningToolCallCount - 1);
    if (this.activity === "error") {
      return;
    }
    if (this.#runningToolCallCount > 0) {
      this.#setActivity("executing");
      return;
    }
    this.#setActivity(this.#responseInFlight ? "processing" : this.#restingActivity());
  }
  #queueSessionTask(task) {
    this.#sessionQueue = this.#sessionQueue.then(task).catch((error) => {
      this.#emitError(error);
    });
  }
  #trackExecutedCall(callId) {
    if (!callId) {
      return true;
    }
    if (this.#executedCallIds.has(callId)) {
      return false;
    }
    this.#executedCallIds.add(callId);
    return true;
  }
  #incrementResponseToolCount(responseId, count = 1) {
    if (!responseId) {
      return;
    }
    this.#responseToolCounts.set(
      responseId,
      (this.#responseToolCounts.get(responseId) ?? 0) + count
    );
  }
  #syncToolCallSnapshot() {
    const limit = this.#historyLimit;
    if (limit !== null && this.#toolCallOrder.length > limit) {
      const overflowCount = this.#toolCallOrder.length - limit;
      const droppedIds = this.#toolCallOrder.slice(0, overflowCount);
      this.#toolCallOrder = this.#toolCallOrder.slice(overflowCount);
      for (const id of droppedIds) {
        this.#toolCallRecords.delete(id);
      }
    }
    this.#publish({
      toolCalls: this.#toolCallOrder.map((id) => this.#toolCallRecords.get(id)).filter((record) => record !== void 0)
    });
  }
  #upsertToolCallRecord(record) {
    const existing = this.#toolCallRecords.get(record.id);
    const responseId = record.responseId ?? existing?.responseId;
    const args = record.args !== void 0 ? record.args : existing?.args;
    const next = finalizeToolCallRecord({
      id: record.id,
      ...responseId ? { responseId } : {},
      sequence: existing?.sequence ?? this.#nextToolCallSequence++,
      name: record.name,
      status: record.status,
      ...args !== void 0 ? { args } : {},
      ...record.output !== void 0 ? { output: record.output } : {},
      ...record.error ? { error: record.error } : {},
      startedAt: existing?.startedAt ?? record.startedAt,
      ...record.finishedAt !== void 0 ? { finishedAt: record.finishedAt } : {}
    });
    if (!existing) {
      this.#toolCallOrder = [...this.#toolCallOrder, record.id];
    }
    this.#toolCallRecords.set(record.id, next);
    this.#syncToolCallSnapshot();
    return next;
  }
  #failToolCall({
    callId,
    responseId,
    toolName,
    args,
    startedAt,
    error
  }) {
    const finishedAt = Date.now();
    const normalizedError = normalizeError(error);
    const failureEvent = {
      callId,
      name: toolName,
      args,
      error: normalizedError
    };
    this.#transport?.sendFunctionResult(callId, {
      ok: false,
      error: normalizedError.message
    });
    this.#emitEvent({
      type: "voice.tool.failed",
      ...failureEvent
    });
    this.#options.onToolError?.(failureEvent);
    this.#upsertToolCallRecord({
      id: callId,
      ...responseId ? { responseId } : {},
      name: toolName,
      status: "error",
      args,
      error: normalizedError,
      startedAt,
      finishedAt
    });
  }
  #executeToolCall = async (item, responseId) => {
    this.#toolExecutedDuringResponse = true;
    const callId = item.call_id ?? item.id ?? `call-${Date.now()}`;
    const toolName = item.name ?? "unknown_tool";
    const rawArgs = item.arguments ?? "{}";
    const startedAt = Date.now();
    const matchingTool = this.#liveTools.find((tool) => tool.name === toolName);
    if (!matchingTool) {
      const output = { ok: false, error: `No tool registered for ${toolName}.` };
      this.#transport?.sendFunctionResult(callId, output);
      this.#upsertToolCallRecord({
        id: callId,
        ...responseId ? { responseId } : {},
        name: toolName,
        status: "skipped",
        args: rawArgs,
        output,
        startedAt,
        finishedAt: Date.now()
      });
      return;
    }
    let parsedArgs;
    try {
      parsedArgs = matchingTool.parseArguments(rawArgs);
    } catch (error) {
      this.#failToolCall({
        callId,
        responseId,
        toolName,
        args: rawArgs,
        startedAt,
        error
      });
      return;
    }
    const startEvent = {
      callId,
      name: toolName,
      args: parsedArgs
    };
    this.#runningToolCallCount += 1;
    this.#setActivity("executing");
    this.#emitEvent({
      type: "voice.tool.started",
      ...startEvent
    });
    this.#options.onToolStart?.(startEvent);
    this.#upsertToolCallRecord({
      id: callId,
      ...responseId ? { responseId } : {},
      name: toolName,
      status: "running",
      args: parsedArgs,
      startedAt
    });
    try {
      const output = await matchingTool.execute(parsedArgs);
      const finishedAt = Date.now();
      const successEvent = {
        ...startEvent,
        output
      };
      this.#transport?.sendFunctionResult(callId, output);
      this.#emitEvent({
        type: "voice.tool.succeeded",
        ...successEvent
      });
      this.#options.onToolSuccess?.(successEvent);
      this.#upsertToolCallRecord({
        id: callId,
        ...responseId ? { responseId } : {},
        name: toolName,
        status: "success",
        args: parsedArgs,
        output,
        startedAt,
        finishedAt
      });
    } catch (error) {
      this.#failToolCall({
        callId,
        responseId,
        toolName,
        args: parsedArgs,
        startedAt,
        error
      });
    } finally {
      this.#finishToolExecution();
    }
  };
  #handleToolOnlyNoAction(responseId) {
    const message = "The model responded without choosing a registered tool.";
    const startedAt = Date.now();
    this.#emitEvent({
      type: "voice.no_action",
      message
    });
    this.#upsertToolCallRecord({
      id: `no-action-${startedAt}`,
      ...responseId ? { responseId } : {},
      name: "no_action",
      status: "skipped",
      output: { message },
      startedAt,
      finishedAt: startedAt
    });
    if (responseId) {
      this.#responseToolCounts.delete(responseId);
    }
    this.#toolExecutedDuringResponse = false;
    this.#setActivity(this.#restingActivity());
  }
  #handleResponseDone(event, functionCalls) {
    this.#queueSessionTask(async () => {
      const responseId = extractResponseId(event);
      this.#responseInFlight = false;
      const executedCount = responseId ? this.#responseToolCounts.get(responseId) ?? 0 : 0;
      const pendingCalls = functionCalls.filter(
        (call) => this.#trackExecutedCall(call.call_id ?? call.id)
      );
      if (pendingCalls.length === 0 && executedCount === 0 && !this.#toolExecutedDuringResponse && this.sessionConfig.outputMode === "tool-only") {
        this.#handleToolOnlyNoAction(responseId);
        return;
      }
      for (const call of pendingCalls) {
        await this.#executeToolCall(call, responseId);
      }
      this.#incrementResponseToolCount(responseId, pendingCalls.length);
      if (this.#options.postToolResponse && !this.#currentResponseIsPostTool && (pendingCalls.length > 0 || executedCount > 0)) {
        this.#requestPostToolResponse();
      } else if (this.#runningToolCallCount === 0 && this.activity !== "error") {
        this.#setActivity(this.#restingActivity());
      }
      if (responseId) {
        this.#responseToolCounts.delete(responseId);
      }
      this.#toolExecutedDuringResponse = false;
    });
  }
  #handleOutputItemDone(event) {
    const item = event.item;
    if (!isFunctionCallItem(item)) {
      return;
    }
    this.#queueSessionTask(async () => {
      if (!this.#trackExecutedCall(item.call_id ?? item.id)) {
        return;
      }
      const responseId = extractResponseId(event);
      this.#incrementResponseToolCount(responseId);
      await this.#executeToolCall(item, responseId);
    });
  }
  #handleServerEvent = (event) => {
    this.#emitEvent(event);
    if (event.type === "response.created") {
      this.#currentResponseIsPostTool = this.#pendingPostToolResponse;
      this.#pendingPostToolResponse = false;
      this.#responseInFlight = true;
      this.#toolExecutedDuringResponse = false;
      this.#setCapturing(false);
      this.#setTranscript("");
      this.#setActivity("processing");
    }
    const textDelta = extractTextDelta(event);
    if (textDelta) {
      this.#setTranscript(`${this.transcript}${textDelta}`);
    }
    const completedText = extractCompletedText(event);
    if (completedText) {
      this.#setTranscript(completedText);
    }
    if (event.type === "error") {
      const error = event.error;
      this.#emitError(error?.message ?? "Realtime server error.");
      return;
    }
    if (event.type === "response.output_item.done") {
      this.#handleOutputItemDone(event);
      return;
    }
    if (event.type === "response.done") {
      const response = event.response;
      const items = Array.isArray(response?.output) ? response.output : [];
      this.#handleResponseDone(event, items.filter(isFunctionCallItem));
    }
  };
};
function createVoiceControlController(options) {
  return new VoiceControlControllerImpl(options);
}

// src/useVoiceControl.ts
function createBinding(input) {
  if (isVoiceControlController(input)) {
    return {
      controller: input,
      owned: false
    };
  }
  return {
    controller: createVoiceControlController(input),
    owned: true
  };
}
function useVoiceControl(input) {
  const bindingRef = (0, import_react.useRef)(null);
  if (bindingRef.current === null) {
    bindingRef.current = createBinding(input);
  } else if (isVoiceControlController(input)) {
    if (bindingRef.current.owned) {
      bindingRef.current.controller.destroy();
    }
    if (bindingRef.current.controller !== input || bindingRef.current.owned) {
      bindingRef.current = {
        controller: input,
        owned: false
      };
    }
  } else if (!bindingRef.current.owned) {
    bindingRef.current = {
      controller: createVoiceControlController(input),
      owned: true
    };
  }
  const { controller, owned } = bindingRef.current;
  (0, import_react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const latestInputRef = (0, import_react.useRef)(input);
  latestInputRef.current = input;
  (0, import_react.useEffect)(() => {
    const latestInput = latestInputRef.current;
    if (owned && !isVoiceControlController(latestInput) && bindingRef.current?.owned) {
      bindingRef.current.controller.configure(latestInput);
    }
  }, [input, owned]);
  (0, import_react.useEffect)(
    () => () => {
      if (owned) {
        controller.destroy();
      }
    },
    [controller, owned]
  );
  return controller;
}

// src/useGhostCursor.ts
var import_react2 = require("react");
var GHOST_CURSOR_TARGET_ACTIVE_CLASS_NAME = "vc-ghost-cursor-target-active";
var DEFAULT_VIEWPORT_PADDING = 72;
var MIN_TRAVEL_MS = 320;
var MAX_TRAVEL_MS = 560;
var ARRIVAL_PULSE_MS = 180;
var DEFAULT_IDLE_HIDE_MS = 5e3;
var DEFAULT_SCROLL_SETTLE_MS = 220;
var STEP_HOLD_MS = 260;
var FAST_BATCH_MIN_TRAVEL_MS = 130;
var FAST_BATCH_MAX_TRAVEL_MS = 220;
var FAST_BATCH_PULSE_MS = 80;
var FAST_BATCH_FINAL_HOLD_MS = 200;
function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
function waitForNextAnimationFrame() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      resolve();
    });
  });
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function createPoint(x, y) {
  return { x, y };
}
function normalizeMotionOptions(options) {
  return {
    easing: options?.easing ?? "smooth",
    from: options?.from ?? "pointer"
  };
}
function getViewportFallbackPoint() {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 };
  }
  return {
    x: Math.max(window.innerWidth - 84, 0),
    y: Math.max(window.innerHeight - 84, 0)
  };
}
function getElementPoint(element) {
  const rect = element.getBoundingClientRect();
  const isTextEntry = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
  if (isTextEntry) {
    return {
      x: rect.left + Math.min(28, rect.width * 0.18),
      y: rect.top + rect.height / 2
    };
  }
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}
function resolveTargetStop(target) {
  const element = target.element ?? null;
  const point = target.point ?? (element ? getElementPoint(element) : null);
  if (!point) {
    return null;
  }
  return {
    element,
    pulseElement: target.pulseElement ?? element,
    point
  };
}
function isOutsidePaddedViewport(element, viewportPadding) {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  return rect.top < viewportPadding || rect.left < viewportPadding || rect.bottom > viewportHeight - viewportPadding || rect.right > viewportWidth - viewportPadding;
}
function getTravelDuration(from, to) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return clamp(MIN_TRAVEL_MS + distance * 0.18, MIN_TRAVEL_MS, MAX_TRAVEL_MS);
}
function getFastBatchTravelDuration(from, to) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return clamp(
    FAST_BATCH_MIN_TRAVEL_MS + distance * 0.12,
    FAST_BATCH_MIN_TRAVEL_MS,
    FAST_BATCH_MAX_TRAVEL_MS
  );
}
function getBatchScrollTarget(elements) {
  if (elements.length === 0) {
    return null;
  }
  const centers = elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      element,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
  const centroid = centers.reduce(
    (point, center) => ({
      x: point.x + center.x / centers.length,
      y: point.y + center.y / centers.length
    }),
    { x: 0, y: 0 }
  );
  return centers.reduce((closest, candidate) => {
    if (!closest) {
      return candidate;
    }
    const closestDistance = Math.hypot(closest.x - centroid.x, closest.y - centroid.y);
    const candidateDistance = Math.hypot(candidate.x - centroid.x, candidate.y - centroid.y);
    return candidateDistance < closestDistance ? candidate : closest;
  }, centers[0]).element;
}
function useGhostCursor({
  idleHideMs = DEFAULT_IDLE_HIDE_MS,
  scrollSettleMs = DEFAULT_SCROLL_SETTLE_MS,
  viewportPadding = DEFAULT_VIEWPORT_PADDING
} = {}) {
  const [cursorState, setCursorState] = (0, import_react2.useState)(() => ({
    main: {
      id: "main",
      role: "main",
      phase: "hidden",
      position: getViewportFallbackPoint(),
      durationMs: 0,
      easing: "smooth"
    },
    satellites: []
  }));
  const trackedPointerRef = (0, import_react2.useRef)(null);
  const scriptedPointerRef = (0, import_react2.useRef)(null);
  const queueRef = (0, import_react2.useRef)(Promise.resolve());
  const activeTargetsRef = (0, import_react2.useRef)([]);
  const hideTimerRef = (0, import_react2.useRef)(null);
  const reducedMotionRef = (0, import_react2.useRef)(false);
  const clearHideTimer = (0, import_react2.useCallback)(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);
  const clearActiveTargets = (0, import_react2.useCallback)(() => {
    if (activeTargetsRef.current.length === 0) {
      return;
    }
    for (const element of activeTargetsRef.current) {
      element.classList.remove(GHOST_CURSOR_TARGET_ACTIVE_CLASS_NAME);
    }
    activeTargetsRef.current = [];
  }, []);
  const hideAllCursors = (0, import_react2.useCallback)(() => {
    setCursorState((current) => ({
      main: {
        ...current.main,
        phase: "hidden",
        durationMs: ARRIVAL_PULSE_MS
      },
      satellites: []
    }));
  }, []);
  const scheduleHide = (0, import_react2.useCallback)(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideAllCursors();
    }, idleHideMs);
  }, [clearHideTimer, hideAllCursors, idleHideMs]);
  const dismissCursors = (0, import_react2.useCallback)(() => {
    clearHideTimer();
    clearActiveTargets();
    hideAllCursors();
  }, [clearActiveTargets, clearHideTimer, hideAllCursors]);
  const pulseTargets = (0, import_react2.useCallback)(
    async (elements, durationMs = ARRIVAL_PULSE_MS) => {
      clearActiveTargets();
      const uniqueTargets = [
        ...new Set(elements.filter((element) => !!element))
      ];
      if (uniqueTargets.length === 0) {
        return;
      }
      activeTargetsRef.current = uniqueTargets;
      for (const element of uniqueTargets) {
        element.classList.add(GHOST_CURSOR_TARGET_ACTIVE_CLASS_NAME);
      }
      await wait(durationMs);
      for (const element of uniqueTargets) {
        element.classList.remove(GHOST_CURSOR_TARGET_ACTIVE_CLASS_NAME);
      }
      if (activeTargetsRef.current === uniqueTargets) {
        activeTargetsRef.current = [];
      }
    },
    [clearActiveTargets]
  );
  const resolveOrigin = (0, import_react2.useCallback)((from = "pointer") => {
    if (typeof from === "object") {
      return from;
    }
    if (from === "previous" && scriptedPointerRef.current) {
      return scriptedPointerRef.current;
    }
    if (trackedPointerRef.current) {
      return trackedPointerRef.current;
    }
    return getViewportFallbackPoint();
  }, []);
  const updateMainCursor = (0, import_react2.useCallback)(
    (phase, position, durationMs, easing = "smooth") => {
      scriptedPointerRef.current = position;
      setCursorState((current) => ({
        main: {
          ...current.main,
          easing,
          phase,
          position,
          durationMs
        },
        satellites: []
      }));
    },
    []
  );
  const animateMainCursorTravel = (0, import_react2.useCallback)(
    async (origin, target, durationMs, easing) => {
      updateMainCursor("traveling", origin, 0, easing);
      if (durationMs <= 0) {
        updateMainCursor("traveling", target, 0, easing);
        return;
      }
      await waitForNextAnimationFrame();
      updateMainCursor("traveling", target, durationMs, easing);
      await wait(durationMs);
    },
    [updateMainCursor]
  );
  (0, import_react2.useEffect)(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => {
      reducedMotionRef.current = mediaQuery.matches;
    };
    const handlePointerMove = (event) => {
      trackedPointerRef.current = createPoint(event.clientX, event.clientY);
    };
    const handleWindowBlur = () => {
      trackedPointerRef.current = null;
    };
    syncReducedMotion();
    mediaQuery.addEventListener("change", syncReducedMotion);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      mediaQuery.removeEventListener("change", syncReducedMotion);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);
  (0, import_react2.useEffect)(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    const passiveListener = { passive: true };
    const captureListener = { capture: true, passive: true };
    window.addEventListener("wheel", dismissCursors, passiveListener);
    window.addEventListener("touchmove", dismissCursors, passiveListener);
    window.addEventListener("scroll", dismissCursors, passiveListener);
    document.addEventListener("scroll", dismissCursors, captureListener);
    return () => {
      window.removeEventListener("wheel", dismissCursors, passiveListener);
      window.removeEventListener("touchmove", dismissCursors, passiveListener);
      window.removeEventListener("scroll", dismissCursors, passiveListener);
      document.removeEventListener("scroll", dismissCursors, captureListener);
    };
  }, [dismissCursors]);
  (0, import_react2.useEffect)(
    () => () => {
      clearHideTimer();
      clearActiveTargets();
    },
    [clearActiveTargets, clearHideTimer]
  );
  const runSingle = (0, import_react2.useCallback)(
    async (target, operation, options) => {
      clearHideTimer();
      clearActiveTargets();
      const motion = normalizeMotionOptions(options);
      const stop = resolveTargetStop(target);
      if (!stop) {
        return operation();
      }
      const targetElement = stop.element;
      const pulseElement = stop.pulseElement;
      const targetPoint = stop.point;
      if (reducedMotionRef.current) {
        try {
          const result = await operation();
          updateMainCursor("arrived", targetPoint, ARRIVAL_PULSE_MS);
          await pulseTargets([pulseElement]);
          await wait(STEP_HOLD_MS);
          scheduleHide();
          return result;
        } catch (error) {
          updateMainCursor("error", targetPoint, ARRIVAL_PULSE_MS);
          scheduleHide();
          await wait(ARRIVAL_PULSE_MS);
          throw error;
        }
      }
      if (targetElement && isOutsidePaddedViewport(targetElement, viewportPadding)) {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center"
        });
        await wait(scrollSettleMs);
      }
      const resolvedStop = resolveTargetStop(target) ?? stop;
      const origin = resolveOrigin(motion.from);
      const durationMs = getTravelDuration(origin, resolvedStop.point);
      await animateMainCursorTravel(origin, resolvedStop.point, durationMs, motion.easing);
      try {
        const result = await operation();
        updateMainCursor("arrived", resolvedStop.point, ARRIVAL_PULSE_MS);
        await pulseTargets([resolvedStop.pulseElement]);
        await wait(STEP_HOLD_MS);
        scheduleHide();
        return result;
      } catch (error) {
        updateMainCursor("error", resolvedStop.point, ARRIVAL_PULSE_MS);
        scheduleHide();
        await wait(ARRIVAL_PULSE_MS);
        throw error;
      }
    },
    [
      animateMainCursorTravel,
      clearActiveTargets,
      clearHideTimer,
      pulseTargets,
      resolveOrigin,
      scheduleHide,
      scrollSettleMs,
      updateMainCursor,
      viewportPadding
    ]
  );
  const runEachInternal = (0, import_react2.useCallback)(
    async (items, resolveTarget, operation, options) => {
      clearHideTimer();
      clearActiveTargets();
      const motion = normalizeMotionOptions(options);
      let resolvedTargets = items.map(
        (item, index) => resolveTargetStop(resolveTarget(item, index) ?? {})
      );
      const resolvedElements = resolvedTargets.flatMap(
        (target) => target?.element ? [target.element] : []
      );
      if (!reducedMotionRef.current && resolvedElements.some((element) => isOutsidePaddedViewport(element, viewportPadding))) {
        getBatchScrollTarget(resolvedElements)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center"
        });
        await wait(scrollSettleMs);
        resolvedTargets = items.map(
          (item, index) => resolveTargetStop(resolveTarget(item, index) ?? {})
        );
      }
      const results = [];
      let currentPoint = resolveOrigin(motion.from);
      let hasResolvedTarget = false;
      for (const [index, item] of items.entries()) {
        const target = resolvedTargets[index];
        if (!target) {
          results.push(await operation(item, index));
          continue;
        }
        hasResolvedTarget = true;
        if (reducedMotionRef.current) {
          updateMainCursor("arrived", target.point, FAST_BATCH_PULSE_MS);
        } else {
          const durationMs = getFastBatchTravelDuration(currentPoint, target.point);
          await animateMainCursorTravel(currentPoint, target.point, durationMs, motion.easing);
          updateMainCursor("arrived", target.point, FAST_BATCH_PULSE_MS);
        }
        currentPoint = target.point;
        try {
          results.push(await operation(item, index));
        } catch (error) {
          updateMainCursor("error", target.point, ARRIVAL_PULSE_MS);
          await wait(ARRIVAL_PULSE_MS);
          throw error;
        }
        await pulseTargets([target.pulseElement], FAST_BATCH_PULSE_MS);
      }
      if (!hasResolvedTarget) {
        hideAllCursors();
        return results;
      }
      await wait(FAST_BATCH_FINAL_HOLD_MS);
      hideAllCursors();
      return results;
    },
    [
      animateMainCursorTravel,
      clearActiveTargets,
      clearHideTimer,
      hideAllCursors,
      pulseTargets,
      resolveOrigin,
      scrollSettleMs,
      updateMainCursor,
      viewportPadding
    ]
  );
  const enqueueRun = (0, import_react2.useCallback)((run2) => {
    const queuedRun = queueRef.current.then(run2, run2);
    queueRef.current = queuedRun.then(
      () => void 0,
      () => void 0
    );
    return queuedRun;
  }, []);
  const run = (0, import_react2.useCallback)(
    async (target, operation, options) => enqueueRun(() => runSingle(target, operation, options)),
    [enqueueRun, runSingle]
  );
  const runEach = (0, import_react2.useCallback)(
    async (items, resolveTarget, operation, options) => enqueueRun(() => runEachInternal(items, resolveTarget, operation, options)),
    [enqueueRun, runEachInternal]
  );
  const hide = (0, import_react2.useCallback)(() => {
    dismissCursors();
  }, [dismissCursors]);
  return {
    cursorState,
    hide,
    run,
    runEach
  };
}

// src/components/VoiceControlWidget.tsx
var import_react4 = require("react");
var import_react_dom = require("react-dom");

// src/internal/storage.ts
function readVersionedLocalStorageValue({
  currentKey,
  fallback,
  legacyKeys = [],
  parse
}) {
  if (typeof window === "undefined") {
    return fallback;
  }
  for (const key of [currentKey, ...legacyKeys]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const parsed = parse(raw);
      if (parsed !== null) {
        return parsed;
      }
    } catch {
    }
  }
  return fallback;
}
function writeLocalStorageValue(key, value) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
  }
}
function removeLocalStorageValues(keys) {
  if (typeof window === "undefined") {
    return;
  }
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
    }
  }
}

// src/internal/useCornerSnap.ts
var import_react3 = require("react");

// src/internal/cornerSnap.ts
var MS_PER_ANIMATION_STEP = 4;
var MAX_ANIMATION_STEPS_PER_FRAME = 300;
var DECAY_FRICTION = 4.5;
var DEFAULT_SPRING_STIFFNESS = 290;
var DEFAULT_SPRING_DAMPING = 24;
function getViewportSize() {
  return {
    width: document.documentElement.clientWidth || window.innerWidth || 0,
    height: document.documentElement.clientHeight || window.innerHeight || 0
  };
}
function getCornerPositions(viewport, widgetSize, inset) {
  const rightX = Math.max(inset, viewport.width - widgetSize.width - inset);
  const bottomY = Math.max(inset, viewport.height - widgetSize.height - inset);
  return {
    "top-left": { x: inset, y: inset },
    "top-right": { x: rightX, y: inset },
    "bottom-left": { x: inset, y: bottomY },
    "bottom-right": { x: rightX, y: bottomY }
  };
}
function clampPositionToViewport(point, viewport, widgetSize, inset) {
  const minX = inset;
  const minY = inset;
  const maxX = Math.max(inset, viewport.width - widgetSize.width - inset);
  const maxY = Math.max(inset, viewport.height - widgetSize.height - inset);
  return {
    x: Math.min(Math.max(point.x, minX), maxX),
    y: Math.min(Math.max(point.y, minY), maxY)
  };
}
function nearestCorner(point, corners, widgetSize = { width: 0, height: 0 }) {
  let bestCorner = "top-left";
  let bestDistance = Number.POSITIVE_INFINITY;
  const pointCenter = {
    x: point.x + widgetSize.width / 2,
    y: point.y + widgetSize.height / 2
  };
  for (const corner of Object.keys(corners)) {
    const candidate = corners[corner];
    const candidateCenter = {
      x: candidate.x + widgetSize.width / 2,
      y: candidate.y + widgetSize.height / 2
    };
    const distance = (candidateCenter.x - pointCenter.x) ** 2 + (candidateCenter.y - pointCenter.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCorner = corner;
    }
  }
  return bestCorner;
}
function decayRestPos(pos, velocity) {
  return pos + velocity / DECAY_FRICTION;
}
function spring(pos, v = 0, k = DEFAULT_SPRING_STIFFNESS, b = DEFAULT_SPRING_DAMPING) {
  return { pos, dest: pos, v, k, b };
}
function springStep(config) {
  const t = MS_PER_ANIMATION_STEP / 1e3;
  const springForce = -config.k * (config.pos - config.dest);
  const damperForce = -config.b * config.v;
  const acceleration = springForce + damperForce;
  const nextVelocity = config.v + acceleration * t;
  const nextPosition = config.pos + nextVelocity * t;
  config.pos = nextPosition;
  config.v = nextVelocity;
}
function springGoToEnd(config) {
  config.pos = config.dest;
  config.v = 0;
}
function springMostlyDone(config) {
  return Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01;
}
function createCornerSnapAnimation(from, velocity, target) {
  const restPos = {
    x: decayRestPos(from.x, velocity.x),
    y: decayRestPos(from.y, velocity.y)
  };
  const spring1x = spring(from.x, velocity.x);
  spring1x.dest = restPos.x;
  const spring1y = spring(from.y, velocity.y);
  spring1y.dest = restPos.y;
  const spring2x = spring(restPos.x);
  spring2x.dest = target.x;
  const spring2y = spring(restPos.y);
  spring2y.dest = target.y;
  return {
    animatedUntilTime: null,
    restPos,
    spring1x,
    spring1y,
    spring2x,
    spring2y
  };
}
function getCornerSnapPosition(animation) {
  return {
    x: animation.spring1x.pos + (animation.spring2x.pos - animation.restPos.x),
    y: animation.spring1y.pos + (animation.spring2y.pos - animation.restPos.y)
  };
}
function stepCornerSnapAnimation(animation, now) {
  let animatedUntilTime = animation.animatedUntilTime !== null ? animation.animatedUntilTime : now;
  const steps = Math.min(
    MAX_ANIMATION_STEPS_PER_FRAME,
    Math.floor((now - animatedUntilTime) / MS_PER_ANIMATION_STEP)
  );
  animatedUntilTime += steps * MS_PER_ANIMATION_STEP;
  let animating = false;
  const springs = [animation.spring1x, animation.spring1y, animation.spring2x, animation.spring2y];
  for (const config of springs) {
    for (let index = 0; index < steps; index += 1) {
      springStep(config);
    }
    if (springMostlyDone(config)) {
      springGoToEnd(config);
    } else {
      animating = true;
    }
  }
  animation.animatedUntilTime = animating ? animatedUntilTime : null;
  return {
    animating,
    position: getCornerSnapPosition(animation)
  };
}

// src/internal/useCornerSnap.ts
var STORAGE_VERSION = "v1";
var STORAGE_PREFIX = `voice-control-corner:${STORAGE_VERSION}:`;
var LEGACY_STORAGE_PREFIX = "voice-control-corner:";
var DRAG_THRESHOLD_PX = 6;
var MAX_POINTER_SAMPLES = 20;
var VELOCITY_LOOKBACK_MS = 100;
var useIsomorphicLayoutEffect = typeof window === "undefined" ? import_react3.useEffect : import_react3.useLayoutEffect;
function getStorageKey(widgetId) {
  return `${STORAGE_PREFIX}${widgetId}`;
}
function getLegacyStorageKey(widgetId) {
  return `${LEGACY_STORAGE_PREFIX}${widgetId}`;
}
function readStoredCorner(widgetId, fallbackCorner) {
  return readVersionedLocalStorageValue({
    currentKey: getStorageKey(widgetId),
    fallback: fallbackCorner,
    legacyKeys: [getLegacyStorageKey(widgetId)],
    parse: (raw) => {
      const parsed = JSON.parse(raw);
      if (parsed.corner === "top-left" || parsed.corner === "top-right" || parsed.corner === "bottom-left" || parsed.corner === "bottom-right") {
        return parsed.corner;
      }
      return null;
    }
  });
}
function writeStoredCorner(widgetId, corner) {
  writeLocalStorageValue(getStorageKey(widgetId), JSON.stringify({ corner }));
}
function clearStoredCorner(widgetId) {
  removeLocalStorageValues([getStorageKey(widgetId), getLegacyStorageKey(widgetId)]);
}
function readMeasuredRect(node) {
  if (!node) {
    return null;
  }
  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return rect;
}
function readWidgetSize(node, fallbackSize) {
  const rect = readMeasuredRect(node);
  if (!rect) {
    return fallbackSize;
  }
  return {
    width: rect.width,
    height: rect.height
  };
}
function readWidgetPosition(node, fallbackPosition) {
  const rect = readMeasuredRect(node);
  if (!rect) {
    return fallbackPosition;
  }
  return {
    x: rect.left,
    y: rect.top
  };
}
function isDragBlocked(target, currentTarget) {
  const element = target;
  const interactiveAncestor = element?.closest?.(
    "button,[role='button'],input,select,textarea,[contenteditable='true'],[data-vc-no-drag]"
  );
  return interactiveAncestor !== null && interactiveAncestor !== currentTarget;
}
function estimateVelocity(samples, now) {
  if (samples.length < 2) {
    return { x: 0, y: 0 };
  }
  let index = samples.length - 1;
  while (index > 0) {
    const previous = samples[index - 1];
    if (!previous || now - previous.time > VELOCITY_LOOKBACK_MS) {
      break;
    }
    index -= 1;
  }
  const first = samples[index];
  const last = samples[samples.length - 1];
  if (!first || !last) {
    return { x: 0, y: 0 };
  }
  const dt = now - first.time;
  if (dt <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: (last.x - first.x) / dt * 1e3,
    y: (last.y - first.y) / dt * 1e3
  };
}
function useCornerSnap({
  defaultCorner,
  draggable,
  enabled,
  fallbackSize,
  inset,
  measurementKey,
  persistPosition,
  widgetId
}) {
  const [rootNode, setRootNode] = (0, import_react3.useState)(null);
  const [corner, setCorner] = (0, import_react3.useState)(
    () => enabled && persistPosition ? readStoredCorner(widgetId, defaultCorner) : defaultCorner
  );
  const [position, setPosition] = (0, import_react3.useState)(() => {
    const initialCorner = enabled && persistPosition ? readStoredCorner(widgetId, defaultCorner) : defaultCorner;
    const corners = getCornerPositions(getViewportSize(), fallbackSize, inset);
    return corners[initialCorner];
  });
  const [dragging, setDragging] = (0, import_react3.useState)(false);
  const [animating, setAnimating] = (0, import_react3.useState)(false);
  const sizeRef = (0, import_react3.useRef)(fallbackSize);
  const cornerRef = (0, import_react3.useRef)(corner);
  const positionRef = (0, import_react3.useRef)(position);
  const dragSessionRef = (0, import_react3.useRef)(null);
  const pointerHistoryRef = (0, import_react3.useRef)([]);
  const animationFrameRef = (0, import_react3.useRef)(null);
  const animationRef = (0, import_react3.useRef)(null);
  const lastWidgetIdRef = (0, import_react3.useRef)(widgetId);
  const suppressLauncherClickRef = (0, import_react3.useRef)(false);
  const rootRef = (0, import_react3.useCallback)((node) => {
    sizeRef.current = readWidgetSize(node, sizeRef.current);
    setRootNode(node);
  }, []);
  const getWidgetSize = (0, import_react3.useCallback)(() => {
    sizeRef.current = readWidgetSize(rootNode, sizeRef.current);
    return sizeRef.current;
  }, [rootNode]);
  const getWidgetPosition = (0, import_react3.useCallback)(() => {
    positionRef.current = readWidgetPosition(rootNode, positionRef.current);
    return positionRef.current;
  }, [rootNode]);
  const setCornerState = (0, import_react3.useCallback)((nextCorner) => {
    cornerRef.current = nextCorner;
    setCorner(nextCorner);
  }, []);
  const setPositionState = (0, import_react3.useCallback)((nextPosition) => {
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }, []);
  const setClampedPositionState = (0, import_react3.useCallback)(
    (nextPosition) => {
      const clampedPosition = clampPositionToViewport(
        nextPosition,
        getViewportSize(),
        getWidgetSize(),
        inset
      );
      positionRef.current = clampedPosition;
      setPosition(clampedPosition);
    },
    [getWidgetSize, inset]
  );
  const snapToCorner = (0, import_react3.useCallback)(
    (nextCorner) => {
      const corners = getCornerPositions(getViewportSize(), getWidgetSize(), inset);
      setCornerState(nextCorner);
      setClampedPositionState(corners[nextCorner]);
    },
    [getWidgetSize, inset, setClampedPositionState, setCornerState]
  );
  const cancelAnimation = (0, import_react3.useCallback)(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    animationRef.current = null;
    setAnimating(false);
  }, []);
  const stepAnimation = (0, import_react3.useCallback)(
    (now) => {
      const currentAnimation = animationRef.current;
      if (!currentAnimation) {
        animationFrameRef.current = null;
        setAnimating(false);
        return;
      }
      const result = stepCornerSnapAnimation(currentAnimation, now);
      setClampedPositionState(result.position);
      if (result.animating) {
        animationFrameRef.current = requestAnimationFrame(stepAnimation);
        return;
      }
      animationRef.current = null;
      animationFrameRef.current = null;
      setAnimating(false);
    },
    [setClampedPositionState]
  );
  const ensureAnimationLoop = (0, import_react3.useCallback)(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(stepAnimation);
  }, [stepAnimation]);
  const startAnimationToCorner = (0, import_react3.useCallback)(
    (from, velocity, nextCorner) => {
      const corners = getCornerPositions(getViewportSize(), getWidgetSize(), inset);
      setCornerState(nextCorner);
      if (persistPosition) {
        writeStoredCorner(widgetId, nextCorner);
      }
      animationRef.current = createCornerSnapAnimation(from, velocity, corners[nextCorner]);
      setAnimating(true);
    },
    [getWidgetSize, inset, persistPosition, setCornerState, widgetId]
  );
  const animateToNearestCorner = (0, import_react3.useCallback)(
    (from, velocity) => {
      const widgetSize = getWidgetSize();
      const corners = getCornerPositions(getViewportSize(), widgetSize, inset);
      const restPoint = {
        x: decayRestPos(from.x, velocity.x),
        y: decayRestPos(from.y, velocity.y)
      };
      const nextCorner = nearestCorner(restPoint, corners, widgetSize);
      startAnimationToCorner(from, velocity, nextCorner);
    },
    [getWidgetSize, inset, startAnimationToCorner]
  );
  const measureAndResnap = (0, import_react3.useCallback)(() => {
    if (!enabled || !rootNode) {
      return;
    }
    const measuredSize = getWidgetSize();
    if (measuredSize.width <= 0 || measuredSize.height <= 0) {
      return;
    }
    if (dragSessionRef.current) {
      return;
    }
    cancelAnimation();
    snapToCorner(cornerRef.current);
  }, [cancelAnimation, enabled, getWidgetSize, rootNode, snapToCorner]);
  (0, import_react3.useEffect)(() => {
    if (!enabled) {
      cancelAnimation();
      setDragging(false);
      dragSessionRef.current = null;
      return;
    }
    if (!persistPosition) {
      clearStoredCorner(widgetId);
      snapToCorner(defaultCorner);
      return;
    }
    const storedCorner = readStoredCorner(widgetId, defaultCorner);
    setCornerState(storedCorner);
    snapToCorner(storedCorner);
  }, [
    cancelAnimation,
    defaultCorner,
    enabled,
    persistPosition,
    setCornerState,
    snapToCorner,
    widgetId
  ]);
  (0, import_react3.useEffect)(() => {
    if (!enabled) {
      return;
    }
    if (lastWidgetIdRef.current === widgetId) {
      return;
    }
    lastWidgetIdRef.current = widgetId;
    const storedCorner = persistPosition ? readStoredCorner(widgetId, defaultCorner) : defaultCorner;
    setCornerState(storedCorner);
    cancelAnimation();
    setDragging(false);
    dragSessionRef.current = null;
    snapToCorner(storedCorner);
  }, [
    cancelAnimation,
    defaultCorner,
    enabled,
    persistPosition,
    setCornerState,
    snapToCorner,
    widgetId
  ]);
  useIsomorphicLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    measureAndResnap();
  }, [enabled, measureAndResnap, measurementKey]);
  (0, import_react3.useEffect)(() => {
    if (!enabled || !rootNode) {
      return;
    }
    if (typeof ResizeObserver !== "function") {
      window.addEventListener("resize", measureAndResnap);
      return () => {
        window.removeEventListener("resize", measureAndResnap);
      };
    }
    const resizeObserver = new ResizeObserver(() => {
      measureAndResnap();
    });
    resizeObserver.observe(rootNode);
    window.addEventListener("resize", measureAndResnap);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measureAndResnap);
    };
  }, [enabled, measureAndResnap, rootNode]);
  (0, import_react3.useEffect)(() => {
    return () => {
      cancelAnimation();
    };
  }, [cancelAnimation]);
  const updateDragPosition = (0, import_react3.useCallback)(
    (pointerId, clientX, clientY) => {
      const dragSession = dragSessionRef.current;
      if (!dragSession || dragSession.pointerId !== pointerId) {
        return;
      }
      const now = performance.now();
      pointerHistoryRef.current.push({
        x: clientX,
        y: clientY,
        time: now
      });
      if (pointerHistoryRef.current.length > MAX_POINTER_SAMPLES) {
        pointerHistoryRef.current.shift();
      }
      if (!dragSession.dragActivated && dragSession.handleKind === "launcher") {
        const distance = Math.hypot(
          clientX - dragSession.startPointer.x,
          clientY - dragSession.startPointer.y
        );
        if (distance < DRAG_THRESHOLD_PX) {
          return;
        }
      }
      dragSession.dragActivated = true;
      setDragging(true);
      setClampedPositionState({
        x: clientX - dragSession.offset.x,
        y: clientY - dragSession.offset.y
      });
    },
    [setClampedPositionState]
  );
  const finishDrag = (0, import_react3.useCallback)(
    (pointerId, reason, clientX, clientY) => {
      const dragSession = dragSessionRef.current;
      if (!dragSession || dragSession.pointerId !== pointerId) {
        return;
      }
      if (typeof clientX === "number" && typeof clientY === "number") {
        pointerHistoryRef.current.push({
          x: clientX,
          y: clientY,
          time: performance.now()
        });
        if (pointerHistoryRef.current.length > MAX_POINTER_SAMPLES) {
          pointerHistoryRef.current.shift();
        }
      }
      dragSessionRef.current = null;
      if (dragSession.handleElement.hasPointerCapture?.(pointerId)) {
        dragSession.handleElement.releasePointerCapture(pointerId);
      }
      const didDrag = dragSession.dragActivated;
      setDragging(false);
      if (!didDrag) {
        return;
      }
      if (dragSession.handleKind === "launcher") {
        suppressLauncherClickRef.current = true;
      }
      const velocity = reason === "up" ? estimateVelocity(pointerHistoryRef.current, performance.now()) : { x: 0, y: 0 };
      animateToNearestCorner(positionRef.current, velocity);
      ensureAnimationLoop();
    },
    [animateToNearestCorner, ensureAnimationLoop]
  );
  const startDrag = (0, import_react3.useCallback)(
    (event, handleKind) => {
      if (!enabled || !draggable) {
        return;
      }
      if (isDragBlocked(event.target, event.currentTarget)) {
        return;
      }
      cancelAnimation();
      const widgetPosition = getWidgetPosition();
      setPositionState(widgetPosition);
      getWidgetSize();
      dragSessionRef.current = {
        handleElement: event.currentTarget,
        dragActivated: false,
        handleKind,
        offset: {
          x: event.clientX - widgetPosition.x,
          y: event.clientY - widgetPosition.y
        },
        pointerId: event.pointerId,
        startPointer: {
          x: event.clientX,
          y: event.clientY
        }
      };
      pointerHistoryRef.current = [
        {
          x: event.clientX,
          y: event.clientY,
          time: performance.now()
        }
      ];
      suppressLauncherClickRef.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [cancelAnimation, draggable, enabled, getWidgetPosition, getWidgetSize, setPositionState]
  );
  (0, import_react3.useEffect)(() => {
    if (!enabled) {
      return;
    }
    const handlePointerMove = (event) => {
      updateDragPosition(event.pointerId, event.clientX, event.clientY);
    };
    const handlePointerUp = (event) => {
      finishDrag(event.pointerId, "up", event.clientX, event.clientY);
    };
    const handlePointerCancel = (event) => {
      finishDrag(event.pointerId, "cancel", event.clientX, event.clientY);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [enabled, finishDrag, updateDragPosition]);
  const consumeLauncherClickSuppression = (0, import_react3.useCallback)(() => {
    const shouldSuppress = suppressLauncherClickRef.current;
    suppressLauncherClickRef.current = false;
    return shouldSuppress;
  }, []);
  const getHandleProps = (0, import_react3.useCallback)(
    (handleKind) => ({
      onPointerDown: (event) => {
        startDrag(event, handleKind);
      }
    }),
    [startDrag]
  );
  return {
    animating,
    corner,
    consumeLauncherClickSuppression,
    dragging,
    getHandleProps,
    position,
    rootRef
  };
}

// src/components/VoiceControlWidget.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var DEFAULT_MOBILE_BREAKPOINT = 640;
var DEFAULT_LAUNCHER_SIZE = { width: 74, height: 44 };
var DEFAULT_COMPACT_LAUNCHER_SIZE = { width: 44, height: 44 };
var DEFAULT_CORNER_SNAP_INSET = 16;
var DEFAULT_CORNER_SNAP_CORNER = "bottom-right";
var DEFAULT_LAUNCHER_ERROR_TOAST_DURATION_MS = 4e3;
var POSITION_STORAGE_VERSION = "v1";
var POSITION_STORAGE_PREFIX = `voice-control-position:${POSITION_STORAGE_VERSION}:`;
var LEGACY_POSITION_STORAGE_PREFIX = "voice-control-position:";
var DRAG_THRESHOLD = 4;
var DEFAULT_WIDGET_LABELS = {
  launcher: "Voice",
  disconnected: "Disconnected"
};
var DEFAULT_WIDGET_PART_CLASS_NAMES = {
  root: "vc-root",
  launcher: "vc-launcher",
  "launcher-toast": "vc-launcher-toast",
  "launcher-action": "vc-launcher-action",
  "launcher-status": "vc-sr-only vc-launcher-status",
  "launcher-label": "vc-sr-only vc-launcher-label",
  "launcher-handle": "vc-launcher-handle",
  "launcher-separator": "vc-launcher-separator",
  "launcher-core": "vc-launcher-core",
  "launcher-indicator": "vc-launcher-indicator",
  "launcher-drag-glyph": "vc-launcher-drag-glyph"
};
var VISUALLY_HIDDEN_STYLE = {
  border: 0,
  clip: "rect(0, 0, 0, 0)",
  height: "1px",
  margin: "-1px",
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: "1px"
};
var useIsomorphicLayoutEffect2 = typeof window === "undefined" ? import_react4.useEffect : import_react4.useLayoutEffect;
function useViewportMatch(maxWidth) {
  const query = `(max-width: ${maxWidth}px)`;
  const subscribe = (0, import_react4.useCallback)(
    (onStoreChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {
        };
      }
      const mediaQuery = window.matchMedia(query);
      const legacyMediaQuery = mediaQuery;
      const handleChange = () => {
        onStoreChange();
      };
      if ("addEventListener" in mediaQuery) {
        mediaQuery.addEventListener("change", handleChange);
        return () => {
          mediaQuery.removeEventListener("change", handleChange);
        };
      }
      legacyMediaQuery.addListener?.(handleChange);
      return () => {
        legacyMediaQuery.removeListener?.(handleChange);
      };
    },
    [query]
  );
  const getSnapshot = (0, import_react4.useCallback)(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  }, [query]);
  return (0, import_react4.useSyncExternalStore)(subscribe, getSnapshot, () => false);
}
function positionStorageKey(widgetId) {
  return `${POSITION_STORAGE_PREFIX}${widgetId}`;
}
function legacyPositionStorageKey(widgetId) {
  return `${LEGACY_POSITION_STORAGE_PREFIX}${widgetId}`;
}
function readStoredPosition(widgetId) {
  return readVersionedLocalStorageValue({
    currentKey: positionStorageKey(widgetId),
    fallback: { x: 0, y: 0 },
    legacyKeys: [legacyPositionStorageKey(widgetId)],
    parse: (raw) => {
      const parsed = JSON.parse(raw);
      return {
        x: typeof parsed.x === "number" ? parsed.x : 0,
        y: typeof parsed.y === "number" ? parsed.y : 0
      };
    }
  });
}
function clearStoredPosition(widgetId) {
  removeLocalStorageValues([positionStorageKey(widgetId), legacyPositionStorageKey(widgetId)]);
}
function isDefaultPosition(position) {
  return position.x === 0 && position.y === 0;
}
function resolveSnapInset(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : DEFAULT_CORNER_SNAP_INSET;
}
function resolveSnapDefaultCorner(value) {
  if (value === "top-left" || value === "top-right" || value === "bottom-left" || value === "bottom-right") {
    return value;
  }
  return DEFAULT_CORNER_SNAP_CORNER;
}
function getAnchoredSnapStyle(corner, inset) {
  return {
    bottom: corner.startsWith("bottom") ? `${inset}px` : "auto",
    left: corner.endsWith("left") ? `${inset}px` : "auto",
    pointerEvents: "auto",
    position: "absolute",
    right: corner.endsWith("right") ? `${inset}px` : "auto",
    top: corner.startsWith("top") ? `${inset}px` : "auto",
    transform: "none"
  };
}
function getWidgetStatus(state, disconnectedLabel) {
  if (state.status === "connecting") {
    return "Connecting";
  }
  if (state.status === "error" || state.activity === "error") {
    return "Error";
  }
  if (!state.connected) {
    return disconnectedLabel;
  }
  if (state.status === "processing" || state.activity === "processing" || state.activity === "executing") {
    return "Working";
  }
  if (state.status === "listening" || state.activity === "listening") {
    return "Listening";
  }
  return "Ready";
}
function getLauncherVisualState(state) {
  if (state.status === "connecting" || state.activity === "connecting") {
    return "connecting";
  }
  if (state.status === "error" || state.activity === "error") {
    return "error";
  }
  if (state.status === "processing" || state.activity === "processing" || state.activity === "executing") {
    return "busy";
  }
  if (state.status === "listening" || state.activity === "listening") {
    return "listening";
  }
  return state.connected ? "live" : "idle";
}
function renderLauncherIndicatorIcon(visualState, unstyled) {
  switch (visualState) {
    case "busy":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "svg",
        {
          "aria-hidden": "true",
          className: cx(!unstyled && "vc-launcher-busy-icon"),
          viewBox: "0 0 16 16",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "path",
              {
                className: cx(
                  !unstyled && "vc-launcher-busy-line",
                  !unstyled && "vc-launcher-busy-line--1"
                ),
                d: "M2.25 5.5h11.5",
                fill: "none",
                stroke: "currentColor",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                strokeWidth: "1.6"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "path",
              {
                className: cx(
                  !unstyled && "vc-launcher-busy-line",
                  !unstyled && "vc-launcher-busy-line--2"
                ),
                d: "M4 8h8",
                fill: "none",
                stroke: "currentColor",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                strokeWidth: "1.6"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "path",
              {
                className: cx(
                  !unstyled && "vc-launcher-busy-line",
                  !unstyled && "vc-launcher-busy-line--3"
                ),
                d: "M5.75 10.5h4.5",
                fill: "none",
                stroke: "currentColor",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                strokeWidth: "1.6"
              }
            )
          ]
        }
      );
    case "connecting":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "svg",
        {
          "aria-hidden": "true",
          className: cx(!unstyled && "vc-launcher-connecting-icon"),
          viewBox: "0 0 16 16",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "circle",
              {
                className: cx(
                  !unstyled && "vc-launcher-connecting-dot",
                  !unstyled && "vc-launcher-connecting-dot--1"
                ),
                cx: "3",
                cy: "8",
                fill: "currentColor",
                r: "1.25"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "circle",
              {
                className: cx(
                  !unstyled && "vc-launcher-connecting-dot",
                  !unstyled && "vc-launcher-connecting-dot--2"
                ),
                cx: "8",
                cy: "8",
                fill: "currentColor",
                r: "1.25"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "circle",
              {
                className: cx(
                  !unstyled && "vc-launcher-connecting-dot",
                  !unstyled && "vc-launcher-connecting-dot--3"
                ),
                cx: "13",
                cy: "8",
                fill: "currentColor",
                r: "1.25"
              }
            )
          ]
        }
      );
    case "error":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { "aria-hidden": "true", viewBox: "0 0 16 16", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "8", cy: "11.75", fill: "currentColor", r: "1" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "path",
          {
            d: "M8 3.25v5.75",
            fill: "none",
            stroke: "currentColor",
            strokeLinecap: "round",
            strokeWidth: "1.8"
          }
        )
      ] });
    case "listening":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { "aria-hidden": "true", viewBox: "0 0 16 16", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "rect",
          {
            fill: "none",
            height: "6.5",
            rx: "2.75",
            stroke: "currentColor",
            strokeWidth: "1.5",
            width: "5.5",
            x: "5.25",
            y: "2.25"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "path",
          {
            d: "M3.75 7.75a4.25 4.25 0 0 0 8.5 0M8 12v1.75M5.5 13.75h5",
            fill: "none",
            stroke: "currentColor",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "1.5"
          }
        )
      ] });
    case "live":
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { "aria-hidden": "true", viewBox: "0 0 16 16", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "8", cy: "8", fill: "currentColor", r: "3.25" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "circle",
          {
            cx: "8",
            cy: "8",
            fill: "none",
            r: "5.25",
            stroke: "currentColor",
            strokeOpacity: "0.24",
            strokeWidth: "1.5"
          }
        )
      ] });
    default:
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { "aria-hidden": "true", viewBox: "0 0 16 16", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "path",
        {
          d: "M5 3.5l6.25 4.5L5 12.5z",
          fill: "currentColor",
          stroke: "currentColor",
          strokeLinejoin: "round",
          strokeWidth: "0.6"
        }
      ) });
  }
}
function renderLauncherHandleIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { "aria-hidden": "true", viewBox: "0 0 12 24", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "4", cy: "3.75", fill: "currentColor", r: "1.1" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "8", cy: "3.75", fill: "currentColor", r: "1.1" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "4", cy: "9.25", fill: "currentColor", r: "1.1" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "8", cy: "9.25", fill: "currentColor", r: "1.1" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "4", cy: "14.75", fill: "currentColor", r: "1.1" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "8", cy: "14.75", fill: "currentColor", r: "1.1" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "4", cy: "20.25", fill: "currentColor", r: "1.1" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "8", cy: "20.25", fill: "currentColor", r: "1.1" })
  ] });
}
function VoiceControlWidget({
  widgetId = "voice-control-widget",
  className,
  controller,
  controllerRef,
  draggable = true,
  persistPosition = true,
  snapToCorners = false,
  snapInset,
  snapDefaultCorner,
  partClassNames,
  labels,
  layout = "floating",
  mobileLayout,
  mobileBreakpoint = DEFAULT_MOBILE_BREAKPOINT,
  unstyled = false
}) {
  const runtime = useVoiceControl(controller);
  if (controllerRef) {
    controllerRef.current = controller;
  }
  const resolvedLabels = {
    ...DEFAULT_WIDGET_LABELS,
    ...labels
  };
  const dragOffsetRef = (0, import_react4.useRef)({ x: 0, y: 0 });
  const dragStartRef = (0, import_react4.useRef)({ x: 0, y: 0 });
  const dragPositionRef = (0, import_react4.useRef)({ x: 0, y: 0 });
  const suppressLauncherClickRef = (0, import_react4.useRef)(false);
  const launcherToastTimeoutRef = (0, import_react4.useRef)(null);
  const [position, setPosition] = (0, import_react4.useState)({ x: 0, y: 0 });
  const [dragging, setDragging] = (0, import_react4.useState)(false);
  const [launcherToastMessage, setLauncherToastMessage] = (0, import_react4.useState)(null);
  const [portalContainer, setPortalContainer] = (0, import_react4.useState)(null);
  const setWidgetPosition = (0, import_react4.useCallback)((nextPosition) => {
    dragPositionRef.current = nextPosition;
    setPosition(nextPosition);
  }, []);
  const isMobileViewport = useViewportMatch(mobileBreakpoint);
  const resolvedMobileLayout = mobileLayout ?? layout;
  const resolvedLayout = isMobileViewport ? resolvedMobileLayout : layout;
  const draggableInLayout = draggable && resolvedLayout === "floating";
  const snapToCornersEnabled = snapToCorners && resolvedLayout === "floating";
  const resolvedSnapInset = resolveSnapInset(snapInset);
  const resolvedSnapDefaultCorner = resolveSnapDefaultCorner(snapDefaultCorner);
  const fallbackSize = draggableInLayout ? DEFAULT_LAUNCHER_SIZE : DEFAULT_COMPACT_LAUNCHER_SIZE;
  const cornerSnap = useCornerSnap({
    defaultCorner: resolvedSnapDefaultCorner,
    draggable,
    enabled: snapToCornersEnabled,
    fallbackSize,
    inset: resolvedSnapInset,
    measurementKey: `${resolvedLayout}:${draggableInLayout ? "handle" : "compact"}`,
    persistPosition,
    widgetId
  });
  useIsomorphicLayoutEffect2(() => {
    if (typeof document === "undefined") {
      return;
    }
    setPortalContainer(document.body);
  }, []);
  const clearLauncherToast = () => {
    if (launcherToastTimeoutRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(launcherToastTimeoutRef.current);
      launcherToastTimeoutRef.current = null;
    }
    setLauncherToastMessage(null);
  };
  const hasLauncherError = runtime.status === "error" || runtime.activity === "error";
  (0, import_react4.useEffect)(() => {
    if (!controllerRef) {
      return;
    }
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef]);
  (0, import_react4.useEffect)(() => {
    if (!hasLauncherError) {
      return;
    }
    setLauncherToastMessage("Couldn't connect. Press the voice button to retry.");
    if (typeof window === "undefined") {
      return;
    }
    if (launcherToastTimeoutRef.current !== null) {
      window.clearTimeout(launcherToastTimeoutRef.current);
    }
    launcherToastTimeoutRef.current = window.setTimeout(() => {
      launcherToastTimeoutRef.current = null;
      setLauncherToastMessage(null);
    }, DEFAULT_LAUNCHER_ERROR_TOAST_DURATION_MS);
    return () => {
      if (launcherToastTimeoutRef.current !== null) {
        window.clearTimeout(launcherToastTimeoutRef.current);
        launcherToastTimeoutRef.current = null;
      }
    };
  }, [hasLauncherError]);
  (0, import_react4.useEffect)(() => {
    if (!runtime.connected) {
      return;
    }
    clearLauncherToast();
  }, [runtime.connected]);
  (0, import_react4.useEffect)(() => {
    return () => {
      if (launcherToastTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(launcherToastTimeoutRef.current);
      }
    };
  }, []);
  (0, import_react4.useEffect)(() => {
    if (snapToCornersEnabled) {
      return;
    }
    if (resolvedLayout !== "floating") {
      setDragging(false);
      return;
    }
    if (!persistPosition) {
      clearStoredPosition(widgetId);
      setWidgetPosition({ x: 0, y: 0 });
      return;
    }
    setWidgetPosition(readStoredPosition(widgetId));
  }, [persistPosition, resolvedLayout, setWidgetPosition, snapToCornersEnabled, widgetId]);
  (0, import_react4.useEffect)(() => {
    if (snapToCornersEnabled) {
      return;
    }
    if (resolvedLayout !== "floating" || !persistPosition || dragging) {
      return;
    }
    if (isDefaultPosition(position)) {
      clearStoredPosition(widgetId);
      return;
    }
    if (typeof window !== "undefined") {
      writeLocalStorageValue(positionStorageKey(widgetId), JSON.stringify(position));
    }
  }, [dragging, persistPosition, position, resolvedLayout, snapToCornersEnabled, widgetId]);
  const beginDrag = (event) => {
    if (!draggableInLayout || snapToCornersEnabled) {
      return;
    }
    const target = event.target;
    const interactiveAncestor = target?.closest?.(
      "button,[role='button'],input,select,textarea,[contenteditable='true'],[data-vc-no-drag]"
    );
    if (interactiveAncestor && interactiveAncestor !== event.currentTarget) {
      return;
    }
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY
    };
    dragOffsetRef.current = {
      x: event.clientX - dragPositionRef.current.x,
      y: event.clientY - dragPositionRef.current.y
    };
    setDragging(true);
    const captureTarget = event.currentTarget;
    captureTarget.setPointerCapture?.(event.pointerId);
  };
  const onDrag = (event) => {
    if (!dragging || snapToCornersEnabled) {
      return;
    }
    const nextPosition = {
      x: event.clientX - dragOffsetRef.current.x,
      y: event.clientY - dragOffsetRef.current.y
    };
    setWidgetPosition(nextPosition);
  };
  const endDrag = (event) => {
    if (!dragging || snapToCornersEnabled) {
      return;
    }
    const movedX = Math.abs(event.clientX - dragStartRef.current.x);
    const movedY = Math.abs(event.clientY - dragStartRef.current.y);
    if (movedX > DRAG_THRESHOLD || movedY > DRAG_THRESHOLD) {
      suppressLauncherClickRef.current = true;
    }
    setDragging(false);
    const captureTarget = event.currentTarget;
    captureTarget.releasePointerCapture?.(event.pointerId);
  };
  const resolvedPosition = snapToCornersEnabled ? cornerSnap.position : position;
  const resolvedDragging = snapToCornersEnabled ? cornerSnap.dragging : dragging;
  const launcherHandleProps = snapToCornersEnabled ? cornerSnap.getHandleProps("launcher") : null;
  const rootStyle = resolvedLayout === "floating" ? snapToCornersEnabled ? cornerSnap.dragging || cornerSnap.animating ? {
    bottom: "auto",
    left: 0,
    pointerEvents: "auto",
    position: "absolute",
    right: "auto",
    top: 0,
    transform: `translate3d(${resolvedPosition.x}px, ${resolvedPosition.y}px, 0)`
  } : getAnchoredSnapStyle(cornerSnap.corner, resolvedSnapInset) : { transform: `translate(${resolvedPosition.x}px, ${resolvedPosition.y}px)` } : {};
  const snapOverlayStyle = snapToCornersEnabled ? {
    inset: 0,
    pointerEvents: "none",
    position: "fixed",
    zIndex: "var(--vc-z-index)"
  } : null;
  const launcherStatusText = getWidgetStatus(runtime, resolvedLabels.disconnected);
  const launcherVisualState = getLauncherVisualState(runtime);
  const launcherStatusId = `${widgetId}-launcher-status`;
  const dragHandleLabel = "Drag widget";
  const launcherActionLabel = launcherVisualState === "connecting" ? `${resolvedLabels.launcher} is connecting` : launcherVisualState === "error" ? `Retry ${resolvedLabels.launcher}` : runtime.connected ? `Disconnect ${resolvedLabels.launcher}` : `Start ${resolvedLabels.launcher}`;
  const handleLauncherAction = () => {
    if (launcherVisualState === "connecting") {
      return;
    }
    if (launcherVisualState === "error") {
      void runtime.connect();
      return;
    }
    if (runtime.connected) {
      runtime.disconnect();
      return;
    }
    void runtime.connect();
  };
  const resolveWidgetPartClassName = (part, ...extraClassNames) => cx(
    !unstyled && DEFAULT_WIDGET_PART_CLASS_NAMES[part],
    partClassNames?.[part],
    ...extraClassNames
  );
  const widgetRoot = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      ref: snapToCornersEnabled ? cornerSnap.rootRef : void 0,
      className: cx(resolveWidgetPartClassName("root"), className),
      style: rootStyle,
      "data-vc-part": "root",
      "data-vc-activity": runtime.activity,
      "data-vc-connected": String(runtime.connected),
      "data-vc-dragging": String(resolvedDragging),
      "data-vc-draggable": String(draggableInLayout),
      "data-vc-layout": resolvedLayout,
      children: [
        launcherToastMessage ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "div",
          {
            className: resolveWidgetPartClassName("launcher-toast"),
            "data-vc-part": "launcher-toast",
            role: "status",
            "aria-live": "polite",
            children: launcherToastMessage
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            className: resolveWidgetPartClassName("launcher"),
            "data-vc-part": "launcher",
            "data-vc-draggable": String(draggableInLayout),
            "data-vc-has-handle": String(draggableInLayout),
            "data-vc-launcher-state": launcherVisualState,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "button",
                {
                  className: resolveWidgetPartClassName("launcher-action"),
                  "data-vc-part": "launcher-action",
                  "aria-describedby": launcherStatusId,
                  "aria-label": launcherActionLabel,
                  onClick: () => {
                    if (snapToCornersEnabled ? cornerSnap.consumeLauncherClickSuppression() : suppressLauncherClickRef.current) {
                      suppressLauncherClickRef.current = false;
                      return;
                    }
                    handleLauncherAction();
                  },
                  type: "button",
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "span",
                      {
                        className: resolveWidgetPartClassName("launcher-core"),
                        "data-vc-part": "launcher-core",
                        "aria-hidden": "true",
                        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                          "span",
                          {
                            className: resolveWidgetPartClassName(
                              "launcher-indicator",
                              !unstyled && `vc-launcher-indicator--${launcherVisualState}`
                            ),
                            "data-vc-part": "launcher-indicator",
                            children: renderLauncherIndicatorIcon(launcherVisualState, unstyled)
                          }
                        )
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "span",
                      {
                        id: launcherStatusId,
                        className: resolveWidgetPartClassName("launcher-status"),
                        "data-vc-part": "launcher-status",
                        role: "status",
                        "aria-live": "polite",
                        "aria-atomic": "true",
                        style: VISUALLY_HIDDEN_STYLE,
                        children: launcherStatusText
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "span",
                      {
                        className: resolveWidgetPartClassName("launcher-label"),
                        "data-vc-part": "launcher-label",
                        style: VISUALLY_HIDDEN_STYLE,
                        children: resolvedLabels.launcher
                      }
                    )
                  ]
                }
              ),
              draggableInLayout ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "span",
                  {
                    className: resolveWidgetPartClassName("launcher-separator"),
                    "data-vc-part": "launcher-separator",
                    "aria-hidden": "true"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "button",
                  {
                    className: resolveWidgetPartClassName("launcher-handle"),
                    "data-vc-part": "launcher-handle",
                    "aria-label": dragHandleLabel,
                    onDoubleClick: (event) => event.preventDefault(),
                    onPointerDown: snapToCornersEnabled ? launcherHandleProps?.onPointerDown : (event) => beginDrag(event),
                    onPointerMove: snapToCornersEnabled ? void 0 : onDrag,
                    onPointerUp: snapToCornersEnabled ? void 0 : endDrag,
                    onPointerCancel: snapToCornersEnabled ? void 0 : endDrag,
                    type: "button",
                    children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "span",
                      {
                        className: resolveWidgetPartClassName("launcher-drag-glyph"),
                        "data-vc-part": "launcher-drag-glyph",
                        "aria-hidden": "true",
                        children: renderLauncherHandleIcon()
                      }
                    )
                  }
                )
              ] }) : null
            ]
          }
        )
      ]
    }
  );
  if (!snapToCornersEnabled) {
    return widgetRoot;
  }
  const snapOverlay = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "div",
    {
      className: resolveWidgetPartClassName("overlay"),
      "data-vc-part": "overlay",
      style: snapOverlayStyle ?? void 0,
      children: widgetRoot
    }
  );
  return portalContainer ? (0, import_react_dom.createPortal)(snapOverlay, portalContainer) : snapOverlay;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GhostCursorOverlay,
  VoiceControlWidget,
  createVoiceControlController,
  defineVoiceTool,
  useGhostCursor,
  useVoiceControl
});
