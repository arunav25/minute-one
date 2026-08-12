import type { FlowDefinition } from "@minute-one/core";
import { JUSTCALL_LANDMARKS as L } from "./landmarks";
import { GUIDE_TOOLS, PERSONA } from "./persona";

/**
 * The one hackathon flow: set up a phone number for a sales team.
 *
 * Every step declares what counts as proof. The controller cannot advance
 * without it, which is the whole product. Note step 5: a resource-creating
 * step requires two independent signals, so a single click can never complete
 * the journey.
 */
export const setupSalesNumberFlow: FlowDefinition = {
  id: "setup-sales-number",
  name: "Set up a number for a sales team",
  goalPhrases: [
    "phone number",
    "set up a number",
    "sales number",
    "buy a number",
    "new number",
  ],
  maxSessionSeconds: 480,
  maxVoiceMinutes: 8,
  persona: PERSONA,
  tools: GUIDE_TOOLS,
  steps: [
    {
      id: "open-phone-numbers",
      objective: "Reach the phone-number area",
      target: {
        label: L.nav.phoneNumbers,
        role: "button",
        name: L.nav.phoneNumbers,
      },
      instruction: {
        primary: `Open ${L.nav.phoneNumbers} from the left navigation.`,
        recovery: [
          {
            mode: "location",
            text: `Look at the left sidebar. ${L.nav.phoneNumbers} sits above ${L.nav.settings} — choose that one.`,
          },
          {
            mode: "recognition",
            text: `You want the item labelled exactly "${L.nav.phoneNumbers}". The page it opens is headed the same way.`,
          },
          {
            mode: "reset",
            text: "Go back to the dashboard, then pick Phone Numbers from the sidebar.",
          },
        ],
      },
      preconditions: { all: [{ kind: "route_matches", value: "/fixture*" }] },
      success: {
        all: [
          { kind: "route_matches", value: `${L.routes.phoneNumbers}*` },
          { kind: "visible_text", value: L.text.phoneNumbersHeading },
        ],
      },
      timeoutSeconds: 25,
      maxAttempts: 3,
      sideEffect: "none",
    },

    {
      id: "start-add-number",
      objective: "Open the number setup dialog",
      target: { label: L.controls.addNumber, role: "button", name: L.controls.addNumber },
      instruction: {
        primary: `Choose ${L.controls.addNumber} to start setting one up.`,
        recovery: [
          {
            mode: "location",
            text: `The ${L.controls.addNumber} button is at the top right of the numbers list.`,
          },
          {
            mode: "recognition",
            text: `Look for a button reading "${L.controls.addNumber}". A panel titled "${L.text.setupDialog}" should open.`,
          },
          {
            mode: "reset",
            text: "If a panel is already open, close it and choose Add Number again.",
          },
        ],
      },
      preconditions: {
        all: [{ kind: "route_matches", value: `${L.routes.phoneNumbers}*` }],
      },
      success: { all: [{ kind: "dialog_present", value: L.text.setupDialog }] },
      timeoutSeconds: 25,
      maxAttempts: 3,
      sideEffect: "none",
    },

    {
      id: "choose-number",
      objective: "Pick a number to set up",
      target: {
        label: L.controls.chooseNumber,
        role: "button",
        name: L.controls.chooseNumber,
        // Scoped: the same label repeats per row, and only the one inside the
        // open dialog is the control the user is being sent to.
        within: { role: "dialog", name: L.text.setupDialog },
      },
      instruction: {
        primary: "Pick any available number from the list.",
        recovery: [
          {
            mode: "location",
            text: "The available numbers are listed inside the panel. Choose any row.",
          },
          {
            mode: "recognition",
            text: `Each row has a "${L.controls.chooseNumber}" action. Select one and the team step appears.`,
          },
          {
            mode: "reset",
            text: "Close the panel and reopen Add Number, then pick a number.",
          },
        ],
      },
      // Two DOM signals that a number was actually selected. Deliberately not
      // "Confirm is disabled": a user who picks a team early would then be
      // unable to satisfy this step at all.
      success: {
        all: [
          { kind: "visible_text", value: L.text.reviewHeading },
          { kind: "visible_text", value: L.controls.assignTeam },
        ],
      },
      timeoutSeconds: 25,
      maxAttempts: 3,
      sideEffect: "none",
    },

    {
      id: "assign-sales-team",
      objective: "Assign the number to the sales team",
      target: {
        label: L.controls.teamSales,
        role: "button",
        name: L.controls.teamSales,
        within: { role: "dialog", name: L.text.setupDialog },
      },
      instruction: {
        primary: `Assign it to the ${L.controls.teamSales} team.`,
        recovery: [
          {
            mode: "recognition",
            text: `Two teams are offered. ${L.controls.teamSupport} is selected — choose ${L.controls.teamSales} instead.`,
          },
          {
            mode: "location",
            text: `${L.controls.teamSales} is the first option in the team list, directly under "${L.controls.assignTeam}".`,
          },
          {
            mode: "reset",
            text: "Clear the current team selection, then pick Sales.",
          },
        ],
      },
      success: {
        all: [
          {
            kind: "control_state",
            value: L.controls.teamSales,
            state: "selected",
          },
          {
            kind: "control_state",
            value: L.controls.confirm,
            state: "enabled",
          },
        ],
      },
      timeoutSeconds: 30,
      maxAttempts: 3,
      sideEffect: "none",
    },

    {
      id: "confirm-setup",
      objective: "Confirm and prove the number is live",
      target: {
        label: L.controls.confirm,
        role: "button",
        name: L.controls.confirm,
        within: { role: "dialog", name: L.text.setupDialog },
      },
      instruction: {
        primary: `Choose ${L.controls.confirm} to finish.`,
        recovery: [
          {
            mode: "location",
            text: `${L.controls.confirm} is at the bottom right of the panel.`,
          },
          {
            mode: "recognition",
            text: `After confirming you should see "${L.text.successNotice}" and the number listed against Sales.`,
          },
          {
            mode: "reset",
            text: "If the panel closed without saving, reopen Add Number and repeat the last two steps.",
          },
        ],
      },
      // Two independent signals: a success notice AND the resulting row.
      // A click alone can never satisfy this.
      success: {
        all: [
          { kind: "notice_present", value: L.text.successNotice },
          { kind: "visible_text", value: L.controls.teamSales },
          { kind: "route_matches", value: `${L.routes.phoneNumbers}*` },
        ],
      },
      timeoutSeconds: 30,
      maxAttempts: 3,
      sideEffect: "creates",
    },
  ],
};
