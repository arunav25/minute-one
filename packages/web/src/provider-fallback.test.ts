// @vitest-environment happy-dom
import { expect, test, vi } from "vitest";
import { MinuteOne } from "./sdk";
import type { VoiceAdapter, VoiceProviderProof } from "@minute-one/core";

/**
 * Provider fallback.
 *
 * The claim is that a vendor being unreachable costs a fallback, not the
 * session — and that whatever actually connected is what gets reported. A
 * session that quietly recorded the provider it *tried* would make the console's
 * proof worthless, so both halves are pinned here.
 */
function adapter(name: string, opts: { fails?: boolean } = {}): VoiceAdapter {
  const proof: VoiceProviderProof = {
    provider: name,
    model: "m",
    sessionId: `${name}_1`,
    connection: "idle",
    minutes: 0,
    disconnectReason: null,
    fallbackReason: null,
    isRealVoice: true,
  };
  return {
    get proof() {
      return proof;
    },
    async connect() {
      if (opts.fails) throw new Error(`${name} refused the socket`);
      proof.connection = "connected";
    },
    async say() {},
    async pushContext() {},
    async respondToTool() {},
    async respondToToolError() {},
    async disconnect() {},
  };
}

const flow = {
  id: "f",
  name: "Test",
  goalPhrases: ["test"],
  maxSessionSeconds: 60,
  maxVoiceMinutes: 1,
  steps: [
    {
      id: "s1",
      objective: "o",
      instruction: { primary: "do it", recovery: [{ mode: "reset" as const, text: "again" }] },
      success: { all: [{ kind: "visible_text" as const, value: "never" }] },
      timeoutSeconds: 1,
      maxAttempts: 1,
      sideEffect: "none" as const,
    },
  ],
};

test("falls through to the next provider when the first refuses", async () => {
  const second = adapter("deepgram");
  const guide = new MinuteOne({
    flow,
    voiceProviders: ["pyai", "deepgram"],
    createVoiceAdapterFor: [
      async () => adapter("pyai", { fails: true }),
      async () => second,
    ],
    eventsEndpoint: null,
  }).init();

  await guide.start();

  // The session runs, and reports the provider that actually connected.
  expect(guide.getStatus().voice?.provider).toBe("deepgram");
  expect(guide.getStatus().connectionError).toBeNull();
  await guide.destroy();
});

test("the first provider is used when it connects, and the rest are never built", async () => {
  const secondFactory = vi.fn(async () => adapter("deepgram"));
  const guide = new MinuteOne({
    flow,
    voiceProviders: ["pyai", "deepgram"],
    createVoiceAdapterFor: [async () => adapter("pyai"), secondFactory],
    eventsEndpoint: null,
  }).init();

  await guide.start();

  expect(guide.getStatus().voice?.provider).toBe("pyai");
  expect(secondFactory).not.toHaveBeenCalled();
  await guide.destroy();
});

test("every provider failing surfaces each reason, and nothing claims to be running", async () => {
  const guide = new MinuteOne({
    flow,
    voiceProviders: ["pyai", "deepgram"],
    createVoiceAdapterFor: [
      async () => adapter("pyai", { fails: true }),
      async () => adapter("deepgram", { fails: true }),
    ],
    eventsEndpoint: null,
  }).init();

  await guide.start();

  const s = guide.getStatus();
  expect(s.running).toBe(false);
  expect(s.connectionError).toContain("pyai");
  expect(s.connectionError).toContain("deepgram");
  await guide.destroy();
});
