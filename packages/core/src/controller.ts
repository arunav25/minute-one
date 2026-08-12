import { attemptsExhausted, checkBudgets } from "./budgets";
import { EventRecorder, type EventSink } from "./events";
import { EvidenceLog } from "./evidence";
import { verifyStep } from "./verifier";
import {
  isTerminal,
  type Budgets,
  type FlowDefinition,
  type FlowStep,
  type PageSnapshot,
  type RecoveryInstruction,
  type SessionState,
  type StuckSignal,
  type TerminalState,
  type VerificationResult,
} from "./types";

/**
 * The session controller.
 *
 * It is the ONLY component permitted to advance a step. The voice provider can
 * ask it to re-check; it cannot tell it that something succeeded. Everything
 * here is generic — no product labels, no provider SDK.
 */

/** Legal transitions. Anything else is a bug and is treated as one. */
const TRANSITIONS: Record<SessionState, SessionState[]> = {
  idle: ["connecting_voice", "failed"],
  connecting_voice: ["selecting_goal", "failed"],
  selecting_goal: ["observing", "failed", "partial"],
  observing: ["instructing", "recovering", "failed", "deadline", "partial"],
  instructing: ["waiting_for_change", "failed", "deadline"],
  waiting_for_change: ["verifying", "recovering", "failed", "deadline", "partial"],
  verifying: [
    "observing",
    "recovering",
    "completed",
    "failed",
    "deadline",
    "partial",
  ],
  recovering: [
    "instructing",
    "offering_handoff",
    "failed",
    "deadline",
    "partial",
  ],
  offering_handoff: ["partial", "failed", "completed", "deadline"],
  completed: [],
  partial: [],
  failed: [],
  deadline: [],
};

export class IllegalTransitionError extends Error {
  constructor(from: SessionState, to: SessionState) {
    super(`illegal transition ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export type VoicePort = {
  /** Speak one instruction. Resolves when handed to the provider. */
  say(text: string): Promise<void>;
  /** Push structured facts the persona may reference. */
  pushContext(packet: Record<string, unknown>): Promise<void>;
};

export type ObserverPort = {
  snapshot(): Promise<PageSnapshot>;
  /**
   * Resolve when the page meaningfully changes or the timeout elapses.
   * Returns the reason so the controller can log a real stuck signal.
   */
  waitForChange(
    fingerprint: string,
    timeoutMs: number
  ): Promise<"changed" | "timeout">;
};

export type ControllerOptions = {
  sessionId: string;
  flow: FlowDefinition;
  budgets: Budgets;
  sink: EventSink;
  voice: VoicePort;
  observer: ObserverPort;
  now?: () => Date;
  /** Injected for tests; defaults to wall clock. */
  monotonicMs?: () => number;
  /**
   * Host- and backend-reported events, fed by `track()`. Supplied so that
   * host_event / backend_event rules can be evaluated; omit and those rules
   * simply never pass.
   */
  evidence?: EvidenceLog;
};

export type ControllerSnapshot = {
  state: SessionState;
  stepIndex: number;
  stepId: string | null;
  attempt: number;
  lastVerification: VerificationResult | null;
  stuckSignals: StuckSignal[];
  terminalReason: string | null;
  voiceMinutes: number;
};

export class SessionController {
  private state: SessionState = "idle";
  private stepIndex = 0;
  private attempt = 0;
  private stepsInstructed = 0;
  private stuckSignals: StuckSignal[] = [];
  private lastVerification: VerificationResult | null = null;
  private terminalReason: string | null = null;
  private voiceMinutes = 0;
  private readonly startedAtMs: number;
  private readonly recorder: EventRecorder;
  private readonly evidence: EvidenceLog;
  private readonly opts: Required<Pick<ControllerOptions, "now" | "monotonicMs">> &
    ControllerOptions;

  constructor(options: ControllerOptions) {
    this.opts = {
      now: () => new Date(),
      monotonicMs: () => Date.now(),
      ...options,
    };
    this.recorder = new EventRecorder(
      options.sessionId,
      options.sink,
      this.opts.now
    );
    this.startedAtMs = this.opts.monotonicMs();
    this.evidence = options.evidence ?? new EvidenceLog();
  }

  /**
   * Record a host- or backend-reported event as *evidence*. It never advances
   * anything by itself — the step's rule group still has to pass.
   */
  trackEvidence(
    name: string,
    payload?: Record<string, unknown>,
    source: "host" | "backend" = "host"
  ) {
    this.evidence.record({ name, payload, source, at: Date.now() });
  }

  // -- introspection --------------------------------------------------------

  get current(): ControllerSnapshot {
    return {
      state: this.state,
      stepIndex: this.stepIndex,
      stepId: this.step?.id ?? null,
      attempt: this.attempt,
      lastVerification: this.lastVerification,
      stuckSignals: [...this.stuckSignals],
      terminalReason: this.terminalReason,
      voiceMinutes: this.voiceMinutes,
    };
  }

  private get step(): FlowStep | undefined {
    return this.opts.flow.steps[this.stepIndex];
  }

  private get elapsedSeconds() {
    return (this.opts.monotonicMs() - this.startedAtMs) / 1000;
  }

  /** Voice providers report consumed minutes; budgets act on it. */
  reportVoiceMinutes(minutes: number) {
    this.voiceMinutes = minutes;
  }

  // -- transitions ----------------------------------------------------------

  private transition(to: SessionState) {
    const allowed = TRANSITIONS[this.state];
    if (!allowed.includes(to)) throw new IllegalTransitionError(this.state, to);
    this.state = to;
  }

  // -- lifecycle ------------------------------------------------------------

  async start(voiceProviderDetail: Record<string, string | number | boolean | null>) {
    this.transition("connecting_voice");
    await this.recorder.record("session_started", {
      detail: { flowId: this.opts.flow.id },
    });
    await this.recorder.record("voice_provider", { detail: voiceProviderDetail });
    this.transition("selecting_goal");
  }

  async selectGoal(spoken: string): Promise<boolean> {
    const matches = this.opts.flow.goalPhrases.some((p) =>
      spoken.toLowerCase().includes(p.toLowerCase())
    );
    if (!matches) return false;
    await this.recorder.record("goal_selected", {
      detail: { flowId: this.opts.flow.id },
    });
    this.transition("observing");
    return true;
  }

  /**
   * Runs one full turn of Observe -> Instruct -> Wait -> Verify -> Advance or
   * Recover. Returns the state it settled in.
   */
  async runStep(): Promise<SessionState> {
    if (isTerminal(this.state)) return this.state;

    const step = this.step;
    if (!step) return this.finish("completed", "all steps proven");

    const budget = checkBudgets(this.opts.budgets, {
      elapsedSeconds: this.elapsedSeconds,
      voiceMinutes: this.voiceMinutes,
      stepsInstructed: this.stepsInstructed,
    });
    if (budget.exhausted) return this.finish("deadline", budget.reason);

    if (this.state === "recovering") {
      // recovering -> instructing is legal; fall through to instruct
    } else if (this.state !== "observing") {
      this.transition("observing");
    }

    const before = await this.opts.observer.snapshot();

    if (step.preconditions) {
      const pre = verifyStep(
          step.id,
          step.preconditions,
          { snapshot: before, events: this.evidence },
          this.opts.now
        );
      if (!pre.passed) {
        await this.addStuckSignal("precondition_violated");
        return this.recover(step, pre);
      }
    }

    const instruction =
      this.attempt === 0
        ? step.instruction.primary
        : this.pickRecovery(step, this.attempt - 1).text;

    this.transition("instructing");
    this.stepsInstructed += 1;
    await this.opts.voice.pushContext({
      goal: this.opts.flow.name,
      step: step.id,
      attempt: this.attempt + 1,
      page: summarise(before),
      verification: this.lastVerification
        ? { passed: false, missing: this.lastVerification.missing }
        : null,
    });
    await this.opts.voice.say(instruction);
    await this.recorder.record("step_instructed", {
      stepId: step.id,
      attempt: this.attempt + 1,
    });

    if (isTerminal(this.state)) return this.state;
    this.transition("waiting_for_change");

    /*
     * Check before waiting. A user who acted while the guide was still talking
     * has already satisfied the step, and making them sit through the full
     * timeout would feel broken. Only if the page is not yet good do we wait.
     */
    let after = await this.opts.observer.snapshot();
    let change: "changed" | "timeout" = "changed";

    const alreadyGood = verifyStep(
      step.id,
      step.success,
      { snapshot: after, events: this.evidence },
      this.opts.now
    );

    if (!alreadyGood.passed) {
      change = await this.opts.observer.waitForChange(
        after.fingerprint,
        step.timeoutSeconds * 1000
      );
      after = await this.opts.observer.snapshot();
    }

    if (change === "timeout") await this.addStuckSignal("verification_timeout");
    if (after.fingerprint === before.fingerprint)
      await this.addStuckSignal("unchanged_fingerprint");
    if (after.notices.some((n) => n.kind === "error"))
      await this.addStuckSignal("error_notice");

    /*
     * The session can end while this step is parked in waitForChange — the
     * user pressing End, or a budget expiring. Resuming into `verifying`
     * from a terminal state threw IllegalTransitionError and killed the
     * driving loop, so bail out instead.
     */
    if (isTerminal(this.state)) return this.state;

    this.transition("verifying");
    const result = verifyStep(
      step.id,
      step.success,
      { snapshot: after, events: this.evidence },
      this.opts.now
    );
    this.lastVerification = result;
    await this.recorder.record("verification_checked", {
      stepId: step.id,
      attempt: this.attempt + 1,
      reason: result.passed ? "passed" : result.missing.join("; "),
      detail: { evidenceCount: result.evidence.length },
    });

    if (result.passed) {
      this.attempt = 0;
      /*
       * Stuck signals are per step, not per session. Accumulating them for the
       * whole journey meant a bumpy first step spent the allowance, and the
       * next single failure jumped straight to phone help on attempt 1 — with
       * the retry budget never actually used.
       */
      this.stuckSignals = [];
      this.stepIndex += 1;
      if (this.stepIndex >= this.opts.flow.steps.length) {
        return this.finish("completed", "final postcondition proven");
      }
      this.transition("observing");
      return this.state;
    }

    if (await this.goalAlreadyMet(after)) {
      this.stepIndex = this.opts.flow.steps.length;
      return this.finish(
        "completed",
        "final postcondition proven (user completed ahead of guidance)"
      );
    }

    return this.recover(step, result);
  }

  /**
   * The user saying "done" routes here. It can trigger a re-check; it can
   * never prove completion on its own.
   */
  async requestVerification(): Promise<VerificationResult | null> {
    const step = this.step;
    if (!step || isTerminal(this.state)) return null;
    const snap = await this.opts.observer.snapshot();
    const result = verifyStep(
      step.id,
      step.success,
      { snapshot: snap, events: this.evidence },
      this.opts.now
    );
    this.lastVerification = result;
    await this.recorder.record("verification_checked", {
      stepId: step.id,
      attempt: this.attempt + 1,
      reason: result.passed ? "passed (on request)" : result.missing.join("; "),
      detail: { requestedByUser: true },
    });
    return result;
  }

  async reportUserStuck() {
    await this.addStuckSignal("user_reported");
  }

  private async addStuckSignal(signal: StuckSignal) {
    this.stuckSignals.push(signal);
    await this.recorder.record("stuck_signal", {
      stepId: this.step?.id,
      reason: signal,
    });
  }

  /**
   * Is the flow's final outcome already proven?
   *
   * Users run ahead of guidance. Someone who completes the last two steps in
   * one go leaves an intermediate step unprovable — its controls are gone —
   * and would otherwise be offered phone help *after finishing the task*.
   * The final postcondition is the strongest evidence available, so if it
   * holds, the journey is done regardless of which step we were watching.
   */
  private async goalAlreadyMet(snapshot: PageSnapshot): Promise<boolean> {
    const final = this.opts.flow.steps[this.opts.flow.steps.length - 1];
    if (!final) return false;
    const result = verifyStep(
      final.id,
      final.success,
      { snapshot, events: this.evidence },
      this.opts.now
    );
    return result.passed;
  }

  private pickRecovery(step: FlowStep, index: number): RecoveryInstruction {
    const list = step.instruction.recovery;
    if (list.length === 0) {
      return { mode: "reset", text: step.instruction.primary };
    }
    return list[Math.min(index, list.length - 1)];
  }

  private async recover(
    step: FlowStep,
    result: VerificationResult
  ): Promise<SessionState> {
    this.attempt += 1;
    this.transition("recovering");

    if (
      attemptsExhausted(this.attempt, step.maxAttempts) ||
      this.stuckSignals.length >= 3
    ) {
      this.transition("offering_handoff");
      await this.recorder.record("handoff_offered", {
        stepId: step.id,
        attempt: this.attempt,
        reason: result.missing.join("; ") || "attempts exhausted",
      });
      return this.state;
    }

    const recovery = this.pickRecovery(step, this.attempt - 1);
    await this.recorder.record("recovery_spoken", {
      stepId: step.id,
      attempt: this.attempt,
      reason: recovery.mode,
      detail: { missing: result.missing.join("; ") },
    });
    return this.state;
  }

  async acceptHandoff() {
    await this.recorder.record("handoff_accepted", { stepId: this.step?.id });
    return this.finish("partial", "user moved to phone help");
  }

  async declineHandoff() {
    await this.recorder.record("handoff_declined", { stepId: this.step?.id });
    return this.finish("partial", "user declined phone help");
  }

  /** User closed the guide. Partial if anything was proven, else failed. */
  async endByUser(): Promise<TerminalState> {
    const proven = this.stepIndex > 0;
    return this.finish(
      proven ? "partial" : "failed",
      proven ? "user ended after proven steps" : "user ended before any step passed"
    );
  }

  async fail(reason: string): Promise<TerminalState> {
    return this.finish("failed", reason);
  }

  /**
   * The failure invariant: exactly one terminal event, written before the UI
   * shows a terminal state. Safe to call twice — the second call is a no-op.
   */
  private async finish(
    state: TerminalState,
    reason: string
  ): Promise<TerminalState> {
    if (isTerminal(this.state)) return this.state as TerminalState;
    try {
      this.transition(state);
    } catch {
      // A terminal record matters more than transition purity.
      this.state = state;
    }
    this.terminalReason = reason;
    await this.recorder.record("session_ended", {
      reason,
      stepId: this.step?.id,
      durationMs: Math.round(this.elapsedSeconds * 1000),
      detail: {
        terminal: state,
        stepsProven: this.stepIndex,
        voiceMinutes: Number(this.voiceMinutes.toFixed(3)),
      },
    });
    return state;
  }
}

/** Compact, already-redacted page description for the persona. */
export function summarise(snap: PageSnapshot): string {
  const parts: string[] = [];
  if (snap.headings[0]) parts.push(`Page "${snap.headings[0]}"`);
  if (snap.dialogs.length) parts.push(`Dialog open: ${snap.dialogs.join(", ")}`);
  const selected = snap.controls.filter((c) => c.state === "selected");
  if (selected.length)
    parts.push(`Selected: ${selected.map((c) => c.name).join(", ")}`);
  const notice = snap.notices[0];
  if (notice) parts.push(`${notice.kind} notice: ${notice.text}`);
  const names = snap.controls.slice(0, 8).map((c) => c.name);
  if (names.length) parts.push(`Visible controls: ${names.join(", ")}`);
  return parts.join(". ") || "No recognisable landmarks on this page.";
}
