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
 * that is minted separately by the Minute One server, which holds the provider
 * secret.
 */

export type RuntimeConfig = {
  productId: string;
  productName: string;
  mode: "guided" | "answer";
  flow: FlowDefinition | null;
  /** Every authored journey; the guide chooses by what the user asks for. */
  flows?: FlowDefinition[];
  persona: string;
  knowledgeTitles: string[];
  /** True when the product has an ingested corpus to retrieve from. */
  knowledgeSearch?: boolean;
  /** Voice providers the server can mint for, in preference order. */
  voiceProviders?: string[];
};

/**
 * The tool the agent calls to look something up. Declared here (not in core)
 * because whether a product has a searchable corpus is product knowledge. The
 * engine still never lets a tool result advance a step.
 */
const SEARCH_KNOWLEDGE_TOOL = {
  name: "search_knowledge",
  description:
    "Look up help-center articles for this product to answer a user's question. Call it whenever the user asks how something works or how to do something, then answer only from the passages returned.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The user's question, in their own words.",
      },
    },
    required: ["query"],
  },
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

  // When the product has an ingested corpus, give the agent the retrieval tool
  // and the endpoint to call. Both are absent otherwise, so nothing changes for
  // a product that only has hand-written notes.
  const flows = config.flows?.length ? config.flows : [flow];
  if (config.knowledgeSearch) {
    for (const f of flows) f.tools = [...(f.tools ?? []), SEARCH_KNOWLEDGE_TOOL];
  }
  const knowledgeSearchEndpoint = config.knowledgeSearch
    ? `${host.replace(/\/$/, "")}/api/minute-one/knowledge/search?key=${encodeURIComponent(
        options.productKey
      )}`
    : undefined;

  /*
   * Voice providers, in the order the server prefers them.
   *
   * Each entry is a factory, not an instance: an adapter is only constructed
   * when its turn comes, so an unused vendor's module is never even loaded.
   * The SDK walks the list and stops at the first socket that opens — a vendor
   * being down degrades the session to the next one instead of ending it.
   */
  const wanted = config.voiceProviders?.length
    ? config.voiceProviders
    : ["deepgram"];
  const tokenUrl = (provider: string) =>
    `${host.replace(/\/$/, "")}/api/minute-one/session?key=${encodeURIComponent(
      options.productKey
    )}&provider=${provider}`;

  const factories = wanted.map((provider) => async () => {
    if (provider === "pyai") {
      const { PyAIVoiceAdapter } = await import("@minute-one/voice-pyai");
      return new PyAIVoiceAdapter({ tokenEndpoint: tokenUrl("pyai") });
    }
    const { DeepgramVoiceAdapter } = await import("@minute-one/voice-deepgram");
    return new DeepgramVoiceAdapter({ tokenEndpoint: tokenUrl("deepgram") });
  });

  const guide = new MinuteOne({
    flow,
    flows,
    // The product key travels with every mint request so the server can check
    // this page's origin against that product's allowlist. Without it, a
    // cross-origin endpoint would mint voice tokens for any caller.
    createVoiceAdapter: options.createVoiceAdapter,
    voiceProviders: options.createVoiceAdapter ? undefined : wanted,
    createVoiceAdapterFor: options.createVoiceAdapter ? undefined : factories,
    createDemoAdapter: options.createDemoAdapter,
    eventsEndpoint: `${host.replace(/\/$/, "")}/api/minute-one/events`,
    knowledgeSearchEndpoint,
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
