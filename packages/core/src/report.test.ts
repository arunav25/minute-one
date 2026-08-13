import { describe, expect, it } from "vitest";
import { buildReport } from "./report";
import { SEED_EVENTS } from "./seed-fixture";

describe("report", () => {
  const report = buildReport(SEED_EVENTS);

  it("summarises the three seeded sessions", () => {
    expect(report.sessions).toHaveLength(3);
    expect(report.sessions.map((s) => s.terminal).sort()).toEqual([
      "completed",
      "completed",
      "partial",
    ]);
  });

  it("computes completion rate from terminal reasons", () => {
    expect(report.completionRate).toBeCloseTo(2 / 3, 5);
  });

  it("identifies the step that failed most often", () => {
    expect(report.topFailedStep).toBe("open-phone-numbers");
  });

  it("records which provider actually carried the voice", () => {
    expect(report.realVoiceSessions).toBe(3);
    expect(report.totalVoiceMinutes).toBeGreaterThan(0);
    expect(report.sessions.every((s) => s.provider === "deepgram")).toBe(true);
  });

  it("tracks handoff offers and acceptances", () => {
    const handoff = report.sessions.find((s) => s.sessionId === "seed_handoff");
    expect(handoff?.handoffOffered).toBe(true);
    expect(handoff?.handoffAccepted).toBe(true);
  });

  it("surfaces the most common missing evidence per step", () => {
    const row = report.steps.find((s) => s.stepId === "open-phone-numbers");
    expect(row?.failedChecks).toBe(3);
    expect(row?.topMissing).toContain("route matches");
  });

  it("returns zeroed metrics for an empty log rather than throwing", () => {
    const empty = buildReport([]);
    expect(empty.completionRate).toBe(0);
    expect(empty.sessions).toEqual([]);
    expect(empty.topFailedStep).toBeNull();
  });
});
