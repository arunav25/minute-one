import type { BudgetUsage, BudgetVerdict, Budgets } from "./types";

/**
 * Time, voice-minute, attempt and step ceilings. Checked before every
 * instruction and every retry, so a stuck session ends with `deadline`
 * rather than looping until someone closes the tab.
 */
export function checkBudgets(
  budgets: Budgets,
  usage: BudgetUsage
): BudgetVerdict {
  if (usage.elapsedSeconds >= budgets.maxSessionSeconds) {
    return {
      exhausted: true,
      reason: `session time limit of ${budgets.maxSessionSeconds}s reached`,
    };
  }
  if (usage.voiceMinutes >= budgets.maxVoiceMinutes) {
    return {
      exhausted: true,
      reason: `voice budget of ${budgets.maxVoiceMinutes} minutes reached`,
    };
  }
  if (usage.stepsInstructed >= budgets.maxTotalSteps) {
    return {
      exhausted: true,
      reason: `step limit of ${budgets.maxTotalSteps} reached`,
    };
  }
  return { exhausted: false };
}

export function attemptsExhausted(attempt: number, maxAttempts: number): boolean {
  return attempt >= maxAttempts;
}
