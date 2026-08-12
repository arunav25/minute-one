import { describe, expect, it } from "vitest";
import type { LeafRule, RuleGroup } from "@minute-one/core";
import { acmeBookingFlow } from "./acme-flow";

/**
 * Authoring invariants for the demo journey.
 *
 * These test the *content*, not the engine: the engine cannot tell a strong
 * success condition from a worthless one. A step that "proves" itself with text
 * an earlier step already put on screen would pass before the user acts, and no
 * engine test would notice. This is the guard that does.
 */

function leaves(group: RuleGroup | undefined): LeafRule[] {
  if (!group) return [];
  const out: LeafRule[] = [];
  const walk = (g: RuleGroup) => {
    for (const rule of [...(g.all ?? []), ...(g.any ?? [])]) {
      if ("kind" in rule) out.push(rule as LeafRule);
      else walk(rule as RuleGroup);
    }
  };
  walk(group);
  return out;
}

describe("Acme demo journey", () => {
  it("gives every step at least one success condition", () => {
    for (const step of acmeBookingFlow.steps) {
      expect(
        leaves(step.success).length,
        `step "${step.id}" has no success condition, so it can never be proven`
      ).toBeGreaterThan(0);
    }
  });

  it("never proves a step with text an earlier step already put on screen", () => {
    const seen = new Set<string>();
    for (const step of acmeBookingFlow.steps) {
      for (const rule of leaves(step.success)) {
        if (rule.kind !== "visible_text") continue;
        expect(
          seen.has(rule.value.toLowerCase()),
          `step "${step.id}" proves itself with "${rule.value}", which an ` +
            `earlier step already made visible — it would pass before the user acts`
        ).toBe(false);
      }
      const label = step.target?.name ?? step.target?.label;
      if (label) seen.add(label.toLowerCase());
    }
  });

  it("has a wrong/right branch the guide can catch", () => {
    // The whole demo hinges on one step whose success is a specific control
    // being selected — so choosing the other option leaves it unproven.
    const branch = acmeBookingFlow.steps.find((s) =>
      leaves(s.success).some((r) => r.kind === "control_state")
    );
    expect(branch, "no control_state step to demonstrate a blocked wrong action").toBeDefined();
  });

  it("proves the final, side-effecting step with an after-only signal", () => {
    const last = acmeBookingFlow.steps[acmeBookingFlow.steps.length - 1];
    expect(last.sideEffect).toBe("creates");
    // notice_present can only be true after the action; a click alone cannot
    // satisfy it.
    expect(leaves(last.success).some((r) => r.kind === "notice_present")).toBe(true);
  });
});
