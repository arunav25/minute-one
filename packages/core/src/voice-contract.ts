/**
 * The voice provider contract.
 *
 * The engine talks to this and nothing else. Swapping providers must not touch
 * `src/core`. Note what is deliberately absent: there is no way for an adapter
 * to report that a step succeeded. Providers speak and listen; the controller
 * decides.
 */

export type VoiceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

/**
 * Displayed to the user and written to the event log, so a demo can never
 * quietly be running on something other than what it claims.
 */
export type VoiceProviderProof = {
  /** "pyai" | "mock" — the literal provider in use. */
  provider: string;
  /** Model or PyAI surface, e.g. "omni-realtime". */
  model: string;
  /** Provider-issued session/call id, when supplied. */
  sessionId: string | null;
  connection: VoiceConnectionState;
  /** Voice minutes consumed so far. */
  minutes: number;
  /** Set once the socket closes. */
  disconnectReason: string | null;
  /**
   * Populated only when the user explicitly chose demo mode after a real
   * failure. Never set by an automatic downgrade.
   */
  fallbackReason: string | null;
  /** False for anything that is not genuine provider audio. */
  isRealVoice: boolean;
};

export type TranscriptFrame = {
  role: "user" | "assistant";
  text: string;
  final: boolean;
};

export type ToolCall = {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type VoiceAdapterEvents = {
  onTranscript?: (frame: TranscriptFrame) => void;
  onToolCall?: (call: ToolCall) => void;
  onBargeIn?: () => void;
  onStateChange?: (proof: VoiceProviderProof) => void;
  onError?: (error: Error) => void;
};

export type ToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type VoiceConnectOptions = {
  persona: string;
  greeting?: string;
  voiceId?: string;
  language?: string;
  tools?: ToolDeclaration[];
  handlers: VoiceAdapterEvents;
};

export interface VoiceAdapter {
  readonly proof: VoiceProviderProof;
  connect(options: VoiceConnectOptions): Promise<void>;
  /** Speak a line. Implementations must honour barge-in. */
  say(text: string): Promise<void>;
  /** Push grounding facts without speaking. */
  pushContext(packet: Record<string, unknown>): Promise<void>;
  /** Answer a tool_call the model raised. */
  respondToTool(callId: string, result: unknown): Promise<void>;
  respondToToolError(callId: string, message: string): Promise<void>;
  disconnect(reason: string): Promise<void>;
}
