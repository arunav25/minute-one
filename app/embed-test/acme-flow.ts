import type { FlowDefinition } from "@minute-one/core";

/**
 * A small, generic journey for the demo surface.
 *
 * This is NOT a product Minute One ships — it is a stand-in "beta product" the
 * guide can run against with zero setup, so the verification gate can be shown
 * (and tested) end to end without the JustCall stack. It targets Acme
 * Scheduling, a made-up scheduling app, precisely because it is *not* JustCall:
 * the engine is generic, and the same flow shape works on any product.
 *
 * The one thing that matters is the wrong/right branch on the team step. The
 * product happily lets you pick the wrong team; the guide is what has to
 * notice, and no step advances until its success condition is actually
 * observed on the page.
 */
export const acmeBookingFlow: FlowDefinition = {
  id: "acme-booking",
  name: "Create your first booking",
  goalPhrases: [
    "booking",
    "book",
    "schedule",
    "appointment",
    "create a booking",
    "set up a booking",
  ],
  maxSessionSeconds: 480,
  maxVoiceMinutes: 8,
  persona: [
    "You are guiding a new user through creating their first booking in Acme",
    "Scheduling. Give one short instruction at a time and wait. Refer to",
    "controls by the words on screen. Never say a step is done — a separate",
    "gate decides that. If the user seems stuck, offer a different way to find",
    "the control, and never repeat the same sentence twice.",
  ].join(" "),
  steps: [
    {
      id: "open-booking",
      objective: "Open the booking panel",
      target: { label: "New booking", role: "button", name: "New booking" },
      instruction: {
        primary: "Choose New booking to open the booking panel.",
        recovery: [
          {
            mode: "location",
            text: "New booking is the button at the top right of the page.",
          },
          {
            mode: "recognition",
            text: 'Look for the words "New booking" and select it.',
          },
        ],
      },
      // A panel only appears after the click; its heading is not on the page
      // before it.
      success: { all: [{ kind: "dialog_present", value: "New booking" }] },
      timeoutSeconds: 30,
      maxAttempts: 3,
      sideEffect: "none",
    },
    {
      id: "assign-team",
      objective: "Assign the booking to the Sales team",
      target: {
        label: "Sales",
        role: "button",
        name: "Sales",
        within: { role: "dialog", name: "New booking" },
      },
      instruction: {
        primary: "Assign the booking to the Sales team.",
        recovery: [
          {
            mode: "recognition",
            text: "Two teams are offered. Support is selected — choose Sales instead.",
          },
          {
            mode: "location",
            text: "Sales is the first of the two team buttons in the panel.",
          },
          {
            mode: "reset",
            text: "Clear the current team, then pick Sales.",
          },
        ],
      },
      // Only Sales being selected passes. Choosing Support — which the product
      // allows — leaves this unproven.
      success: {
        all: [{ kind: "control_state", value: "Sales", state: "selected" }],
      },
      timeoutSeconds: 30,
      maxAttempts: 3,
      sideEffect: "none",
    },
    {
      id: "confirm-booking",
      objective: "Confirm and prove the booking exists",
      target: {
        label: "Confirm booking",
        role: "button",
        name: "Confirm booking",
        within: { role: "dialog", name: "New booking" },
      },
      instruction: {
        primary: "Choose Confirm booking to finish.",
        recovery: [
          {
            mode: "location",
            text: "Confirm booking is at the bottom of the panel.",
          },
          {
            mode: "recognition",
            text: 'After confirming you should see "Booking confirmed".',
          },
        ],
      },
      // A notice that can only appear after confirming — a click alone never
      // satisfies it.
      success: { all: [{ kind: "notice_present", value: "Booking confirmed" }] },
      timeoutSeconds: 30,
      maxAttempts: 3,
      sideEffect: "creates",
    },
  ],
};
