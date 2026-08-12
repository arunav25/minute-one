import type { HostEvent } from "./types";

/**
 * Ring buffer of host- and backend-reported events.
 *
 * The host calls `track("number.provisioned", {...})`; that lands here and can
 * satisfy a `host_event` rule. It is evidence the verifier may consult, not a
 * command — a host cannot advance the guide by shouting the right event name,
 * because the step's rule group still has to pass as a whole.
 */
export class EvidenceLog {
  private events: HostEvent[] = [];

  constructor(private readonly limit = 100) {}

  record(event: HostEvent) {
    this.events.push(event);
    if (this.events.length > this.limit) {
      this.events = this.events.slice(-this.limit);
    }
  }

  /** Most recent matching event within the window, if any. */
  find(
    name: string,
    source: HostEvent["source"],
    payload?: Record<string, string>,
    withinMs?: number,
    now: number = Date.now()
  ): HostEvent | undefined {
    return [...this.events].reverse().find((e) => {
      if (e.name !== name || e.source !== source) return false;
      if (withinMs !== undefined && now - e.at > withinMs) return false;
      if (payload) {
        for (const [key, expected] of Object.entries(payload)) {
          const actual = e.payload?.[key];
          if (String(actual ?? "").trim() !== expected.trim()) return false;
        }
      }
      return true;
    });
  }

  all(): HostEvent[] {
    return [...this.events];
  }

  clear() {
    this.events = [];
  }
}
