import {
  AgentMicrophone,
  AgentPlayer,
  AgentSession,
  type AgentSessionConfig,
  type AgentSettingsObject,
} from "@deepgram/agents";
import type {
  VoiceAdapter,
  VoiceConnectOptions,
  VoiceConnectionState,
  VoiceProviderProof,
} from "@minute-one/core";

const INPUT_RATE = 16_000;
const OUTPUT_RATE = 24_000;
const DEFAULT_LISTEN_MODEL = "flux-general-en";
const DEFAULT_THINK_MODEL = "gpt-4o-mini";
const DEFAULT_SPEAK_MODEL = "aura-2-thalia-en";

export const MIC_BLOCKED = "microphone_blocked";

type TokenResponse = {
  token: string;
  expiresIn: number;
  models?: {
    listen?: string;
    think?: string;
    speak?: string;
  };
};

type FunctionRequest = {
  functions?: Array<{
    id?: string;
    name?: string;
    arguments?: string;
    input?: string;
    client_side?: boolean;
  }>;
};

type ConversationMessage = {
  role?: string;
  content?: string;
};

type WelcomeMessage = {
  request_id?: string;
  session_id?: string;
};

type ProviderMessage = {
  code?: string;
  description?: string;
  message?: string;
};

interface SessionLike {
  state: string;
  on(event: string, handler: (...args: any[]) => void): unknown;
  connect(): Promise<void>;
  disconnect(): void;
  sendAudio(data: ArrayBuffer): void;
  injectAgentMessage(message: string): void;
  updatePrompt(prompt: string): void;
  sendFunctionCallResponse(
    id: string | undefined,
    name: string,
    content: string
  ): void;
  getId(): string | null;
}

interface MicrophoneLike {
  start(): Promise<void>;
  stop(): void;
}

interface PlayerLike {
  queue(data: ArrayBuffer): void;
  interrupt(): void;
  dispose(): void;
}

export type DeepgramAdapterOptions = {
  /** Minute One server endpoint that mints a temporary Deepgram bearer token. */
  tokenEndpoint?: string;
  fetchImpl?: typeof fetch;
  /** Test seams. Production uses the official Deepgram browser SDK classes. */
  createSession?: (config: AgentSessionConfig) => SessionLike;
  createMicrophone?: (onAudio: (data: ArrayBuffer) => void) => MicrophoneLike;
  createPlayer?: () => PlayerLike;
};

/**
 * Real Deepgram Voice Agent adapter.
 *
 * The long-lived Deepgram key stays on the Minute One server. The browser asks
 * for a short-lived bearer token, then the official SDK supplies that token as
 * a WebSocket subprotocol. The voice provider may speak, listen and request
 * tools, but it has no API for marking a journey step successful.
 */
export class DeepgramVoiceAdapter implements VoiceAdapter {
  private session: SessionLike | null = null;
  private microphone: MicrophoneLike | null = null;
  private player: PlayerLike | null = null;
  private connectedAtMs: number | null = null;
  private handlers: VoiceConnectOptions["handlers"] = {};
  private basePrompt = "";
  private currentContext: Record<string, unknown> | null = null;
  private pendingTools = new Map<string, string>();
  private intentionalCloseReason: string | null = null;

  private state: VoiceProviderProof = {
    provider: "deepgram",
    model: `${DEFAULT_LISTEN_MODEL} + ${DEFAULT_THINK_MODEL} + ${DEFAULT_SPEAK_MODEL}`,
    sessionId: null,
    connection: "idle",
    minutes: 0,
    disconnectReason: null,
    fallbackReason: null,
    isRealVoice: true,
  };

  constructor(private readonly options: DeepgramAdapterOptions = {}) {}

  get proof(): VoiceProviderProof {
    return { ...this.state, minutes: this.currentMinutes() };
  }

  async connect(options: VoiceConnectOptions): Promise<void> {
    this.handlers = options.handlers;
    this.intentionalCloseReason = null;
    this.setConnection("connecting");

    let firstToken: string | null = null;
    const tokenFactory = async () => {
      if (firstToken) {
        const token = firstToken;
        firstToken = null;
        return token;
      }
      return (await this.fetchToken()).token;
    };

    try {
      // Fetch now so configuration and authentication fail before mic access.
      const tokenConfig = await this.fetchToken();
      firstToken = tokenConfig.token;
      const models = {
        listen: tokenConfig?.models?.listen ?? DEFAULT_LISTEN_MODEL,
        think: tokenConfig?.models?.think ?? DEFAULT_THINK_MODEL,
        speak: tokenConfig?.models?.speak ?? DEFAULT_SPEAK_MODEL,
      };

      this.state.model = `${models.listen} + ${models.think} + ${models.speak}`;
      this.basePrompt = buildPrompt(options.persona);
      const config: AgentSessionConfig = {
        auth: {
          // The SDK calls this again on reconnect, producing a fresh token.
          tokenFactory,
        },
        audio: {
          input: { encoding: "linear16", sampleRate: INPUT_RATE },
          output: { encoding: "linear16", sampleRate: OUTPUT_RATE },
        },
        agent: buildAgentSettings(options, this.basePrompt, models),
        reconnect: {
          enabled: true,
          maxAttempts: 3,
          baseDelay: 500,
          maxDelay: 5_000,
          jitter: true,
        },
        tags: ["minute-one", "guided-onboarding"],
      };

      this.player = this.createPlayer();
      const session = this.createSession(config);
      this.session = session;
      this.bindSession(session);

      this.microphone = this.createMicrophone((data) => session.sendAudio(data));
      await session.connect();

      try {
        await this.microphone.start();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.handlers.onError?.(new Error(`${MIC_BLOCKED}: ${reason}`));
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState({ connection: "error", disconnectReason: error.message });
      this.cleanupMedia();
      this.handlers.onError?.(error);
      throw error;
    }
  }

  async say(text: string): Promise<void> {
    this.requireSession().injectAgentMessage(text);
  }

  async pushContext(packet: Record<string, unknown>): Promise<void> {
    this.currentContext = packet;
    this.requireSession().updatePrompt(
      `${this.basePrompt}\n\nCurrent verified guidance state:\n${JSON.stringify(packet)}`
    );
  }

  async respondToTool(callId: string, result: unknown): Promise<void> {
    const name = this.pendingTools.get(callId);
    if (!name) throw new Error(`unknown Deepgram function call: ${callId}`);
    this.requireSession().sendFunctionCallResponse(
      callId,
      name,
      JSON.stringify({ result })
    );
    this.pendingTools.delete(callId);
  }

  async respondToToolError(callId: string, message: string): Promise<void> {
    const name = this.pendingTools.get(callId);
    if (!name) throw new Error(`unknown Deepgram function call: ${callId}`);
    this.requireSession().sendFunctionCallResponse(
      callId,
      name,
      JSON.stringify({ error: message })
    );
    this.pendingTools.delete(callId);
  }

  async disconnect(reason: string): Promise<void> {
    this.intentionalCloseReason = reason;
    this.session?.disconnect();
    this.finalise(reason);
  }

  private async fetchToken(): Promise<TokenResponse> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const endpoint = this.options.tokenEndpoint ?? "/api/minute-one/session";
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Deepgram token request failed (${response.status}): ${body.slice(0, 200)}`
      );
    }
    const body = (await response.json()) as Partial<TokenResponse>;
    if (!body.token || typeof body.token !== "string") {
      throw new Error("Deepgram token response did not contain a token");
    }
    return {
      token: body.token,
      expiresIn: Number(body.expiresIn ?? 0),
      models: body.models,
    };
  }

  private bindSession(session: SessionLike) {
    session.on("connecting", () => this.setConnection("connecting"));
    session.on("connected", () => {
      if (this.connectedAtMs === null) this.connectedAtMs = Date.now();
      this.setConnection("connected");
    });
    session.on("reconnecting", () => this.setConnection("reconnecting"));
    session.on("welcome", (message: WelcomeMessage) => {
      this.setState({
        sessionId: message.session_id ?? message.request_id ?? session.getId(),
        connection: "connected",
      });
    });
    session.on("conversation-text", (message: ConversationMessage) => {
      if (typeof message.content !== "string" || !message.content.trim()) return;
      this.handlers.onTranscript?.({
        role: message.role === "user" ? "user" : "assistant",
        text: message.content,
        final: true,
      });
    });
    session.on("audio", (chunk: ArrayBuffer) => this.player?.queue(chunk));
    session.on("user-started-speaking", () => {
      this.player?.interrupt();
      this.handlers.onBargeIn?.();
    });
    session.on("function-call-request", (message: FunctionRequest) => {
      for (const fn of message.functions ?? []) {
        if (fn.client_side === false || !fn.id || !fn.name) continue;
        const args = parseArguments(fn.arguments ?? fn.input ?? "{}");
        this.pendingTools.set(fn.id, fn.name);
        this.handlers.onToolCall?.({
          callId: fn.id,
          name: fn.name,
          arguments: args,
        });
      }
    });
    session.on("warning", (message: ProviderMessage) => {
      console.warn("[minute-one] Deepgram warning:", providerMessage(message));
    });
    session.on("error", (message: ProviderMessage) => {
      const error = new Error(`Deepgram error: ${providerMessage(message)}`);
      this.setConnection("error");
      this.handlers.onError?.(error);
    });
    session.on("sdk-error", (err: Error) => {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setConnection("error");
      this.handlers.onError?.(error);
    });
    session.on("disconnected", (reason: string) => {
      this.finalise(this.intentionalCloseReason ?? reason ?? "Deepgram disconnected");
    });
  }

  private currentMinutes(): number {
    if (this.connectedAtMs === null) return this.state.minutes;
    return this.state.minutes + (Date.now() - this.connectedAtMs) / 60_000;
  }

  private setState(patch: Partial<VoiceProviderProof>) {
    this.state = { ...this.state, ...patch };
    this.handlers.onStateChange?.(this.proof);
  }

  private setConnection(connection: VoiceConnectionState) {
    this.setState({ connection });
  }

  private finalise(reason: string) {
    if (this.state.connection === "closed") return;
    this.setState({
      minutes: this.currentMinutes(),
      connection: "closed",
      disconnectReason: reason,
    });
    this.connectedAtMs = null;
    this.cleanupMedia();
    this.session = null;
    this.pendingTools.clear();
  }

  private cleanupMedia() {
    this.microphone?.stop();
    this.microphone = null;
    this.player?.dispose();
    this.player = null;
  }

  private requireSession(): SessionLike {
    if (!this.session) throw new Error("Deepgram session is not connected");
    return this.session;
  }

  private createSession(config: AgentSessionConfig): SessionLike {
    return this.options.createSession?.(config) ?? new AgentSession(config);
  }

  private createMicrophone(
    onAudio: (data: ArrayBuffer) => void
  ): MicrophoneLike {
    return (
      this.options.createMicrophone?.(onAudio) ??
      new AgentMicrophone(onAudio, {
        sampleRate: INPUT_RATE,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      })
    );
  }

  private createPlayer(): PlayerLike {
    return this.options.createPlayer?.() ?? new AgentPlayer({ sampleRate: OUTPUT_RATE });
  }
}

function buildAgentSettings(
  options: VoiceConnectOptions,
  prompt: string,
  models: { listen: string; think: string; speak: string }
): AgentSettingsObject {
  return {
    language: options.language ?? "en",
    listen: {
      provider: {
        type: "deepgram",
        version: models.listen.startsWith("flux-") ? "v2" : "v1",
        model: models.listen,
      },
    },
    think: {
      provider: {
        type: "open_ai",
        model: models.think,
        temperature: 0.2,
      },
      prompt,
      // A function with no `endpoint` is the API's way of saying "call this on
      // the client". There is no `client_side` field to set — sending one is an
      // unknown key, and Deepgram rejects the whole settings message for it.
      functions: (options.tools ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    },
    speak: {
      provider: {
        type: "deepgram",
        model: options.voiceId ?? models.speak,
      },
    },
    ...(options.greeting ? { greeting: options.greeting } : {}),
  };
}

function buildPrompt(persona: string): string {
  return [
    persona,
    "Minute One owns journey state and verification.",
    "Give one short instruction at a time.",
    "Never say that a step passed unless a function response says passed=true.",
    "When page context changes, use the newest guidance state.",
  ].join(" ");
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function providerMessage(message: ProviderMessage): string {
  return message.description ?? message.message ?? message.code ?? "unknown error";
}
