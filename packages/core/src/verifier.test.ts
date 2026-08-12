import { describe, expect, it } from "vitest";
import { countIndependentSignals, verifyStep } from "./verifier";
import type { PageSnapshot } from "./types";

const snap = (over: Partial<PageSnapshot> = {}): PageSnapshot => ({
  url: "http://x/fixture/phone-numbers",
  route: "/fixture/phone-numbers",
  title: "Phone Numbers",
  headings: ["Phone Numbers"],
  controls: [
    { id: "a", role: "button", name: "Add Number", state: "enabled" },
    { id: "b", role: "button", name: "Sales", state: "enabled" },
    { id: "c", role: "button", name: "Confirm setup", state: "disabled" },
  ],
  dialogs: [],
  notices: [],
  text: "",
  fingerprint: "abc",
  observedAt: "2026-08-11T00:00:00.000Z",
  ...over,
});

describe("verifier", () => {
  it("passes when every rule in `all` holds", () => {
    const r = verifyStep(
      "s",
      {
        all: [
          { kind: "route_matches", value: "/fixture/phone-numbers*" },
          { kind: "visible_text", value: "Phone Numbers" },
        ],
      },
      snap()
    );
    expect(r.passed).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("fails and names the missing rule", () => {
    const r = verifyStep(
      "s",
      { all: [{ kind: "visible_text", value: "Number is live" }] },
      snap()
    );
    expect(r.passed).toBe(false);
    expect(r.missing[0]).toContain("Number is live");
  });

  it("matches control state exactly", () => {
    const enabled = verifyStep(
      "s",
      { all: [{ kind: "control_state", value: "Confirm setup", state: "enabled" }] },
      snap()
    );
    expect(enabled.passed).toBe(false);

    const disabled = verifyStep(
      "s",
      { all: [{ kind: "control_state", value: "Confirm setup", state: "disabled" }] },
      snap()
    );
    expect(disabled.passed).toBe(true);
  });

  it("supports any and not", () => {
    const any = verifyStep(
      "s",
      {
        any: [
          { kind: "visible_text", value: "nope" },
          { kind: "visible_text", value: "Add Number" },
        ],
      },
      snap()
    );
    expect(any.passed).toBe(true);

    const not = verifyStep(
      "s",
      { not: { kind: "visible_text", value: "Add Number" } },
      snap()
    );
    expect(not.passed).toBe(false);
  });

  it("matches label text that lives in plain body copy, not just controls", () => {
    const r = verifyStep(
      "s",
      { all: [{ kind: "visible_text", value: "Assign to team" }] },
      snap({ text: "Review +1 415 555 0142 ASSIGN TO TEAM Sales Support" })
    );
    expect(r.passed).toBe(true);
  });

  it("treats a step with no success condition as unproven", () => {
    const r = verifyStep("s", {}, snap());
    expect(r.passed).toBe(false);
    expect(r.missing[0]).toContain("no success condition");
  });

  it("detects notices by kind and text", () => {
    const r = verifyStep(
      "s",
      { all: [{ kind: "notice_present", value: "Number is live" }] },
      snap({ notices: [{ kind: "success", text: "Number is live" }] })
    );
    expect(r.passed).toBe(true);
    expect(r.evidence[0].observed).toContain("success notice");
  });

  it("counts independent signals so a final step cannot rest on one", () => {
    expect(
      countIndependentSignals({
        all: [
          { kind: "notice_present", value: "live" },
          { kind: "visible_text", value: "Sales" },
          { kind: "route_matches", value: "/x*" },
        ],
      })
    ).toBe(3);
  });
});
