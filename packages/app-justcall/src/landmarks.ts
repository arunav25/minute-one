/**
 * Every JustCall-specific assumption in the product lives in this file.
 *
 * The core engine imports none of it. To point Minute One at a different
 * product, or at the real JustCall once labels are confirmed, edit here and
 * nothing else.
 *
 * ⚠️ Values marked ASSUMED have not been verified against a real JustCall
 * account. See LABELS_TO_CONFIRM.md.
 */

export const JUSTCALL_LANDMARKS = {
  routes: {
    /** ASSUMED */
    dashboard: "/fixture",
    /** ASSUMED */
    phoneNumbers: "/fixture/phone-numbers",
    /** ASSUMED */
    numberSetup: "/fixture/phone-numbers/new",
  },

  nav: {
    /** ASSUMED — sidebar item that opens number management. */
    phoneNumbers: "Phone Numbers",
    /** ASSUMED — the decoy a confused user reaches for. */
    settings: "Settings",
  },

  controls: {
    /** ASSUMED */
    addNumber: "Add Number",
    /** ASSUMED */
    country: "Country",
    /** ASSUMED */
    chooseNumber: "Choose this number",
    /** ASSUMED */
    assignTeam: "Assign to team",
    /** ASSUMED */
    teamSales: "Sales",
    /** ASSUMED — the wrong option in the deliberate-failure branch. */
    teamSupport: "Support",
    /** ASSUMED */
    confirm: "Confirm setup",
  },

  text: {
    /** ASSUMED */
    phoneNumbersHeading: "Phone Numbers",
    /** ASSUMED */
    setupDialog: "Add a number",
    /** ASSUMED */
    reviewHeading: "Review",
    /** ASSUMED */
    successNotice: "Number is live",
  },
} as const;

/** Human-readable provenance, rendered in the UI disclosure panel. */
export const LANDMARK_PROVENANCE = {
  status: "assumed",
  note: "Fixture labels chosen to mirror a plausible JustCall flow. Replace with confirmed staging labels before running against a real account.",
  confirmFile: "LABELS_TO_CONFIRM.md",
} as const;
