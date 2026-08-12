import { describe, expect, it } from "vitest";
import { SessionController } from "./controller";
import { InMemoryEventSink } from "./events";
import type {
  Budgets,
  FlowDefinition,
  PageSnapshot,
  SessionEvent,
} from "./types";

/**
 * These tests exist because a failure here would make the demo dishonest:
 * advancing without proof, or a session that ends with no record.
 */

const page = (over: Partial<PageSnapshot> = {}): PageSnapshot => ({
  url: "http://x/fixture",
  route: "/fixture",
  title: "Dashboard",
  headings: ["Dashboard"],
  controls: [],
  dialogs: [],
  notices: [],
  text: "",
  fingerprint: "start",
  observedAt: "2026-08-11T00:00:00.000Z",
  ...over,
});

const flow: FlowDefinition = {
  id: "test-flow",
  name: "Test flow",
  goalPhrases: ["test"],
  maxSessionSeconds: 300,
  maxVoiceMinutes: 10,
  steps: [
    {
      id: "step-one",
      objective: "Reach page two",
      instruction: {
        primary: "Go to page two.",
        recovery: [
          { mode: "location", text: "It is in the left sidebar." },
          { mode: "recognition", text: 'Look for the words "Page Two".' },
        ],
      },
      success: { all: [{ kind: "route_matches", value: "/two*" }] },
      timeoutSeconds: 1,
      maxAttempts: 3,
      sideEffect: "none",
    },
  ],
};

/** Scripted page states; the controller sees whatever the script says next. */
function harness(
  pages: PageSnapshot[],
  over: { flow?: FlowDefinition; budgets?: Partial<Budgets> } = {}
) {
  const sink = new InMemoryEventSink();
  const spoken: string[] = [];
  let index = 0;

  const controller = new SessionController({
    sessionId: "test",
    flow: over.flow ?? flow,
    budgets: {
      maxSessionSeconds: 300,
      maxVoiceMinutes: 10,
      maxAttemptsPerStep: 3,
      maxTotalSteps: 20,
      ...over.budgets,
    },
    sink,
    voice: {
      say: async (t) => {
        spoken.push(t);
      },
      pushContext: async () => {},
    },
    observer: {
      snapshot: async () => pages[Math.min(index, pages.length - 1)],
      waitForChange: async () => {
        index += 1;
        return "changed";
      },
    },
  });

  return { controller, sink, spoken };
}

const terminalEvents = (sink: InMemoryEventSink) =>
  (sink.list() as SessionEvent[]).filter((e) => e.type === "session_ended");

describe("session controller", () => {
  /*
   * A precondition is checked before the state ever returns to observing, so a
   * second consecutive failure asks the controller to re-enter the state it is
   * already in. That threw an IllegalTransitionError and killed the drive loop
   * part-way through a live session.
   */
  it("survives consecutive precondition failures", async () => {
    const blocked: FlowDefinition = {
      ...flow,
      steps: [
        {
          ...flow.steps[0],
          // Never satisfied by the scripted pages.
          preconditions: { all: [{ kind: "visible_text", value: "NEVER" }] },
          maxAttempts: 5,
        },
      ],
    };
    const { controller } = harness([page(), page()], { flow: blocked });

    await controller.start({ provider: "mock" });
    await controller.selectGoal("test");

    await expect(controller.runStep()).resolves.toBeDefined();
    // The second call is the one that used to throw.
    await expect(controller.runStep()).resolves.toBeDefined();
    await expect(controller.runStep()).resolves.toBeDefined();

    expect(["recovering", "offering_handoff", "partial"]).toContain(
      controller.current.state
    );
  });

  it("applies the session attempt budget, not just the step's own", async () => {
    const patient: FlowDefinition = {
      ...flow,
      // The step is willing to retry five times...
      steps: [{ ...flow.steps[0], maxAttempts: 5 }],
    };
    const { controller, sink } = harness(
      // The page never reaches /two, so the step can never pass.
      [page(), page()],
      // ...but the session says one attempt is the ceiling.
      { flow: patient, budgets: { maxAttemptsPerStep: 1 } }
    );

    await controller.start({ provider: "mock" });
    await controller.selectGoal("test");
    await controller.runStep();

    expect(controller.current.state).toBe("offering_handoff");
    expect(
      (sink.list() as SessionEvent[]).filter((e) => e.type === "handoff_offered")
    ).toHaveLength(1);
  });

  it("advances only when the postcondition is proven", async () => {
    const { controller, sink } = harness([
      page(),
      page({ route: "/two", fingerprint: "two" }),
    ]);

    await controller.start({ provider: "mock" });
    expect(await controller.selectGoal("test")).toBe(true);
    await controller.runStep();

    expect(controller.current.state).toBe("completed");
    expect(terminalEvents(sink)).toHaveLength(1);
  });

  it("does not advance when the page never changes, and recovers", async () => {
    const { controller, spoken } = harness([page(), page()]);

    await controller.start({ provider: "mock" });
    await controller.selectGoal("test");
    await controller.runStep();

    expect(controller.current.state).toBe("recovering");
    expect(controller.current.stepIndex).toBe(0);
    expect(controller.current.attempt).toBe(1);
    expect(spoken).toHaveLength(1);
  });

  it("speaks a different instruction on each attempt", async () => {
    const { controller, spoken } = harness([page(), page(), page()]);

    await controller.start({ provider: "mock" });
    await controller.selectGoal("test");
    await controller.runStep();
    await controller.runStep();

    expect(spoken).toHaveLength(2);
    expect(spoken[0]).not.toBe(spoken[1]);
  });

  it("offers handoff once attempts are exhausted, and ends with one record", async () => {
    const { controller, sink } = harness([page(), page(), page(), page()]);

    await controller.start({ provider: "mock" });
    await controller.selectGoal("test");
    await controller.runStep();
    await controller.runStep();
    await controller.runStep();

    expect(controller.current.state).toBe("offering_handoff");

    await controller.acceptHandoff();
    expect(terminalEvents(sink)).toHaveLength(1);
    expect(terminalEvents(sink)[0].detail?.terminal).toBe("partial");
  });

  it('a user saying "done" cannot prove a step', async () => {
    const { controller } = harness([page(), page()]);

    await controller.start({ provider: "mock" });
    await controller.selectGoal("test");

    const result = await controller.requestVerification();
    expect(result?.passed).toBe(false);
    expect(controller.current.stepIndex).toBe(0);
  });

  it("ends with deadline when the time budget is spent", async () => {
    const sink = new InMemoryEventSink();
    let clock = 0;
    const controller = new SessionController({
      sessionId: "budget",
      flow,
      budgets: {
        maxSessionSeconds: 1,
        maxVoiceMinutes: 10,
        maxAttemptsPerStep: 3,
        maxTotalSteps: 20,
      },
      sink,
      voice: { say: async () => {}, pushContext: async () => {} },
      observer: {
        snapshot: async () => page(),
        waitForChange: async () => "timeout",
      },
      monotonicMs: () => clock,
    });

    await controller.start({ provider: "mock" });
    await controller.selectGoal("test");
    clock = 5000;
    await controller.runStep();

    expect(controller.current.state).toBe("deadline");
    expect(terminalEvents(sink)[0].detail?.terminal).toBe("deadline");
  });

  it("ends failed when the user quits before proving anything", async () => {
    const { controller, sink } = harness([page()]);
    await controller.start({ provider: "mock" });
    await controller.selectGoal("test");

    expect(await controller.endByUser()).toBe("failed");
    expect(terminalEvents(sink)).toHaveLength(1);
  });

  it("writes exactly one terminal event even if finish is called twice", async () => {
    const { controller, sink } = harness([page()]);
    await controller.start({ provider: "mock" });
    await controller.endByUser();
    await controller.endByUser();
    expect(terminalEvents(sink)).toHaveLength(1);
  });

  it("completes rather than offering help when the user has already finished", async () => {
    // Two steps. The user skips step one's provable state and lands directly on
    // the final outcome — the situation that previously offered phone help to
    // somebody who had just succeeded.
    const twoStep: FlowDefinition = {
      ...flow,
      steps: [
        flow.steps[0],
        {
          id: "step-two",
          objective: "Reach the finish",
          instruction: { primary: "Finish.", recovery: [] },
          success: { all: [{ kind: "visible_text", value: "Number is live" }] },
          timeoutSeconds: 1,
          maxAttempts: 3,
          sideEffect: "creates",
        },
      ],
    };

    const sink = new InMemoryEventSink();
    const pages = [
      page(),
      // step one never proven; the final outcome is visible instead
      page({ fingerprint: "done", notices: [{ kind: "success", text: "Number is live" }] }),
    ];
    let i = 0;

    const controller = new SessionController({
      sessionId: "ahead",
      flow: twoStep,
      budgets: {
        maxSessionSeconds: 300,
        maxVoiceMinutes: 10,
        maxAttemptsPerStep: 3,
        maxTotalSteps: 20,
      },
      sink,
      voice: { say: async () => {}, pushContext: async () => {} },
      observer: {
        snapshot: async () => pages[Math.min(i, pages.length - 1)],
        waitForChange: async () => {
          i += 1;
          return "changed";
        },
      },
    });

    await controller.start({ provider: "mock" });
    await controller.selectGoal("test");
    await controller.runStep();

    expect(controller.current.state).toBe("completed");
    expect(controller.current.terminalReason).toContain("ahead of guidance");
    expect(terminalEvents(sink)).toHaveLength(1);
  });

  it("clears stuck signals once a step is proven", async () => {
    // Step one fails twice (two signals), then passes. Those signals must not
    // count against step two, or its first failure jumps straight to handoff.
    const { controller } = harness([
      page(),
      page(),
      page({ route: "/two", fingerprint: "two" }),
    ]);

    await controller.start({ provider: "mock" });
    await controller.selectGoal("test");
    await controller.runStep();
    expect(controller.current.stuckSignals.length).toBeGreaterThan(0);

    await controller.runStep();
    expect(controller.current.state).toBe("completed");
    expect(controller.current.stuckSignals).toEqual([]);
  });

  it("rejects a goal the flow does not support", async () => {
    const { controller } = harness([page()]);
    await controller.start({ provider: "mock" });
    expect(await controller.selectGoal("order a pizza")).toBe(false);
  });
});
