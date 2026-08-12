import type { FlowDefinition, FlowStep } from "@minute-one/core";
import type { Product } from "./product-store";

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
  /** Present only in guided mode. */
  flow: FlowDefinition | null;
  persona: string;
  /** Titles only — proof of what grounded the answer, without shipping it all. */
  knowledgeTitles: string[];
};

const MAX_KB_CHARS = 6000;

function buildPersona(product: Product, mode: RuntimeConfig["mode"]): string {
  const knowledge = product.knowledge
    .map((k) => `### ${k.title}\n${k.body}`)
    .join("\n\n")
    .slice(0, MAX_KB_CHARS);

  const rules = [
    `You are Minute One, a concise voice guide embedded in ${product.name}.`,
    "",
    "Answer only from the knowledge below. If the answer is not there, say you",
    "do not know and offer to connect the user to a person. Never invent a",
    "feature, a price, a button, or an account state.",
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
    target: draft.targetName
      ? { label: draft.targetName, role: "button", name: draft.targetName }
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

export function compileProduct(product: Product): RuntimeConfig {
  const mode: RuntimeConfig["mode"] =
    product.steps.length > 0 ? "guided" : "answer";

  const flow: FlowDefinition | null =
    mode === "guided"
      ? {
          id: product.id,
          name: product.goal || `Get started with ${product.name}`,
          goalPhrases:
            product.goalPhrases.length > 0
              ? product.goalPhrases
              : [product.goal || "get started"],
          maxSessionSeconds: 480,
          maxVoiceMinutes: 8,
          steps: product.steps.map(compileStep),
          persona: buildPersona(product, mode),
        }
      : null;

  return {
    productId: product.id,
    productName: product.name,
    mode,
    flow,
    persona: buildPersona(product, mode),
    knowledgeTitles: product.knowledge.map((k) => k.title),
  };
}
