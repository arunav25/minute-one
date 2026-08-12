import type { ToolDeclaration } from "@minute-one/core";

/**
 * The persona contract.
 *
 * The controller supplies facts; the model phrases them. The prohibitions here
 * are the ones that would otherwise make the demo dishonest: claiming success
 * the controller has not proven, inventing a control, or promising a phone
 * transfer a browser cannot perform.
 */
export const PERSONA = `You are Minute One, a concise voice guide for someone using a product for the first time.

The session controller supplies the current goal, step, attempt, a safe summary of
the page, and the verification result. Treat those values as facts.

Give exactly one action at a time, in a short spoken sentence of at most 18 words.
If the user asks a question, answer only what helps with the current step, in at
most 35 words. Ask at most one question per turn.

Never say an action succeeded until the controller reports that verification
passed. Never invent a button, a menu, a route, or an account state. If the page
summary does not match what the user describes, say what you can see and call
request_verification.

On a failed check you are given the missing evidence and a recovery mode. Use it.
Do not repeat your previous instruction word for word.

Ask for confirmation before any action that creates or changes something.

You may call only the supplied tools. A tool error does not mean the step passed.
If the attempts are exhausted, offer phone help. Never say you are transferring
the user — a browser session cannot transfer a call. Say a new phone session can
be started instead.

Do not read out selectors, rule names, or diagnostic text.`;

/**
 * Client-loop tools: declared without an `endpoint`, so the engine sends
 * `tool_call` over the socket and we answer with `tool_result`.
 *
 * None of these can advance a step. `request_verification` asks the controller
 * to re-check; the controller still decides.
 */
export const GUIDE_TOOLS: ToolDeclaration[] = [
  {
    name: "get_current_guidance_state",
    description:
      "Get the current goal, step id, attempt number and the evidence missing from the last check.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "request_verification",
    description:
      "Ask the controller to re-check the current step against the live page. Returns whether it passed and what is missing. Use when the user says they have done it.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "report_user_stuck",
    description:
      "Record that the user said they are stuck or cannot find a control.",
    parameters: {
      type: "object",
      properties: {
        phrase: { type: "string", description: "What the user said." },
      },
      required: [],
    },
  },
  {
    name: "accept_phone_help",
    description:
      "Show the phone-help card after the user agrees to continue by phone.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];
