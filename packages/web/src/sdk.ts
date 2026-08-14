import {
  EvidenceLog,
  InMemoryEventSink,
  SessionController,
  isTerminal,
  type FlowDefinition,
  type SessionEvent,
  type VoiceAdapter,
  type VoiceProviderProof,
} from "@minute-one/core";
import { LiveDomObserver } from "./dom-observer";
import type { SessionIdentity } from "./identity";
import { ShadowOverlay, type OverlayView } from "./overlay";
import { Spotlight, type TargetResolutionStatus } from "./spotlight";

/**
 * @minute-one/web — the embeddable SDK.
 *
 * Inclusion model: import this package in an app whose source you control, or
 * load the built bundle with a script tag and call `window.MinuteOne.init(...)`.
 *
 * The host application never advances the guide. It can offer evidence through
 * `track()`, and the core verification gate decides whether that evidence,
 * combined with the observed page, satisfies the step.
 */

export type MinuteOneConfig = {
  flow: FlowDefinition;
  /** Factory so the SDK never holds a provider instance it did not create. */
  createVoiceAdapter: () => VoiceAdapter;
  /** Only reachable from an explicit user action after a real failure. */
  createDemoAdapter?: (reason: string) => VoiceAdapter;
  /** Where session events are posted. Set null to keep them in memory. */
  eventsEndpoint?: string | null;
  /**
   * Reported alongside events so the console can attribute a session to the
   * product that produced it. Without it a dashboard can only ever show totals
   * across every embed, which is not something you can act on.
   */
  productKey?: string;
  /** Reported with events, never included in the voice context. */
  identity?: SessionIdentity;
  /**
   * Absolute URL of the semantic-search endpoint, set only when the product
   * has an ingested knowledge base. The agent's `search_knowledge` tool calls
   * it at answer time; the query travels in the URL, the embedding key never
   * leaves the Minute One server.
   */
  knowledgeSearchEndpoint?: string;
  reportUrl?: string;
  helpNumber?: string;
  mount?: HTMLElement;
  onStatusChange?: (status: MinuteOneStatus) => void;
};

export type MinuteOneStatus = {
  initialised: boolean;
  running: boolean;
  sessionId: string | null;
  flowId: string | null;
  stepId: string | null;
  stepIndex: number;
  stepCount: number;
  attempt: number;
  state: string;
  terminal: string | null;
  terminalReason: string | null;
  missing: string[];
  voice: VoiceProviderProof | null;
  connectionError: string | null;
};

const DEFAULTS = {
  eventsEndpoint: "/api/minute-one/events",
  reportUrl: "/report",
  helpNumber: "+1 415 555 0100",
};

export class MinuteOne {
  private config: Required<Pick<MinuteOneConfig, "flow" | "createVoiceAdapter">> &
    MinuteOneConfig;
  private overlay: ShadowOverlay | null = null;
  private spotlight: Spotlight | null = null;
  private observer: LiveDomObserver | null = null;
  private controller: SessionController | null = null;
  private adapter: VoiceAdapter | null = null;
  private sink = new InMemoryEventSink();
  private evidence = new EvidenceLog();
  private stopped = false;
  private destroyed = false;

  private view: OverlayView;

  constructor(config: MinuteOneConfig) {
    this.config = { ...DEFAULTS, ...config };
    this.view = {
      running: false,
      status: "Idle",
      instruction: "",
      stepIndex: 0,
      stepCount: config.flow.steps.length,
      attempt: 0,
      missing: [],
      stage: null,
      targetNote: null,
      checking: false,
      offeringHandoff: false,
      terminal: null,
      terminalReason: null,
      transcript: [],
      proof: null,
      connectionError: null,
      micBlocked: false,
      targetLabel: null,
      helpNumber: this.config.helpNumber ?? DEFAULTS.helpNumber,
      reportUrl: this.config.reportUrl ?? DEFAULTS.reportUrl,
    };
  }

  // -- lifecycle ------------------------------------------------------------

  /** Mounts the overlay and begins observing. Does not connect voice. */
  init(): this {
    if (this.overlay) return this;
    this.overlay = new ShadowOverlay(
      {
        onStartReal: () => void this.start(),
        onStartDemo: () => void this.startDemoMode(),
        onUseSupportedGoal: () => void this.useSupportedGoal(),
        onAcceptHandoff: () => void this.acceptHandoff(),
        onDeclineHandoff: () => void this.declineHandoff(),
        onEnd: () => void this.end(),
      },
      this.config.mount
    );
    this.spotlight = new Spotlight(this.overlay.shadowRoot, (status) =>
      this.onTargetResolution(status)
    );
    this.observer = new LiveDomObserver(document);
    this.observer.start();
    this.paint();
    return this;
  }

  /**
   * Connects real voice and runs the flow. Rejects rather than falling back:
   * a failed real-provider connection must be visible, never silently swapped.
   */
  async start(): Promise<void> {
    if (!this.overlay) this.init();
    try {
      await this.begin(this.config.createVoiceAdapter(), null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.patch({
        running: false,
        connectionError: message,
        status: "Voice connection failed",
        proof: null,
      });
    }
  }

  /** Explicit opt-in only. Never called automatically on failure. */
  async startDemoMode(): Promise<void> {
    if (!this.config.createDemoAdapter) return;
    const reason = this.view.connectionError ?? "user selected demo mode";
    await this.begin(this.config.createDemoAdapter(reason), reason);
  }

  /**
   * Host applications report what happened in their own terms. This is
   * evidence for the verifier, not an instruction — calling
   * `track("number.provisioned")` cannot by itself advance a step.
   */
  track(name: string, payload?: Record<string, unknown>): void {
    this.controller?.trackEvidence(name, payload, "host");
    if (!this.controller) {
      this.evidence.record({ name, payload, source: "host", at: Date.now() });
    }
  }

  /** Backend-confirmed evidence, the strongest class. */
  trackBackend(name: string, payload?: Record<string, unknown>): void {
    this.controller?.trackEvidence(name, payload, "backend");
  }

  getStatus(): MinuteOneStatus {
    const snap = this.controller?.current;
    return {
      initialised: Boolean(this.overlay),
      running: this.view.running,
      sessionId: this.sessionId,
      flowId: this.config.flow.id,
      stepId: snap?.stepId ?? null,
      stepIndex: snap?.stepIndex ?? 0,
      stepCount: this.config.flow.steps.length,
      attempt: snap?.attempt ?? 0,
      state: snap?.state ?? "idle",
      terminal: this.view.terminal,
      terminalReason: this.view.terminalReason,
      missing: this.view.missing,
      voice: this.adapter?.proof ?? null,
      connectionError: this.view.connectionError,
    };
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopped = true;
    this.observer?.stop();
    await this.adapter?.disconnect("sdk destroyed");
    this.spotlight?.destroy();
    this.spotlight = null;
    this.overlay?.destroy();
    this.overlay = null;
    this.observer = null;
    this.controller = null;
    this.adapter = null;
  }

  // -- internals ------------------------------------------------------------

  private sessionId: string | null = null;

  private patch(p: Partial<OverlayView>) {
    this.view = { ...this.view, ...p };
    this.paint();
    this.config.onStatusChange?.(this.getStatus());
  }

  private paint() {
    this.overlay?.render(this.view);
  }

  private async begin(adapter: VoiceAdapter, fallbackReason: string | null) {
    this.stopped = false;
    this.finished = false;
    this.adapter = adapter;
    this.sink = new InMemoryEventSink();
    this.sessionId = `s_${Date.now().toString(36)}`;

    const observer = this.observer!;
    const controller = new SessionController({
      sessionId: this.sessionId,
      flow: this.config.flow,
      budgets: {
        maxSessionSeconds: this.config.flow.maxSessionSeconds,
        maxVoiceMinutes: this.config.flow.maxVoiceMinutes,
        maxAttemptsPerStep: 3,
        maxTotalSteps: this.config.flow.steps.length * 4,
      },
      sink: this.sink,
      evidence: this.evidence,
      voice: {
        say: (text) => adapter.say(text),
        pushContext: (packet) => adapter.pushContext(packet),
      },
      observer: {
        snapshot: () => observer.snapshot(),
        waitForChange: (fp, ms) => observer.waitForChange(fp, ms),
      },
    });
    this.controller = controller;

    await adapter.connect({
      persona: this.config.flow.persona ?? DEFAULT_PERSONA,
      greeting:
        "Hi, I'm Minute One. Tell me what you're trying to set up and I'll walk you through it.",
      tools: this.config.flow.tools,
      handlers: {
        onStateChange: (proof) => this.patch({ proof }),
        onTranscript: (frame) => {
          /*
           * Show interim transcripts, not only finals.
           *
           * Omni streams a transcript as a run of partials (final:false) that
           * end in one final (final:true). Dropping every non-final left the
           * panel empty while someone was mid-sentence — which reads as "it
           * isn't hearing me". Each new partial replaces the previous one for
           * the same speaker (mode is delta/replace but replace-in-place is
           * correct for both once we only keep the latest); the final promotes
           * that line and frees the slot for the next utterance.
           */
          const prev = this.view.transcript;
          const last = prev[prev.length - 1];
          const replaceable =
            last && last.role === frame.role && last.partial === true;
          const line = {
            role: frame.role,
            text: frame.text,
            partial: !frame.final,
          };
          const transcript = replaceable
            ? [...prev.slice(0, -1), line]
            : [...prev.slice(-24), line];

          this.patch({
            transcript,
            // Stage follows who currently holds the floor, updated live rather
            // than only when a sentence finishes. The drive loop overwrites it
            // with "Waiting for you" once an instruction lands.
            stage: frame.role === "assistant" ? "Speaking" : "Listening",
          });
          // Only act on a completed user utterance — a half-formed partial is
          // not a goal or a "stuck" signal.
          if (frame.role === "user" && frame.final) {
            void this.onUserSpeech(frame.text);
          }
        },
        onToolCall: (call) => void this.onToolCall(call),
        onError: (err) => {
          if (err.message.startsWith("microphone_blocked")) {
            this.patch({
              micBlocked: true,
              status: "Microphone blocked — allow access and press start",
            });
            return;
          }
          // The overlay shows the user something they can act on, so the
          // provider's own wording would otherwise be lost. Whoever installed
          // the guide needs it verbatim to debug an integration.
          console.error("[minute-one] voice connection failed:", err.message);
          this.patch({ connectionError: err.message });
        },
      },
    });

    const proof = adapter.proof;
    this.patch({
      running: true,
      proof,
      stage: "Listening",
      connectionError: null,
      status: proof.isRealVoice
        ? `Connected to ${providerLabel(proof.provider)}`
        : "Demo mode (not real voice)",
    });

    await controller.start({
      provider: proof.provider,
      model: proof.model,
      isRealVoice: proof.isRealVoice,
      providerSessionId: proof.sessionId,
      fallbackReason,
    });
  }

  private async onUserSpeech(text: string) {
    const c = this.controller;
    if (!c) return;
    if (c.current.state === "selecting_goal") {
      if (await c.selectGoal(text)) {
        this.patch({ status: "Goal locked" });
        void this.drive();
      } else {
        this.patch({
          status: `Only "${this.config.flow.name}" is supported in this build`,
        });
      }
      return;
    }
    if (/stuck|can't find|cannot find|not working|where is/i.test(text)) {
      await c.reportUserStuck();
    }
  }

  private async onToolCall(call: {
    callId: string;
    name: string;
    arguments: Record<string, unknown>;
  }) {
    const c = this.controller;
    const adapter = this.adapter;
    if (!c || !adapter) return;
    try {
      switch (call.name) {
        case "get_current_guidance_state": {
          const s = c.current;
          return void (await adapter.respondToTool(call.callId, {
            goal: this.config.flow.name,
            step: s.stepId,
            attempt: s.attempt + 1,
            missing: s.lastVerification?.missing ?? [],
          }));
        }
        case "request_verification": {
          this.patch({ checking: true, stage: "Checking the page" });
          const result = await c.requestVerification();
          this.patch({
            checking: false,
            missing: result?.missing ?? [],
            stage: result?.passed ? "Waiting for you" : "Correcting",
          });
          return void (await adapter.respondToTool(call.callId, {
            passed: result?.passed ?? false,
            missing: result?.missing ?? [],
          }));
        }
        case "report_user_stuck": {
          await c.reportUserStuck();
          return void (await adapter.respondToTool(call.callId, { ok: true }));
        }
        case "accept_phone_help": {
          this.patch({ offeringHandoff: true });
          return void (await adapter.respondToTool(call.callId, { shown: true }));
        }
        case "search_knowledge": {
          const endpoint = this.config.knowledgeSearchEndpoint;
          const query = String(call.arguments.query ?? "").trim();
          if (!endpoint || !query) {
            return void (await adapter.respondToTool(call.callId, { hits: [] }));
          }
          // Retrieval happens on the Minute One server, which holds the
          // embedding key. We forward the question and hand the model back the
          // nearest passages to ground its spoken answer on.
          const res = await fetch(
            `${endpoint}&q=${encodeURIComponent(query)}`,
            { credentials: "omit" }
          );
          const body = (await res.json().catch(() => ({}))) as {
            hits?: Array<{ title: string; url: string; text: string }>;
          };
          const hits = (body.hits ?? []).map((h) => ({
            title: h.title,
            url: h.url,
            text: h.text,
          }));
          return void (await adapter.respondToTool(call.callId, { hits }));
        }
        default:
          return void (await adapter.respondToToolError(
            call.callId,
            "unknown tool"
          ));
      }
    } catch (err) {
      await adapter.respondToToolError(
        call.callId,
        err instanceof Error ? err.message : "tool failed"
      );
    }
  }

  private async useSupportedGoal() {
    const c = this.controller;
    if (!c) return;
    if (await c.selectGoal(this.config.flow.goalPhrases[0])) {
      this.patch({ status: "Goal locked" });
      void this.drive();
    }
  }

  /** Observe → Instruct → Wait → Verify, until the controller settles. */
  private async drive() {
    const c = this.controller;
    if (!c) return;
    while (!this.stopped) {
      const before = c.current;
      if (isTerminal(before.state) || before.state === "offering_handoff") break;

      /*
       * Show the instruction and point at the control BEFORE running the step.
       * runStep blocks until the page changes or the timeout expires, so doing
       * this afterwards left the user waiting at a panel with no instruction
       * and no ring — the two things they need in order to act.
       */
      const active = this.config.flow.steps[before.stepIndex];
      const activeInstruction =
        before.attempt === 0
          ? (active?.instruction.primary ?? "")
          : (active?.instruction.recovery[
              Math.min(before.attempt - 1, active.instruction.recovery.length - 1)
            ]?.text ?? "");

      this.spotlight?.show(active?.target);
      this.patch({
        checking: false,
        stage: "Waiting for you",
        status: "Waiting for you",
        stepIndex: before.stepIndex,
        attempt: before.attempt,
        instruction: activeInstruction,
        targetLabel: active?.target?.label ?? null,
      });

      await c.runStep();
      const after = c.current;
      const step = this.config.flow.steps[after.stepIndex];

      // Follow the controller: the ring always points at the step the gate is
      // actually waiting on, never at one the user has already proven.
      if (isTerminal(after.state) || after.state === "offering_handoff") {
        this.spotlight?.clear();
      } else {
        this.spotlight?.show(step?.target);
      }

      this.patch({
        targetLabel: step?.target?.label ?? null,
        checking: false,
        stepIndex: after.stepIndex,
        attempt: after.attempt,
        missing: after.lastVerification?.missing ?? [],
        instruction:
          after.attempt === 0
            ? (step?.instruction.primary ?? "")
            : (step?.instruction.recovery[
                Math.min(after.attempt - 1, step.instruction.recovery.length - 1)
              ]?.text ?? ""),
        status:
          after.state === "recovering"
            ? "Check failed — correcting"
            : "Waiting for you",
        stage: isTerminal(after.state)
          ? after.state === "completed"
            ? "Complete"
            : null
          : after.state === "offering_handoff"
            ? "Phone help available"
            : after.state === "recovering"
              ? "Correcting"
              : "Waiting for you",
        offeringHandoff: after.state === "offering_handoff",
        terminal: isTerminal(after.state) ? after.state : null,
        terminalReason: after.terminalReason,
        proof: this.adapter?.proof ?? null,
      });

      if (this.adapter) c.reportVoiceMinutes(this.adapter.proof.minutes);
      await this.publish();

      if (isTerminal(after.state)) {
        // Reaching a terminal state on its own still has to release the mic
        // and close the socket, or a "completed" session keeps billing.
        await this.finish();
        break;
      }
      if (after.state === "offering_handoff") break;
    }
  }

  /**
   * The spotlight explains why there is no ring; the overlay repeats it in the
   * user's terms. Informational only — a missing visual target neither blocks
   * nor bypasses the verification gate, which reads the page for itself.
   */
  private onTargetResolution(status: TargetResolutionStatus) {
    const note =
      status === "ambiguous"
        ? "More than one matching control is visible."
        : status === "disabled"
          ? "This control is currently disabled."
          : status === "missing" || status === "hidden"
            ? "I cannot find this control yet."
            : null;
    if (note !== this.view.targetNote) this.patch({ targetNote: note });
  }

  private async acceptHandoff() {
    const c = this.controller;
    if (!c) return;
    await c.acceptHandoff();
    await this.finish();
  }

  private async declineHandoff() {
    const c = this.controller;
    if (!c) return;
    await c.declineHandoff();
    await this.finish();
  }

  async end(): Promise<void> {
    const c = this.controller;
    if (!c) return;
    await c.endByUser();
    await this.finish();
  }

  private finished = false;

  private async finish() {
    const c = this.controller!;
    if (this.finished) return;
    this.finished = true;
    this.stopped = true;
    this.spotlight?.clear();
    await this.adapter?.disconnect(`session ${c.current.state}`);
    await this.publish();
    this.patch({
      running: false,
      offeringHandoff: false,
      terminal: c.current.state,
      terminalReason: c.current.terminalReason,
      status: `Session ${c.current.state}`,
      stage: c.current.state === "completed" ? "Complete" : null,
      targetNote: null,
      proof: this.adapter?.proof ?? null,
    });
  }

  private async publish() {
    const endpoint = this.config.eventsEndpoint;
    if (!endpoint) return;
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          events: this.sink.list() as SessionEvent[],
          productKey: this.config.productKey,
          identity: this.config.identity,
        }),
      });
    } catch {
      // The in-memory log remains the source of truth for the live overlay.
    }
  }
}

const DEFAULT_PERSONA =
  "You are a concise onboarding guide. Give one action at a time. Never claim a step succeeded until the controller reports verification passed.";

const providerLabel = (provider: string) =>
  provider === "deepgram"
    ? "Deepgram"
    : provider === "pyai"
      ? "PyAI"
      : provider;

/** Functional entry point, mirroring the script-tag surface. */
export function init(config: MinuteOneConfig): MinuteOne {
  return new MinuteOne(config).init();
}
