import { describe, expect, it, vi } from "vitest";
import type { AgentSessionConfig } from "@deepgram/agents";
import { DeepgramVoiceAdapter, MIC_BLOCKED } from "./deepgram";

class FakeSession {
  state = "idle";
  handlers = new Map<string, Array<(...args: any[]) => void>>();
  agentMessages: string[] = [];
  prompts: string[] = [];
  toolResponses: Array<{ id?: string; name: string; content: string }> = [];
  audio: ArrayBuffer[] = [];

  on(event: string, handler: (...args: any[]) => void) {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  emit(event: string, ...args: any[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }

  async connect() {
    this.state = "connecting";
    this.emit("connecting");
    this.state = "connected";
    this.emit("connected");
    this.emit("welcome", { session_id: "dg_session_1" });
  }

  disconnect() {
    this.state = "disconnected";
    this.emit("disconnected", "client closed");
  }

  sendAudio(data: ArrayBuffer) {
    this.audio.push(data);
  }

  injectAgentMessage(message: string) {
    this.agentMessages.push(message);
  }

  updatePrompt(prompt: string) {
    this.prompts.push(prompt);
  }

  sendFunctionCallResponse(id: string | undefined, name: string, content: string) {
    this.toolResponses.push({ id, name, content });
  }

  getId() {
    return "dg_session_1";
  }
}

const tokenFetch = vi.fn(async () =>
  new Response(
    JSON.stringify({
      token: "temporary.jwt.value",
      expiresIn: 60,
      models: {
        listen: "flux-general-en",
        think: "gpt-4o-mini",
        speak: "aura-2-thalia-en",
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  )
);

describe("DeepgramVoiceAdapter", () => {
  it("connects with a temporary token and maps transcripts and tools", async () => {
    const session = new FakeSession();
    let config: AgentSessionConfig | null = null;
    let onAudio: ((data: ArrayBuffer) => void) | null = null;
    const microphone = { start: vi.fn(async () => {}), stop: vi.fn() };
    const player = { queue: vi.fn(), interrupt: vi.fn(), dispose: vi.fn() };
    const transcripts: Array<{ role: string; text: string; final: boolean }> = [];
    const tools: Array<{ callId: string; name: string; arguments: object }> = [];

    const adapter = new DeepgramVoiceAdapter({
      fetchImpl: tokenFetch as unknown as typeof fetch,
      createSession: (value) => {
        config = value;
        return session;
      },
      createMicrophone: (callback) => {
        onAudio = callback;
        return microphone;
      },
      createPlayer: () => player,
    });

    await adapter.connect({
      persona: "Guide the user and wait for proof.",
      greeting: "Hello",
      tools: [
        {
          name: "request_verification",
          description: "Check the current postcondition",
          parameters: { type: "object", properties: {} },
        },
      ],
      handlers: {
        onTranscript: (frame) => transcripts.push(frame),
        onToolCall: (call) => tools.push(call),
      },
    });

    expect(adapter.proof).toMatchObject({
      provider: "deepgram",
      sessionId: "dg_session_1",
      connection: "connected",
      isRealVoice: true,
    });
    expect(config).not.toBeNull();
    expect("apiKey" in (config!.auth as object)).toBe(false);
    expect(JSON.stringify(config)).not.toContain("temporary.jwt.value");
    expect(microphone.start).toHaveBeenCalledOnce();

    const chunk = new ArrayBuffer(8);
    onAudio!(chunk);
    expect(session.audio).toEqual([chunk]);

    session.emit("conversation-text", {
      role: "user",
      content: "I need help",
    });
    expect(transcripts).toEqual([
      { role: "user", text: "I need help", final: true },
    ]);

    session.emit("function-call-request", {
      functions: [
        {
          id: "fc_1",
          name: "request_verification",
          arguments: '{"source":"voice"}',
          client_side: true,
        },
      ],
    });
    expect(tools).toEqual([
      {
        callId: "fc_1",
        name: "request_verification",
        arguments: { source: "voice" },
      },
    ]);

    await adapter.respondToTool("fc_1", { passed: false });
    expect(session.toolResponses).toEqual([
      {
        id: "fc_1",
        name: "request_verification",
        content: '{"result":{"passed":false}}',
      },
    ]);
  });

  it("injects instructions, updates context, plays audio, and handles barge-in", async () => {
    const session = new FakeSession();
    const player = { queue: vi.fn(), interrupt: vi.fn(), dispose: vi.fn() };
    const onBargeIn = vi.fn();
    const adapter = new DeepgramVoiceAdapter({
      fetchImpl: tokenFetch as unknown as typeof fetch,
      createSession: () => session,
      createMicrophone: () => ({ start: async () => {}, stop: vi.fn() }),
      createPlayer: () => player,
    });

    await adapter.connect({
      persona: "Guide carefully.",
      handlers: { onBargeIn },
    });
    await adapter.say("Choose Sales.");
    await adapter.pushContext({ step: "assign-team", missing: ["Sales"] });

    expect(session.agentMessages).toEqual(["Choose Sales."]);
    expect(session.prompts[0]).toContain('"step":"assign-team"');

    const audio = new ArrayBuffer(16);
    session.emit("audio", audio);
    session.emit("user-started-speaking", {});
    expect(player.queue).toHaveBeenCalledWith(audio);
    expect(player.interrupt).toHaveBeenCalledOnce();
    expect(onBargeIn).toHaveBeenCalledOnce();
  });

  it("keeps a live provider session open when only microphone access fails", async () => {
    const session = new FakeSession();
    const onError = vi.fn();
    const adapter = new DeepgramVoiceAdapter({
      fetchImpl: tokenFetch as unknown as typeof fetch,
      createSession: () => session,
      createMicrophone: () => ({
        start: async () => {
          throw new Error("permission denied");
        },
        stop: vi.fn(),
      }),
      createPlayer: () => ({ queue: vi.fn(), interrupt: vi.fn(), dispose: vi.fn() }),
    });

    await adapter.connect({ persona: "Guide.", handlers: { onError } });

    expect(adapter.proof.connection).toBe("connected");
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: `${MIC_BLOCKED}: permission denied` })
    );
  });
});
