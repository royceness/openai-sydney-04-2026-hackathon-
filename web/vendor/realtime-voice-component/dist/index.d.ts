import * as react_jsx_runtime from 'react/jsx-runtime';

type TransportSessionConfig = {
    model: RealtimeModel;
    instructions: string;
    tools: RealtimeFunctionTool[];
    activationMode: ActivationMode;
    outputMode: OutputMode;
    audio?: RealtimeAudioConfig;
    include?: RealtimeSessionInclude[];
    maxOutputTokens?: number | "inf";
    metadata?: Record<string, unknown>;
    prompt?: RealtimePrompt;
    toolChoice?: RealtimeToolChoice;
    tracing?: RealtimeTracing | null;
    truncation?: RealtimeTruncation;
    raw?: Record<string, unknown>;
};
type TransportAuth = {
    type: "auth_token";
    authToken: string;
} | {
    type: "session_endpoint";
    sessionEndpoint: string;
    sessionRequestInit?: RequestInit;
};
type TransportConnectOptions = {
    auth: TransportAuth;
    session: TransportSessionConfig;
    audioPlaybackEnabled: boolean;
    signal?: AbortSignal;
    onServerEvent: (event: RealtimeServerEvent) => void;
    onError: (error: Error) => void;
};
interface RealtimeTransport {
    connect(options: TransportConnectOptions): Promise<void>;
    disconnect(): void;
    updateSession(session: TransportSessionConfig): void;
    startCapture(): void;
    stopCapture(): void;
    sendFunctionResult(callId: string, output: unknown): void;
    requestResponse(): void;
    sendClientEvent(event: RealtimeClientEvent): void;
    setAudioPlaybackEnabled(enabled: boolean): void;
}

type JsonSchema = {
    type?: string;
    description?: string;
    properties?: Record<string, JsonSchema>;
    items?: JsonSchema | JsonSchema[];
    required?: readonly string[];
    enum?: readonly unknown[];
    additionalProperties?: boolean | JsonSchema;
    anyOf?: JsonSchema[];
    oneOf?: JsonSchema[];
    allOf?: JsonSchema[];
    [key: string]: unknown;
};
type RealtimeServerEvent = {
    type: string;
    [key: string]: unknown;
};
type ToolCallStatus = "running" | "success" | "error" | "skipped";
type ActivationMode = "push-to-talk" | "vad";
type OutputMode = "tool-only" | "text" | "audio" | "text+audio";
type KnownRealtimeModel = "gpt-realtime" | "gpt-realtime-1.5" | "gpt-realtime-mini";
type RealtimeModel = KnownRealtimeModel | (string & {});
type RealtimeAudioFormat = "pcm16" | "g711_ulaw" | "g711_alaw";
type KnownRealtimeVoice = "alloy" | "ash" | "ballad" | "cedar" | "coral" | "echo" | "marin" | "sage" | "shimmer" | "verse";
type RealtimeVoice = KnownRealtimeVoice | (string & {});
type KnownRealtimeTranscriptionModel = "gpt-4o-transcribe" | "gpt-4o-mini-transcribe" | "whisper-1";
type RealtimeTranscriptionModel = KnownRealtimeTranscriptionModel | (string & {});
type RealtimeNoiseReductionType = "near_field" | "far_field";
type RealtimeSessionInclude = "item.input_audio_transcription.logprobs";
type RealtimePrompt = {
    id: string;
    version?: string;
    variables?: Record<string, unknown>;
};
type RealtimeInputAudioTranscription = {
    language?: string;
    model?: RealtimeTranscriptionModel;
    prompt?: string;
};
type RealtimeInputAudioNoiseReduction = {
    type?: RealtimeNoiseReductionType;
};
type RealtimeServerVadTurnDetection = {
    type: "server_vad";
    createResponse?: boolean;
    idleTimeoutMs?: number;
    interruptResponse?: boolean;
    prefixPaddingMs?: number;
    silenceDurationMs?: number;
    threshold?: number;
};
type RealtimeSemanticVadTurnDetection = {
    type: "semantic_vad";
    createResponse?: boolean;
    eagerness?: "low" | "medium" | "high" | "auto";
    interruptResponse?: boolean;
};
type RealtimeTurnDetection = RealtimeServerVadTurnDetection | RealtimeSemanticVadTurnDetection;
type RealtimeAudioInputConfig = {
    format?: RealtimeAudioFormat;
    noiseReduction?: RealtimeInputAudioNoiseReduction | null;
    transcription?: RealtimeInputAudioTranscription | null;
    turnDetection?: RealtimeTurnDetection | null;
};
type RealtimeAudioOutputConfig = {
    format?: RealtimeAudioFormat;
    speed?: number;
    voice?: RealtimeVoice;
};
type RealtimeAudioConfig = {
    input?: RealtimeAudioInputConfig;
    output?: RealtimeAudioOutputConfig;
};
type RealtimeToolChoice = "none" | "auto" | "required" | {
    type: "function";
    name: string;
} | {
    type: "mcp";
    serverLabel: string;
    name?: string;
};
type RealtimeTracing = "auto" | {
    groupId?: string;
    metadata?: Record<string, unknown>;
    workflowName?: string;
};
type RealtimeTruncation = "auto" | "disabled" | {
    type: "retention_ratio";
    retentionRatio: number;
};
type RealtimeClientEvent = {
    type: string;
    [key: string]: unknown;
};
type VoiceControlActivity = "idle" | "connecting" | "listening" | "processing" | "executing" | "error";
type VoiceControlErrorCode = "aborted" | "device_unavailable" | "insecure_context" | "network_error" | "permission_denied" | "media_timeout" | "unknown" | "unsupported_browser";
type VoiceControlError = {
    code?: VoiceControlErrorCode;
    message: string;
    cause?: unknown;
};
type ToolCallEvent = {
    callId: string;
    name: string;
    args: unknown;
};
type VoiceToolCallRecord = {
    id: string;
    responseId?: string;
    sequence: number;
    name: string;
    status: ToolCallStatus;
    args?: unknown;
    output?: unknown;
    error?: VoiceControlError;
    startedAt: number;
    finishedAt?: number;
    durationMs?: number;
};
type ToolCallResultEvent = ToolCallEvent & {
    output: unknown;
};
type ToolCallErrorEvent = ToolCallEvent & {
    error: VoiceControlError;
};
type VoiceControlLocalEvent = {
    type: "voice.transport.connected";
} | {
    type: "voice.transport.disconnected";
} | {
    type: "voice.capture.started";
} | {
    type: "voice.capture.stopped";
} | {
    type: "voice.no_action";
    message: string;
} | ({
    type: "voice.tool.started";
} & ToolCallEvent) | ({
    type: "voice.tool.succeeded";
} & ToolCallResultEvent) | ({
    type: "voice.tool.failed";
} & ToolCallErrorEvent);
type VoiceControlEvent = VoiceControlLocalEvent | RealtimeServerEvent;
type RealtimeFunctionTool = {
    type: "function";
    name: string;
    description: string;
    parameters: JsonSchema;
};
type ZodLikeSchema<TArgs = unknown> = {
    parse: (input: unknown) => TArgs;
    safeParse: (input: unknown) => unknown;
};
type VoiceToolDefinition<TArgs = unknown> = {
    name: string;
    description: string;
    parameters: ZodLikeSchema<TArgs>;
    execute: (args: TArgs) => Promise<unknown> | unknown;
};
type VoiceTool<TArgs = unknown> = VoiceToolDefinition<TArgs> & {
    jsonSchema: JsonSchema;
    realtimeTool: RealtimeFunctionTool;
    parseArguments: (rawArgs: string) => TArgs;
};
type VoiceControlRealtimeSessionOptions = {
    audio?: RealtimeAudioConfig;
    include?: RealtimeSessionInclude[];
    maxOutputTokens?: number | "inf";
    metadata?: Record<string, unknown>;
    prompt?: RealtimePrompt;
    toolChoice?: RealtimeToolChoice;
    tracing?: RealtimeTracing | null;
    truncation?: RealtimeTruncation;
    raw?: Record<string, unknown>;
};
type VoiceControlRealtimeSessionPatch = {
    audio?: RealtimeAudioConfig | null;
    include?: RealtimeSessionInclude[] | null;
    maxOutputTokens?: number | "inf" | null;
    metadata?: Record<string, unknown> | null;
    prompt?: RealtimePrompt | null;
    toolChoice?: RealtimeToolChoice | null;
    tracing?: RealtimeTracing | null;
    truncation?: RealtimeTruncation | null;
    raw?: Record<string, unknown> | null;
};
type VoiceControlResolvedSessionConfig = {
    model: RealtimeModel;
    instructions: string;
    tools: RealtimeFunctionTool[];
    activationMode: ActivationMode;
    outputMode: OutputMode;
    audio?: RealtimeAudioConfig;
    include?: RealtimeSessionInclude[];
    maxOutputTokens?: number | "inf";
    metadata?: Record<string, unknown>;
    prompt?: RealtimePrompt;
    toolChoice?: RealtimeToolChoice;
    tracing?: RealtimeTracing | null;
    truncation?: RealtimeTruncation;
    raw?: Record<string, unknown>;
};
type UseVoiceControlOptions = {
    auth: {
        sessionEndpoint: string;
        sessionRequestInit?: RequestInit;
    } | {
        getClientSecret: () => Promise<string>;
    } | {
        tokenEndpoint: string;
        tokenRequestInit?: RequestInit;
    };
    tools: VoiceTool<any>[];
    instructions?: string;
    model?: RealtimeModel;
    activationMode?: ActivationMode;
    outputMode?: OutputMode;
    session?: VoiceControlRealtimeSessionOptions;
    audio?: RealtimeAudioConfig;
    include?: RealtimeSessionInclude[];
    maxOutputTokens?: number | "inf";
    prompt?: RealtimePrompt;
    toolChoice?: RealtimeToolChoice;
    tracing?: RealtimeTracing | null;
    truncation?: RealtimeTruncation;
    postToolResponse?: boolean;
    autoConnect?: boolean;
    debug?: boolean;
    maxToolCallHistory?: number | null;
    onEvent?: (event: VoiceControlEvent) => void;
    onToolStart?: (call: ToolCallEvent) => void;
    onToolSuccess?: (call: ToolCallResultEvent) => void;
    onToolError?: (call: ToolCallErrorEvent) => void;
    onError?: (error: VoiceControlError) => void;
    transportFactory?: () => RealtimeTransport;
};
type VoiceControlStatus = "idle" | "connecting" | "ready" | "listening" | "processing" | "error";
type VoiceControlSnapshot = {
    status: VoiceControlStatus;
    activity: VoiceControlActivity;
    connected: boolean;
    transcript: string;
    toolCalls: VoiceToolCallRecord[];
    latestToolCall: VoiceToolCallRecord | null;
    sessionConfig: VoiceControlResolvedSessionConfig;
};
type UseVoiceControlReturn = VoiceControlSnapshot & {
    clearToolCalls: () => void;
    connect: () => Promise<void>;
    disconnect: () => void;
    startCapture: () => void;
    stopCapture: () => void;
    updateInstructions: (instructions: string) => void;
    updateTools: (tools: VoiceTool<any>[]) => void;
    updateSession: (patch: VoiceControlRealtimeSessionPatch) => void;
    requestResponse: () => void;
    sendClientEvent: (event: RealtimeClientEvent) => void;
};
type VoiceControlController = UseVoiceControlReturn & {
    configure: (options: UseVoiceControlOptions) => void;
    destroy: () => void;
    getSnapshot: () => VoiceControlSnapshot;
    subscribe: (listener: () => void) => () => void;
};
type UseVoiceControlInput = UseVoiceControlOptions | VoiceControlController;
type VoiceControlWidgetLabels = {
    launcher: string;
    disconnected: string;
};
type VoiceControlWidgetLayout = "floating" | "inline";
type VoiceControlWidgetCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type VoiceControlWidgetPart = "root" | "overlay" | "launcher" | "launcher-toast" | "launcher-action" | "launcher-status" | "launcher-label" | "launcher-handle" | "launcher-separator" | "launcher-core" | "launcher-indicator" | "launcher-drag-glyph";
type VoiceControlWidgetPartClassNames = Partial<Record<VoiceControlWidgetPart, string>>;
type VoiceControlWidgetProps = {
    widgetId?: string;
    className?: string;
    controllerRef?: {
        current: VoiceControlController | null;
    };
    draggable?: boolean;
    persistPosition?: boolean;
    snapToCorners?: boolean;
    snapInset?: number;
    snapDefaultCorner?: VoiceControlWidgetCorner;
    partClassNames?: VoiceControlWidgetPartClassNames;
    labels?: Partial<VoiceControlWidgetLabels>;
    layout?: VoiceControlWidgetLayout;
    mobileLayout?: VoiceControlWidgetLayout;
    mobileBreakpoint?: number;
    unstyled?: boolean;
    controller: VoiceControlController;
};
type GhostCursorEasing = "smooth" | "expressive";
type GhostCursorOrigin = "pointer" | "previous" | GhostCursorPoint;
type GhostCursorPoint = {
    x: number;
    y: number;
};
type GhostCursorPhase = "hidden" | "traveling" | "arrived" | "error";
type GhostCursorSpriteState = {
    id: string;
    role: "main" | "satellite";
    phase: GhostCursorPhase;
    position: GhostCursorPoint;
    durationMs: number;
    easing?: GhostCursorEasing;
    fade?: number;
};
type GhostCursorState = {
    main: GhostCursorSpriteState;
    satellites: GhostCursorSpriteState[];
};
type GhostCursorMotionOptions = {
    easing?: GhostCursorEasing;
    from?: GhostCursorOrigin;
};
type GhostCursorTarget = {
    element?: HTMLElement | null;
    point?: GhostCursorPoint;
    pulseElement?: HTMLElement | null;
};
type UseGhostCursorOptions = {
    viewportPadding?: number;
    idleHideMs?: number;
    scrollSettleMs?: number;
};
type UseGhostCursorReturn = {
    cursorState: GhostCursorState;
    run: <TResult>(target: GhostCursorTarget, operation: () => Promise<TResult> | TResult, options?: GhostCursorMotionOptions) => Promise<TResult>;
    runEach: <TItem, TResult>(items: TItem[], resolveTarget: (item: TItem, index: number) => GhostCursorTarget | null | undefined, operation: (item: TItem, index: number) => Promise<TResult> | TResult, options?: GhostCursorMotionOptions) => Promise<TResult[]>;
    hide: () => void;
};
type GhostCursorOverlayProps = {
    state: GhostCursorState;
    className?: string;
};

declare function defineVoiceTool<TArgs>(definition: VoiceToolDefinition<TArgs>): VoiceTool<TArgs>;

declare function GhostCursorOverlay({ state, className }: GhostCursorOverlayProps): react_jsx_runtime.JSX.Element;

declare function useVoiceControl(options: UseVoiceControlOptions): UseVoiceControlReturn;
declare function useVoiceControl(controller: VoiceControlController): UseVoiceControlReturn;
declare function useVoiceControl(input: UseVoiceControlInput): UseVoiceControlReturn;

declare function useGhostCursor({ idleHideMs, scrollSettleMs, viewportPadding, }?: UseGhostCursorOptions): UseGhostCursorReturn;

declare function VoiceControlWidget({ widgetId, className, controller, controllerRef, draggable, persistPosition, snapToCorners, snapInset, snapDefaultCorner, partClassNames, labels, layout, mobileLayout, mobileBreakpoint, unstyled, }: VoiceControlWidgetProps): react_jsx_runtime.JSX.Element;

declare function createVoiceControlController(options: UseVoiceControlOptions): VoiceControlController;

export { type ActivationMode, type GhostCursorEasing, type GhostCursorMotionOptions, type GhostCursorOrigin, GhostCursorOverlay, type GhostCursorOverlayProps, type GhostCursorPhase, type GhostCursorPoint, type GhostCursorSpriteState, type GhostCursorState, type GhostCursorTarget, type JsonSchema, type KnownRealtimeModel, type KnownRealtimeTranscriptionModel, type KnownRealtimeVoice, type OutputMode, type RealtimeAudioConfig, type RealtimeAudioFormat, type RealtimeAudioInputConfig, type RealtimeAudioOutputConfig, type RealtimeClientEvent, type RealtimeInputAudioNoiseReduction, type RealtimeInputAudioTranscription, type RealtimeModel, type RealtimeNoiseReductionType, type RealtimePrompt, type RealtimeSemanticVadTurnDetection, type RealtimeServerEvent, type RealtimeServerVadTurnDetection, type RealtimeSessionInclude, type RealtimeToolChoice, type RealtimeTracing, type RealtimeTranscriptionModel, type RealtimeTruncation, type RealtimeTurnDetection, type RealtimeVoice, type ToolCallErrorEvent, type ToolCallEvent, type ToolCallResultEvent, type ToolCallStatus, type UseGhostCursorOptions, type UseGhostCursorReturn, type UseVoiceControlInput, type UseVoiceControlOptions, type UseVoiceControlReturn, type VoiceControlActivity, type VoiceControlController, type VoiceControlError, type VoiceControlErrorCode, type VoiceControlEvent, type VoiceControlRealtimeSessionOptions, type VoiceControlRealtimeSessionPatch, type VoiceControlResolvedSessionConfig, type VoiceControlSnapshot, type VoiceControlStatus, VoiceControlWidget, type VoiceControlWidgetCorner, type VoiceControlWidgetLabels, type VoiceControlWidgetLayout, type VoiceControlWidgetPart, type VoiceControlWidgetPartClassNames, type VoiceControlWidgetProps, type VoiceTool, type VoiceToolCallRecord, type VoiceToolDefinition, createVoiceControlController, defineVoiceTool, useGhostCursor, useVoiceControl };
