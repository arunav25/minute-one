import type { FlowDefinition } from "@minute-one/core";
import { MinuteOne, type MinuteOneConfig } from "./sdk";
import {
  normaliseIdentity,
  type MinuteOneCompany,
  type MinuteOneUser,
} from "./identity";

/**
 * Booting from a product key.
 *
 * This is the path a host application actually uses: it knows a key, not a
 * flow. The key fetches the product's context and journey from Minute One, so
 * changing the knowledge base or the steps needs no redeploy of the host.
 *
 * The key is public by design — it selects context. It cannot authorise voice:
 * that is minted separately by the Minute One server, which holds the PyAI
 * secret.
 */

export type RuntimeConfig = {
  productId: string;
  productName: string;
  mode: "guided" | "answer";
  flow: FlowDefinition | null;
  persona: string;
  knowledgeTitles: string[];
};

export type BootOptions = {
  productKey: string;
  /** Where Minute One is hosted. Defaults to the script's own origin. */
  host?: string;
  helpNumber?: string;
  mount?: HTMLElement;
  /**
   * Who the host says is signed in. Reported with sessions so a run can be
   * traced to a real user; deliberately not handed to the voice provider.
   */
  user?: MinuteOneUser;
  company?: MinuteOneCompany;
  meta?: Record<string, unknown>;
  onStatusChange?: MinuteOneConfig["onStatusChange"];
  /** Adapter factories, so the host can inject a mock in tests. */
  createVoiceAdapter?: MinuteOneConfig["createVoiceAdapter"];
  createDemoAdapter?: MinuteOneConfig["createDemoAdapter"];
};

export async function fetchRuntimeConfig(
  productKey: string,
  host: string
): Promise<RuntimeConfig> {
  const res = await fetch(
    `${host.replace(/\/$/, "")}/api/minute-one/config?key=${encodeURIComponent(productKey)}`,
    { credentials: "omit" }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      body.error ?? `Minute One config request failed (${res.status})`
    );
  }
  return (await res.json()) as RuntimeConfig;
}

/**
 * A journey-less product still gets a guide, it just cannot verify anything.
 * Rather than pretend, the single step declares no success condition — which
 * the verifier treats as unproven — and the persona is told to say so.
 */
function answerOnlyFlow(config: RuntimeConfig): FlowDefinition {
  return {
    id: config.productId,
    name: `Ask about ${config.productName}`,
    goalPhrases: ["help", "question", "how do i", "what is"],
    maxSessionSeconds: 480,
    maxVoiceMinutes: 8,
    persona: config.persona,
    steps: [
      {
        id: "answer-mode",
        objective: `Answer questions about ${config.productName}`,
        instruction: {
          primary: "Ask me anything about this product.",
          recovery: [
            { mode: "recognition", text: "Tell me what you are trying to do." },
          ],
        },
        // No authored journey means no proof is available. Never claims success.
        success: {},
        timeoutSeconds: 60,
        maxAttempts: 1,
        sideEffect: "none",
      },
    ],
  };
}

export async function boot(options: BootOptions): Promise<MinuteOne> {
  const host = options.host ?? scriptOrigin();
  const config = await fetchRuntimeConfig(options.productKey, host);

  const flow = config.flow ?? answerOnlyFlow(config);
  if (config.flow && !config.flow.persona) config.flow.persona = config.persona;

  const { PyAIVoiceAdapter, createPlayback, startMicrophone } = await import(
    "@minute-one/voice-pyai"
  );

  const guide = new MinuteOne({
    flow,
    createVoiceAdapter:
      options.createVoiceAdapter ??
      (() =>
        new PyAIVoiceAdapter({
          // The product key travels with the mint request so the server can
          // check this page's origin against that product's allowlist. Without
          // it, a cross-origin endpoint would mint voice tokens for any caller.
          tokenEndpoint: `${host.replace(/\/$/, "")}/api/minute-one/session?key=${encodeURIComponent(
            options.productKey
          )}`,
          startMicrophone,
          createPlayback,
        })),
    createDemoAdapter: options.createDemoAdapter,
    eventsEndpoint: `${host.replace(/\/$/, "")}/api/minute-one/events`,
    productKey: options.productKey,
    identity: normaliseIdentity(options),
    reportUrl: `${host.replace(/\/$/, "")}/report`,
    helpNumber: options.helpNumber,
    mount: options.mount,
    onStatusChange: options.onStatusChange,
  });

  return guide.init();
}

/** The origin the bundle was served from — where Minute One lives. */
function scriptOrigin(): string {
  const el = document.currentScript as HTMLScriptElement | null;
  const src = el?.src ?? findOwnScript();
  if (!src) return window.location.origin;
  try {
    return new URL(src, window.location.href).origin;
  } catch {
    return window.location.origin;
  }
}

function findOwnScript(): string | null {
  const match = Array.from(document.scripts).find((s) =>
    s.src.includes("minute-one")
  );
  return match?.src ?? null;
}
