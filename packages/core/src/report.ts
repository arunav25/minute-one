import type { SessionEvent } from "./types";

/**
 * Pure aggregation over the event log. No storage, no rendering, no filters —
 * four numbers and a step table, which is what an activation owner actually
 * needs to act on.
 */

export type StepRow = {
  stepId: string;
  instructed: number;
  failedChecks: number;
  recoveries: number;
  passed: boolean;
  topMissing: string | null;
  medianMs: number | null;
};

export type SessionSummary = {
  sessionId: string;
  terminal: string | null;
  reason: string | null;
  durationMs: number | null;
  provider: string | null;
  model: string | null;
  isRealVoice: boolean | null;
  providerSessionId: string | null;
  voiceMinutes: number | null;
  handoffOffered: boolean;
  handoffAccepted: boolean;
};

export type ReportData = {
  completionRate: number;
  medianCompletionMs: number | null;
  topFailedStep: string | null;
  recoveryRate: number;
  sessions: SessionSummary[];
  steps: StepRow[];
  realVoiceSessions: number;
  totalVoiceMinutes: number;
};

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

export function buildReport(events: SessionEvent[]): ReportData {
  const bySession = new Map<string, SessionEvent[]>();
  for (const e of events) {
    const list = bySession.get(e.sessionId) ?? [];
    list.push(e);
    bySession.set(e.sessionId, list);
  }

  const sessions: SessionSummary[] = [];
  for (const [sessionId, list] of bySession) {
    const ordered = [...list].sort((a, b) => a.sequence - b.sequence);
    const ended = ordered.find((e) => e.type === "session_ended");
    const provider = ordered.find((e) => e.type === "voice_provider");

    sessions.push({
      sessionId,
      terminal: (ended?.detail?.terminal as string) ?? null,
      reason: ended?.reason ?? null,
      durationMs: ended?.durationMs ?? null,
      provider: (provider?.detail?.provider as string) ?? null,
      model: (provider?.detail?.model as string) ?? null,
      isRealVoice: (provider?.detail?.isRealVoice as boolean) ?? null,
      providerSessionId:
        (provider?.detail?.providerSessionId as string | null) ?? null,
      voiceMinutes: (ended?.detail?.voiceMinutes as number) ?? null,
      handoffOffered: ordered.some((e) => e.type === "handoff_offered"),
      handoffAccepted: ordered.some((e) => e.type === "handoff_accepted"),
    });
  }

  // Step aggregation
  const stepMap = new Map<string, StepRow & { missing: string[]; durations: number[] }>();
  const touch = (stepId: string) => {
    let row = stepMap.get(stepId);
    if (!row) {
      row = {
        stepId,
        instructed: 0,
        failedChecks: 0,
        recoveries: 0,
        passed: false,
        topMissing: null,
        medianMs: null,
        missing: [],
        durations: [],
      };
      stepMap.set(stepId, row);
    }
    return row;
  };

  for (const e of events) {
    if (!e.stepId) continue;
    const row = touch(e.stepId);
    if (e.type === "step_instructed") row.instructed += 1;
    if (e.type === "recovery_spoken") row.recoveries += 1;
    if (e.type === "verification_checked") {
      if (e.reason?.startsWith("passed")) row.passed = true;
      else {
        row.failedChecks += 1;
        if (e.reason) row.missing.push(e.reason);
      }
    }
    if (e.durationMs) row.durations.push(e.durationMs);
  }

  const steps: StepRow[] = [...stepMap.values()].map((r) => ({
    stepId: r.stepId,
    instructed: r.instructed,
    failedChecks: r.failedChecks,
    recoveries: r.recoveries,
    passed: r.passed,
    topMissing: mode(r.missing),
    medianMs: median(r.durations),
  }));

  const completed = sessions.filter((s) => s.terminal === "completed");
  const completionRate = sessions.length
    ? completed.length / sessions.length
    : 0;

  const failedSteps = steps.filter((s) => s.failedChecks > 0);
  const topFailedStep =
    failedSteps.sort((a, b) => b.failedChecks - a.failedChecks)[0]?.stepId ??
    null;

  const totalRecoveries = steps.reduce((n, s) => n + s.recoveries, 0);
  const recoveredSteps = steps.filter((s) => s.recoveries > 0 && s.passed).length;
  const recoveryRate = totalRecoveries
    ? recoveredSteps / steps.filter((s) => s.recoveries > 0).length
    : 0;

  return {
    completionRate,
    medianCompletionMs: median(
      completed.map((s) => s.durationMs ?? 0).filter(Boolean)
    ),
    topFailedStep,
    recoveryRate,
    sessions: sessions.sort((a, b) => (a.sessionId < b.sessionId ? 1 : -1)),
    steps,
    realVoiceSessions: sessions.filter((s) => s.isRealVoice === true).length,
    totalVoiceMinutes: Number(
      sessions.reduce((n, s) => n + (s.voiceMinutes ?? 0), 0).toFixed(2)
    ),
  };
}

function mode(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
