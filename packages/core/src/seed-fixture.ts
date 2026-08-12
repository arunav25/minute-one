import type { SessionEvent } from "./types";

/**
 * Three seeded sessions so the report is meaningful on a clean clone, with no
 * external setup. Clearly labelled as sample data in the UI.
 */
const base = (sessionId: string, at: string) => ({ sessionId, at });

/** Fixture data for report tests; the demo host has its own copy. */
export const SEED_EVENTS: SessionEvent[] = [
  // 1. Clean completion, real voice.
  { ...base("seed_completed", "2026-08-11T09:00:00.000Z"), sequence: 0, type: "session_started", detail: { flowId: "setup-sales-number", sample: true } },
  { ...base("seed_completed", "2026-08-11T09:00:00.100Z"), sequence: 1, type: "voice_provider", detail: { provider: "pyai", model: "omni-realtime", isRealVoice: true, providerSessionId: "omni_seed_a1", sample: true } },
  { ...base("seed_completed", "2026-08-11T09:00:02.000Z"), sequence: 2, type: "goal_selected", detail: { flowId: "setup-sales-number" } },
  { ...base("seed_completed", "2026-08-11T09:00:03.000Z"), sequence: 3, type: "step_instructed", stepId: "open-phone-numbers", attempt: 1 },
  { ...base("seed_completed", "2026-08-11T09:00:09.000Z"), sequence: 4, type: "verification_checked", stepId: "open-phone-numbers", attempt: 1, reason: "passed", durationMs: 6000 },
  { ...base("seed_completed", "2026-08-11T09:00:10.000Z"), sequence: 5, type: "step_instructed", stepId: "start-add-number", attempt: 1 },
  { ...base("seed_completed", "2026-08-11T09:00:15.000Z"), sequence: 6, type: "verification_checked", stepId: "start-add-number", attempt: 1, reason: "passed", durationMs: 5000 },
  { ...base("seed_completed", "2026-08-11T09:00:16.000Z"), sequence: 7, type: "step_instructed", stepId: "choose-number", attempt: 1 },
  { ...base("seed_completed", "2026-08-11T09:00:21.000Z"), sequence: 8, type: "verification_checked", stepId: "choose-number", attempt: 1, reason: "passed", durationMs: 5000 },
  { ...base("seed_completed", "2026-08-11T09:00:22.000Z"), sequence: 9, type: "step_instructed", stepId: "assign-sales-team", attempt: 1 },
  { ...base("seed_completed", "2026-08-11T09:00:29.000Z"), sequence: 10, type: "verification_checked", stepId: "assign-sales-team", attempt: 1, reason: "passed", durationMs: 7000 },
  { ...base("seed_completed", "2026-08-11T09:00:30.000Z"), sequence: 11, type: "step_instructed", stepId: "confirm-setup", attempt: 1 },
  { ...base("seed_completed", "2026-08-11T09:00:38.000Z"), sequence: 12, type: "verification_checked", stepId: "confirm-setup", attempt: 1, reason: "passed", durationMs: 8000 },
  { ...base("seed_completed", "2026-08-11T09:00:38.500Z"), sequence: 13, type: "session_ended", reason: "final postcondition proven", durationMs: 38500, detail: { terminal: "completed", stepsProven: 5, voiceMinutes: 0.64, sample: true } },

  // 2. Wrong team, recovered on the second attempt.
  { ...base("seed_recovered", "2026-08-11T10:00:00.000Z"), sequence: 0, type: "session_started", detail: { flowId: "setup-sales-number", sample: true } },
  { ...base("seed_recovered", "2026-08-11T10:00:00.100Z"), sequence: 1, type: "voice_provider", detail: { provider: "pyai", model: "omni-realtime", isRealVoice: true, providerSessionId: "omni_seed_b2", sample: true } },
  { ...base("seed_recovered", "2026-08-11T10:00:01.000Z"), sequence: 2, type: "goal_selected" },
  { ...base("seed_recovered", "2026-08-11T10:00:02.000Z"), sequence: 3, type: "step_instructed", stepId: "assign-sales-team", attempt: 1 },
  { ...base("seed_recovered", "2026-08-11T10:00:12.000Z"), sequence: 4, type: "verification_checked", stepId: "assign-sales-team", attempt: 1, reason: 'control "Sales" is selected', durationMs: 10000 },
  { ...base("seed_recovered", "2026-08-11T10:00:12.100Z"), sequence: 5, type: "stuck_signal", stepId: "assign-sales-team", reason: "unchanged_fingerprint" },
  { ...base("seed_recovered", "2026-08-11T10:00:12.500Z"), sequence: 6, type: "recovery_spoken", stepId: "assign-sales-team", attempt: 1, reason: "recognition" },
  { ...base("seed_recovered", "2026-08-11T10:00:13.000Z"), sequence: 7, type: "step_instructed", stepId: "assign-sales-team", attempt: 2 },
  { ...base("seed_recovered", "2026-08-11T10:00:20.000Z"), sequence: 8, type: "verification_checked", stepId: "assign-sales-team", attempt: 2, reason: "passed", durationMs: 7000 },
  { ...base("seed_recovered", "2026-08-11T10:00:21.000Z"), sequence: 9, type: "step_instructed", stepId: "confirm-setup", attempt: 1 },
  { ...base("seed_recovered", "2026-08-11T10:00:27.000Z"), sequence: 10, type: "verification_checked", stepId: "confirm-setup", attempt: 1, reason: "passed", durationMs: 6000 },
  { ...base("seed_recovered", "2026-08-11T10:00:27.500Z"), sequence: 11, type: "session_ended", reason: "final postcondition proven", durationMs: 27500, detail: { terminal: "completed", stepsProven: 5, voiceMinutes: 0.46, sample: true } },

  // 3. Exhausted attempts, phone help offered and accepted.
  { ...base("seed_handoff", "2026-08-11T11:00:00.000Z"), sequence: 0, type: "session_started", detail: { flowId: "setup-sales-number", sample: true } },
  { ...base("seed_handoff", "2026-08-11T11:00:00.100Z"), sequence: 1, type: "voice_provider", detail: { provider: "pyai", model: "omni-realtime", isRealVoice: true, providerSessionId: "omni_seed_c3", sample: true } },
  { ...base("seed_handoff", "2026-08-11T11:00:01.000Z"), sequence: 2, type: "goal_selected" },
  { ...base("seed_handoff", "2026-08-11T11:00:02.000Z"), sequence: 3, type: "step_instructed", stepId: "open-phone-numbers", attempt: 1 },
  { ...base("seed_handoff", "2026-08-11T11:00:28.000Z"), sequence: 4, type: "verification_checked", stepId: "open-phone-numbers", attempt: 1, reason: 'route matches "/fixture/phone-numbers*"', durationMs: 26000 },
  { ...base("seed_handoff", "2026-08-11T11:00:28.100Z"), sequence: 5, type: "stuck_signal", stepId: "open-phone-numbers", reason: "verification_timeout" },
  { ...base("seed_handoff", "2026-08-11T11:00:28.500Z"), sequence: 6, type: "recovery_spoken", stepId: "open-phone-numbers", attempt: 1, reason: "location" },
  { ...base("seed_handoff", "2026-08-11T11:00:29.000Z"), sequence: 7, type: "step_instructed", stepId: "open-phone-numbers", attempt: 2 },
  { ...base("seed_handoff", "2026-08-11T11:00:55.000Z"), sequence: 8, type: "verification_checked", stepId: "open-phone-numbers", attempt: 2, reason: 'route matches "/fixture/phone-numbers*"', durationMs: 26000 },
  { ...base("seed_handoff", "2026-08-11T11:00:55.100Z"), sequence: 9, type: "stuck_signal", stepId: "open-phone-numbers", reason: "verification_timeout" },
  { ...base("seed_handoff", "2026-08-11T11:00:55.500Z"), sequence: 10, type: "recovery_spoken", stepId: "open-phone-numbers", attempt: 2, reason: "recognition" },
  { ...base("seed_handoff", "2026-08-11T11:00:56.000Z"), sequence: 11, type: "step_instructed", stepId: "open-phone-numbers", attempt: 3 },
  { ...base("seed_handoff", "2026-08-11T11:01:22.000Z"), sequence: 12, type: "verification_checked", stepId: "open-phone-numbers", attempt: 3, reason: 'route matches "/fixture/phone-numbers*"', durationMs: 26000 },
  { ...base("seed_handoff", "2026-08-11T11:01:22.500Z"), sequence: 13, type: "handoff_offered", stepId: "open-phone-numbers", attempt: 3, reason: "attempts exhausted" },
  { ...base("seed_handoff", "2026-08-11T11:01:30.000Z"), sequence: 14, type: "handoff_accepted", stepId: "open-phone-numbers" },
  { ...base("seed_handoff", "2026-08-11T11:01:30.500Z"), sequence: 15, type: "session_ended", reason: "user moved to phone help", durationMs: 90500, detail: { terminal: "partial", stepsProven: 0, voiceMinutes: 1.51, sample: true } },
];
