import type {
  VoiceAdapter,
  VoiceConnectOptions,
  VoiceProviderProof,
} from "@minute-one/core";

/**
 * Offline stand-in for tests and UI work without a voice-provider key.
 *
 * `isRealVoice` is false and `provider` is "mock", and both are surfaced in the
 * UI and written to the event log. The engine never selects this adapter on its
 * own: a provider failure surfaces as a failure, and only an explicit user choice
 * can switch to demo mode.
 */
export class MockVoiceAdapter implements VoiceAdapter {
  readonly spoken: string[] = [];
  readonly contexts: Record<string, unknown>[] = [];
  readonly toolResults: Array<{ callId: string; result?: unknown; error?: string }> =
    [];

  private handlers: VoiceConnectOptions["handlers"] = {};
  private connectedAtMs: number | null = null;

  private state: VoiceProviderProof = {
    provider: "mock",
    model: "offline-script",
    sessionId: null,
    connection: "idle",
    minutes: 0,
    disconnectReason: null,
    fallbackReason: null,
    isRealVoice: false,
  };

  constructor(private readonly fallbackReason: string | null = null) {
    this.state.fallbackReason = fallbackReason;
  }

  get proof(): VoiceProviderProof {
    const minutes =
      this.connectedAtMs === null
        ? this.state.minutes
        : (Date.now() - this.connectedAtMs) / 60000;
    return { ...this.state, minutes };
  }

  async connect(options: VoiceConnectOptions): Promise<void> {
    this.handlers = options.handlers;
    this.connectedAtMs = Date.now();
    this.state = {
      ...this.state,
      connection: "connected",
      sessionId: `mock_${Math.abs(hash(options.persona)).toString(36)}`,
    };
    this.handlers.onStateChange?.(this.proof);
    if (options.greeting) {
      this.handlers.onTranscript?.({
        role: "assistant",
        text: options.greeting,
        final: true,
      });
    }
  }

  async say(text: string): Promise<void> {
    this.spoken.push(text);
    this.handlers.onTranscript?.({ role: "assistant", text, final: true });
  }

  async pushContext(packet: Record<string, unknown>): Promise<void> {
    this.contexts.push(packet);
  }

  async respondToTool(callId: string, result: unknown): Promise<void> {
    this.toolResults.push({ callId, result });
  }

  async respondToToolError(callId: string, message: string): Promise<void> {
    this.toolResults.push({ callId, error: message });
  }

  async disconnect(reason: string): Promise<void> {
    this.state = {
      ...this.state,
      minutes: this.proof.minutes,
      connection: "closed",
      disconnectReason: reason,
    };
    this.connectedAtMs = null;
    this.handlers.onStateChange?.(this.proof);
  }

  /** Test helper: simulate the user speaking. */
  emitUserSpeech(text: string, final = true) {
    this.handlers.onTranscript?.({ role: "user", text, final });
  }

  /** Test helper: simulate the model raising a client-loop tool call. */
  emitToolCall(callId: string, name: string, args: Record<string, unknown> = {}) {
    this.handlers.onToolCall?.({ callId, name, arguments: args });
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
