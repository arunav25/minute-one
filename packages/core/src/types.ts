/**
 * Core engine contracts.
 *
 * Nothing in this file may reference a specific product (JustCall) or a
 * specific voice provider. Application knowledge lives in
 * `src/apps/*`; provider knowledge lives in `src/providers/*`.
 */

// ---------------------------------------------------------------------------
// Page state
// ---------------------------------------------------------------------------

export type ControlState =
  | "enabled"
  | "disabled"
  | "selected"
  | "expanded"
  | "checked";

export type ObservedControl = {
  id: string;
  role: string;
  name: string;
  state?: ControlState;
};

export type ObservedNotice = {
  kind: "success" | "error" | "info";
  text: string;
};

/**
 * A redacted, semantic view of what the user can currently see. Deliberately
 * small: it is the only page data that may be sent to a model.
 */
export type PageSnapshot = {
  url: string;
  route: string;
  title: string;
  headings: string[];
  controls: ObservedControl[];
  dialogs: string[];
  notices: ObservedNotice[];
  /**
   * Redacted, clamped visible body text. Needed because real products put
   * meaningful labels in plain paragraphs, not only in headings and controls.
   * Used for matching; never sent to a model wholesale.
   */
  text: string;
  /** Stable hash of the visible state; equivalent states share a fingerprint. */
  fingerprint: string;
  observedAt: string;
};

// ---------------------------------------------------------------------------
// Flow definition
// ---------------------------------------------------------------------------

/**
 * The four evidence classes, in ascending order of strength.
 *
 * `dom` and `url` are implemented. `host_event` and `backend_event` are live
 * extension points: the contract, the plumbing and the verifier branch all
 * exist, and `track()` feeds them — what is missing is only a product wired to
 * emit them.
 */
export type EvidenceClass = "dom" | "url" | "host_event" | "backend_event";

export type RuleKind =
  // --- url evidence ---
  | "route_matches"
  // --- dom evidence ---
  | "visible_text"
  | "control_state"
  | "notice_present"
  | "dialog_present"
  // --- host application event, delivered via track() ---
  | "host_event"
  // --- backend-confirmed event, the strongest signal ---
  | "backend_event";

export const EVIDENCE_CLASS_OF: Record<RuleKind, EvidenceClass> = {
  route_matches: "url",
  visible_text: "dom",
  control_state: "dom",
  notice_present: "dom",
  dialog_present: "dom",
  host_event: "host_event",
  backend_event: "backend_event",
};

export type LeafRule = {
  kind: RuleKind;
  value: string;
  /** For control_state: which state the named control must be in. */
  state?: ControlState;
  /**
   * For host_event / backend_event: optional payload keys that must match.
   * Values are compared as strings after trimming.
   */
  payload?: Record<string, string>;
  /** For host_event: ignore events older than this. Defaults to the step. */
  withinMs?: number;
};

/**
 * Events handed in by the host application through `track()`, or confirmed by
 * a backend. Held in a small ring buffer and consumed as verification
 * evidence — never as a direct instruction to advance.
 */
export type HostEvent = {
  name: string;
  at: number;
  source: "host" | "backend";
  payload?: Record<string, unknown>;
};

export type RuleGroup = {
  all?: Rule[];
  any?: Rule[];
  not?: Rule;
};

export type Rule = LeafRule | RuleGroup;

/**
 * How a recovery is oriented. The controller picks the mode; the voice
 * provider only phrases it. Prepared modes are why recovery cannot degrade
 * into the model rewording the same sentence.
 */
export type RecoveryMode = "location" | "recognition" | "reset";

export type RecoveryInstruction = {
  mode: RecoveryMode;
  text: string;
};

export type SideEffectClass = "none" | "creates" | "modifies" | "billable";

/**
 * A *semantic* description of the control a step is about.
 *
 * The manifest says what the control means; the runtime page reader finds it.
 * Resolution prefers ARIA role + accessible name, because those survive
 * redesigns that break CSS selectors. `testId` and `selector` are escape
 * hatches for products whose markup gives nothing better.
 */
export type StepTarget = {
  /** What to call the control when speaking. Emphasised in the instruction. */
  label: string;
  /** ARIA role or implicit role, e.g. "button", "link", "tab". */
  role?: string;
  /** Accessible name. Matched case-insensitively, trimmed. */
  name?: string;
  /** Visible text fallback when there is no usable accessible name. */
  text?: string;
  /** Stable hook, if the product provides one. */
  testId?: string;
  /** Last resort. Brittle by nature; prefer anything above. */
  selector?: string;
  /** Scope the search, e.g. only inside the open dialog. */
  within?: { role?: string; name?: string };
};

export type FlowStep = {
  id: string;
  objective: string;
  /** Optional: highlight this control while the step is active. */
  target?: StepTarget;
  instruction: {
    primary: string;
    recovery: RecoveryInstruction[];
  };
  preconditions?: RuleGroup;
  success: RuleGroup;
  timeoutSeconds: number;
  maxAttempts: number;
  sideEffect: SideEffectClass;
};

export type FlowDefinition = {
  id: string;
  name: string;
  /** Phrases that map a spoken goal onto this flow. */
  goalPhrases: string[];
  maxSessionSeconds: number;
  maxVoiceMinutes: number;
  steps: FlowStep[];
  /**
   * Optional persona and client-loop tool declarations. They travel with the
   * flow because the right wording is application knowledge, not engine
   * knowledge — but the engine never lets either one advance a step.
   */
  persona?: string;
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
};

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type Evidence = { rule: string; observed: string };

export type VerificationResult = {
  passed: boolean;
  stepId: string;
  evidence: Evidence[];
  /** Human-readable descriptions of what was required but absent. */
  missing: string[];
  checkedAt: string;
};

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export type SessionState =
  | "idle"
  | "connecting_voice"
  | "selecting_goal"
  | "observing"
  | "instructing"
  | "waiting_for_change"
  | "verifying"
  | "recovering"
  | "offering_handoff"
  | "completed"
  | "partial"
  | "failed"
  | "deadline";

export const TERMINAL_STATES = [
  "completed",
  "partial",
  "failed",
  "deadline",
] as const satisfies readonly SessionState[];

export type TerminalState = (typeof TERMINAL_STATES)[number];

export function isTerminal(state: SessionState): state is TerminalState {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type SessionEventType =
  | "session_started"
  | "goal_selected"
  | "step_instructed"
  | "verification_checked"
  | "recovery_spoken"
  | "stuck_signal"
  | "handoff_offered"
  | "handoff_accepted"
  | "handoff_declined"
  | "voice_provider"
  | "session_ended";

export type SessionEvent = {
  sessionId: string;
  sequence: number;
  at: string;
  type: SessionEventType;
  stepId?: string;
  attempt?: number;
  reason?: string;
  durationMs?: number;
  /** Small, already-redacted extras. Never a full snapshot or transcript. */
  detail?: Record<string, string | number | boolean | null>;
};

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export type Budgets = {
  maxSessionSeconds: number;
  maxVoiceMinutes: number;
  maxAttemptsPerStep: number;
  maxTotalSteps: number;
};

export type BudgetUsage = {
  elapsedSeconds: number;
  voiceMinutes: number;
  stepsInstructed: number;
};

export type BudgetVerdict =
  | { exhausted: false }
  | { exhausted: true; reason: string };

// ---------------------------------------------------------------------------
// Stuck signals
// ---------------------------------------------------------------------------

export type StuckSignal =
  | "verification_timeout"
  | "unchanged_fingerprint"
  | "error_notice"
  | "user_reported"
  | "precondition_violated";
