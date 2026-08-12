/**
 * Redaction applied before any page text can reach a model or the event log.
 *
 * Deliberately aggressive: a false positive costs the persona a little
 * context, a false negative leaks a customer's phone number to a third party.
 */

const PATTERNS: Array<[RegExp, string]> = [
  // Long digit runs first, so a phone number is not partially eaten by others.
  [/\+?\d[\d\s().-]{7,}\d/g, "[redacted-number]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted-email]"],
  [/\b(?:sk|pk|api|key|token|bearer)[_-][A-Za-z0-9._-]{8,}\b/gi, "[redacted-key]"],
  [/\b(?:\d[ -]*?){13,19}\b/g, "[redacted-card]"],
];

export function redactText(input: string): string {
  let out = input;
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Caps a string so one verbose page cannot blow up a context packet. */
export function clampText(input: string, max: number): string {
  const trimmed = input.replace(/\s+/g, " ").trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

export function sanitise(input: string, max = 160): string {
  return clampText(redactText(input), max);
}
