import PyAI, {
  type OmniConnection,
  type OmniServerFrame,
  type OmniToolCallFrame,
  type OmniTranscriptFrame,
} from "@pyai/sdk";
import type {
  VoiceAdapter,
  VoiceConnectOptions,
  VoiceConnectionState,
  VoiceProviderProof,
} from "@minute-one/core";

/**
 * Real PyAI Omni browser adapter.
 *
 * Written against @pyai/sdk 0.2.x type definitions and the published wire
 * protocol. Nothing here is guessed: the SDK owns the frame-key asymmetry
 * (outbound keyed on `type`, inbound on `event`), the 0x01 audio tagging, and
 * the transcript demux.
 *
 * Auth: the page never holds a secret key. The server mints an ephemeral,
 * origin-locked token via `omni.createSession`; the browser connects with it.
 */

const SAMPLE_RATE = 24000 as const;
const MODEL_SURFACE = "omni-realtime";

/** Marker the SDK matches on to tell a capture problem from a provider one. */
export const MIC_BLOCKED = "microphone_blocked";

type SessionTokenResponse = {
  token: string;
  url: string;
  expiresAt: number;
  /** A console-built Voice Agent to adopt, or null to run without one. */
  agentId?: string | null;
};

export type PyAIAdapterOptions = {
  /** Endpoint on our own server that mints the ephemeral token. */
  tokenEndpoint?: string;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Supplies mic frames. Returns a stop function. */
  startMicrophone?: (onChunk: (pcm: ArrayBuffer) => void) => Promise<() => void>;
  /** Plays agent PCM16. `clear()` must drop queued audio for barge-in. */
  createPlayback?: () => Promise<{
    push: (chunk: ArrayBuffer) => void;
    clear: () => void;
    stop: () => void;
  }>;
};

export class PyAIVoiceAdapter implements VoiceAdapter {
  private connection: OmniConnection | null = null;
  private playback: Awaited<
    ReturnType<NonNullable<PyAIAdapterOptions["createPlayback"]>>
  > | null = null;
  private stopMic: (() => void) | null = null;
  private connectedAtMs: number | null = null;
  private handlers: VoiceConnectOptions["handlers"] = {};

  private state: VoiceProviderProof = {
    provider: "pyai",
    model: MODEL_SURFACE,
    sessionId: null,
    connection: "idle",
    minutes: 0,
    disconnectReason: null,
    fallbackReason: null,
    isRealVoice: true,
  };

  constructor(private readonly options: PyAIAdapterOptions = {}) {}

  get proof(): VoiceProviderProof {
    return { ...this.state, minutes: this.currentMinutes() };
  }

  private currentMinutes(): number {
    if (this.connectedAtMs === null) return this.state.minutes;
    return (Date.now() - this.connectedAtMs) / 60000;
  }

  private setState(patch: Partial<VoiceProviderProof>) {
    this.state = { ...this.state, ...patch };
    this.handlers.onStateChange?.(this.proof);
  }

  private setConnection(connection: VoiceConnectionState) {
    this.setState({ connection });
  }

  async connect(options: VoiceConnectOptions): Promise<void> {
    this.handlers = options.handlers;
    this.setConnection("connecting");

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const endpoint = this.options.tokenEndpoint ?? "/api/session-token";

    let session: SessionTokenResponse;
    try {
      const res = await fetchImpl(endpoint, { method: "POST" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `session token request failed (${res.status}): ${body.slice(0, 200)}`
        );
      }
      session = (await res.json()) as SessionTokenResponse;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState({ connection: "error", disconnectReason: error.message });
      this.handlers.onError?.(error);
      throw error;
    }

    /*
     * `apiKey` is required by the constructor and rejected when empty, so the
     * ephemeral session token is passed for it as well. What actually
     * authorises the socket is `token` below, sent as the subprotocol
     * `pyai-key.<token>` — short-lived and origin-locked. The long-lived secret
     * never reaches the browser either way.
     */
    const client = new PyAI({ apiKey: session.token });

    const connection = client.omni.connect({
      token: session.token,
      rate: SAMPLE_RATE,
      format: "pcm16",
      /*
       * Adopts a Voice Agent built in the PyAI console. The profile resolves
       * from the connect URL's `session_label` — minting with the same label
       * does not bind it, which is easy to get wrong because both accept one.
       */
      ...(session.agentId ? { sessionLabel: session.agentId } : {}),
      configure: {
        /*
         * Only pin a voice when one was asked for. An inline value wins for the
         * session, so hardcoding a default here would silently override the
         * voice chosen on the agent in the console.
         */
        ...(options.voiceId
          ? { voice_id: options.voiceId }
          : session.agentId
            ? {}
            : { voice_id: "stock_dorit_en_us" }),
        persona: options.persona,
        ...(options.greeting ? { greeting: options.greeting } : {}),
        language: (options.language as "en") ?? "en",
        // No `endpoint` on a tool => client-loop, answered over this socket.
        tools: (options.tools ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },

      onOpen: () => {
        this.connectedAtMs = Date.now();
        this.setConnection("connected");
      },

      onSessionStarted: (frame: OmniServerFrame) => {
        const id =
          (frame.session_id as string | undefined) ??
          (frame.call_id as string | undefined) ??
          null;
        this.setState({ sessionId: id, connection: "connected" });
      },

      onAudio: (chunk) => {
        void this.enqueueAudio(chunk);
      },

      onBargeIn: () => {
        // Drop queued agent audio immediately for a snappy handoff.
        this.playback?.clear();
        this.handlers.onBargeIn?.();
      },

      onTranscript: (frame: OmniServerFrame) => {
        const t = frame as OmniTranscriptFrame;
        if (typeof t.text !== "string") return;
        this.handlers.onTranscript?.({
          role: t.role === "user" ? "user" : "assistant",
          text: t.text,
          final: Boolean(t.final),
        });
      },

      onToolCall: (frame: OmniToolCallFrame) => {
        this.handlers.onToolCall?.({
          callId: frame.call_id,
          name: frame.name,
          arguments: frame.arguments ?? {},
        });
      },

      onSessionEnd: () => {
        this.finalise("session ended by engine");
      },

      onError: (err) => {
        const error =
          err instanceof Error
            ? err
            : new Error(
                `PyAI frame error: ${JSON.stringify(err).slice(0, 200)}`
              );
        this.setState({ connection: "error" });
        this.handlers.onError?.(error);
      },

      onClose: (code, reason) => {
        this.finalise(reason || `socket closed (${code})`);
      },
    });

    this.connection = connection;

    if (this.options.createPlayback) {
      this.playback = await this.options.createPlayback();
    }
    if (this.options.startMicrophone) {
      try {
        this.stopMic = await this.options.startMicrophone((pcm) => {
          connection.sendAudio(pcm);
        });
      } catch (err) {
        /*
         * The PyAI session is live; only capture failed. Reporting this as a
         * connection failure would offer the user demo mode for a problem that
         * has nothing to do with the provider — and would claim PyAI is down
         * when it is connected. Flagged distinctly instead, session kept open
         * so the user can grant permission and retry.
         */
        const reason = err instanceof Error ? err.message : String(err);
        this.handlers.onError?.(
          new Error(`${MIC_BLOCKED}: ${reason}`)
        );
      }
    }
  }

  private async enqueueAudio(chunk: ArrayBuffer | ArrayBufferView | Blob) {
    if (!this.playback) return;
    if (chunk instanceof Blob) {
      this.playback.push(await chunk.arrayBuffer());
      return;
    }
    if (ArrayBuffer.isView(chunk)) {
      const view = chunk as ArrayBufferView;
      this.playback.push(
        view.buffer.slice(
          view.byteOffset,
          view.byteOffset + view.byteLength
        ) as ArrayBuffer
      );
      return;
    }
    this.playback.push(chunk);
  }

  /**
   * Omni is a conversational engine: the persona speaks on its own turns. We
   * steer it with grounding facts rather than by injecting synthetic speech,
   * which would fight the model's turn-taking.
   */
  async say(text: string): Promise<void> {
    this.requireConnection().send({
      type: "context",
      query: "next_instruction",
      facts: { instruction: text },
    });
  }

  async pushContext(packet: Record<string, unknown>): Promise<void> {
    this.requireConnection().send({
      type: "context",
      query: "guidance_state",
      facts: packet,
    });
  }

  async respondToTool(callId: string, result: unknown): Promise<void> {
    this.requireConnection().toolResult(callId, { result });
  }

  async respondToToolError(callId: string, message: string): Promise<void> {
    this.requireConnection().toolResult(callId, { error: message });
  }

  async disconnect(reason: string): Promise<void> {
    this.connection?.close(1000, reason.slice(0, 120));
    this.finalise(reason);
  }

  private finalise(reason: string) {
    if (this.state.connection === "closed") return;
    this.setState({
      minutes: this.currentMinutes(),
      connection: "closed",
      disconnectReason: reason,
    });
    this.connectedAtMs = null;
    this.stopMic?.();
    this.stopMic = null;
    this.playback?.stop();
    this.playback = null;
    this.connection = null;
  }

  private requireConnection(): OmniConnection {
    if (!this.connection) throw new Error("PyAI session is not connected");
    return this.connection;
  }
}
