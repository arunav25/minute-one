import type { SessionEvent, SessionEventType } from "./types";

/**
 * Append-only, ordered event log.
 *
 * The failure invariant depends on this: every session writes exactly one
 * `session_ended` event, and it is written before any terminal UI is shown.
 */
export interface EventSink {
  append(event: SessionEvent): Promise<void> | void;
  list(sessionId?: string): Promise<SessionEvent[]> | SessionEvent[];
}

export class InMemoryEventSink implements EventSink {
  private events: SessionEvent[] = [];

  append(event: SessionEvent) {
    this.events.push(event);
  }

  list(sessionId?: string) {
    return sessionId
      ? this.events.filter((e) => e.sessionId === sessionId)
      : [...this.events];
  }

  clear() {
    this.events = [];
  }
}

export class EventRecorder {
  private sequence = 0;
  private ended = false;

  constructor(
    private readonly sessionId: string,
    private readonly sink: EventSink,
    private readonly now: () => Date = () => new Date()
  ) {}

  async record(
    type: SessionEventType,
    fields: Omit<SessionEvent, "sessionId" | "sequence" | "at" | "type"> = {}
  ): Promise<SessionEvent> {
    if (this.ended && type !== "session_ended") {
      // Ordering guarantee: nothing may follow the terminal record.
      throw new Error(
        `refusing to append ${type} after session_ended for ${this.sessionId}`
      );
    }
    const event: SessionEvent = {
      sessionId: this.sessionId,
      sequence: this.sequence++,
      at: this.now().toISOString(),
      type,
      ...fields,
    };
    await this.sink.append(event);
    if (type === "session_ended") this.ended = true;
    return event;
  }

  get hasEnded() {
    return this.ended;
  }

  get count() {
    return this.sequence;
  }
}
