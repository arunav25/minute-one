import type { FlowDefinition, FlowStep } from "@minute-one/core";
import type { Product } from "./product-store";
import { hasKnowledgeBase } from "./knowledge-store";

/**
 * Compiles a product into the runtime config the embedded script consumes.
 *
 * Two things come out of it:
 *
 *   1. A persona grounded in the product's knowledge base. This is what lets
 *      the guide answer "what is a ring group?" without inventing an answer.
 *   2. A flow, if the product has an authored journey. Without steps there is
 *      nothing to verify, so the script runs in `answer` mode and says so —
 *      an assistant, not verified onboarding. The distinction is reported
 *      rather than blurred, because the verification gate is the product.
 */

export type RuntimeConfig = {
  productId: string;
  productName: string;
  mode: "guided" | "answer";
  /** Present only in guided mode. The first of `flows`. */
  flow: FlowDefinition | null;
  /**
   * Every authored journey. The guide picks between them by what the user
   * asks for — "add a number" and "send a message" are different paths, not
   * different steps, and choosing wrongly wastes the user's whole session.
   */
  flows: FlowDefinition[];
  persona: string;
  /** Titles only — proof of what grounded the answer, without shipping it all. */
  knowledgeTitles: string[];
  /**
   * True when this product has an ingested, embedded corpus. The agent is then
   * told to retrieve with `search_knowledge` per question rather than reading a
   * knowledge base stuffed into the prompt — the only thing that scales past a
   * handful of hand-written notes.
   */
  knowledgeSearch: boolean;
};

const MAX_KB_CHARS = 6000;

function buildPersona(
  product: Product,
  mode: RuntimeConfig["mode"],
  knowledgeSearch: boolean
): string {
  const rules = [
    `You are Minute One, a concise voice guide embedded in ${product.name}.`,
    "",
    knowledgeSearch
      ? "When the user asks a product or how-to question, call the search_knowledge tool with their question and answer only from the passages it returns. If it returns nothing useful, say plainly that you do not have that information — do not guess, and do not offer to fetch a human, because you cannot. Never invent a feature, a price, a button, a menu item, or an account state."
      : "Answer only from the knowledge below. If the answer is not there, say plainly that you do not have that information — do not guess, and do not offer to fetch a human, because you cannot. Never invent a feature, a price, a button, a menu item, or an account state.",
    "",
    /*
     * Where the user already is.
     *
     * This guide runs inside the product, on the screen of somebody who is
     * signed in. Help-center articles are written for a reader who is not:
     * they open with creating an account, logging in, or "head over to the
     * dashboard". Read back verbatim, that tells a signed-in user to log in
     * again — which is how the guide first sounded on the Get Started page.
     */
    `The user is already signed in to ${product.name} and is looking at it right now — you are running inside the product, on their screen.`,
    "Retrieved articles are written for someone who has not signed in yet. Skip any step about creating an account, logging in, or opening the app, and start from the first step they have not already done. Never tell them to log in or to open the dashboard.",
    "",
    "Keep spoken answers under 35 words. One question per turn.",
  ];

  if (mode === "guided") {
    rules.push(
      "",
      "While guiding: give exactly one action at a time, at most 18 words. The",
      "session controller decides whether a step passed — never say an action",
      "succeeded before it reports verification passed. On a failed check you are",
      "given the missing evidence and a recovery mode; use them, and do not",
      "repeat your previous instruction word for word."
    );
  } else {
    rules.push(
      "",
      "This product has no authored journey, so you cannot claim a task is",
      "complete. Answer questions and describe what to do, but do not assert that",
      "anything has been verified."
    );
  }

  if (knowledgeSearch) {
    // No stuffed knowledge — it is retrieved on demand via search_knowledge.
    return rules.join("\n");
  }

  const knowledge = product.knowledge
    .map((k) => `### ${k.title}\n${k.body}`)
    .join("\n\n")
    .slice(0, MAX_KB_CHARS);

  return `${rules.join("\n")}\n\n## Knowledge base\n\n${
    knowledge || "(empty — say you have no information yet)"
  }`;
}

function compileStep(draft: Product["steps"][number], index: number): FlowStep {
  const success: FlowStep["success"] = { all: [] };
  if (draft.successRoute) {
    success.all!.push({ kind: "route_matches", value: draft.successRoute });
  }
  if (draft.successText) {
    success.all!.push({ kind: "visible_text", value: draft.successText });
  }
  // A step with no declared proof must never pass. An empty `all` group is
  // treated as unproven by the verifier, which is the behaviour we want.

  return {
    id: draft.id || `step-${index + 1}`,
    objective: draft.objective || `Step ${index + 1}`,
    target:
      draft.targetName || draft.targetSelector
        ? {
            label: draft.targetName || draft.objective,
            // Only claim a role when matching by name; a selector may point at
            // anything, and a wrong role stops it resolving at all.
            ...(draft.targetName
              ? { role: "button", name: draft.targetName }
              : {}),
            ...(draft.targetSelector ? { selector: draft.targetSelector } : {}),
          }
        : undefined,
    instruction: {
      primary: draft.instruction || `Continue to ${draft.objective}.`,
      recovery: [
        {
          mode: "recognition",
          text: draft.targetName
            ? `Look for the control labelled "${draft.targetName}".`
            : `Look again for what "${draft.objective}" needs.`,
        },
        {
          mode: "reset",
          text: "Return to where you started this step, then try once more.",
        },
      ],
    },
    success,
    timeoutSeconds: 30,
    maxAttempts: 3,
    sideEffect: "none",
  };
}

export async function compileProduct(product: Product): Promise<RuntimeConfig> {
  const mode: RuntimeConfig["mode"] =
    product.journeys.some((j) => j.steps.length > 0) ? "guided" : "answer";

  // Retrieve at answer time only when there is an ingested corpus to retrieve
  // from. Otherwise fall back to stuffing the hand-written notes into the prompt.
  const knowledgeSearch = await hasKnowledgeBase(product.key);

  const persona = buildPersona(product, mode, knowledgeSearch);
  const flows: FlowDefinition[] = product.journeys.map((j, i) => ({
    id: `${product.id}:${j.id || `journey-${i + 1}`}`,
    name: j.goal || `Get started with ${product.name}`,
    goalPhrases:
      j.goalPhrases.length > 0 ? j.goalPhrases : [j.goal || "get started"],
    maxSessionSeconds: 480,
    maxVoiceMinutes: 8,
    steps: j.steps.map(compileStep),
    persona,
  }));

  return {
    productId: product.id,
    productName: product.name,
    mode,
    flow: flows[0] ?? null,
    flows,
    persona,
    knowledgeTitles: product.knowledge.map((k) => k.title),
    knowledgeSearch,
  };
}
