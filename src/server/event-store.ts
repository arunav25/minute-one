import { SEED_EVENTS, type SessionEvent } from "@minute-one/core";

/**
 * Process-local event store, shared by the ingest route and the report page.
 *
 * It lives in its own module because importing the route handler from the page
 * gave them separate module instances: events POSTed over HTTP landed in one
 * copy while the report read an empty one, so live sessions silently never
 * appeared.
 *
 * Deliberately not a database. The report has to be truthful about the current
 * run and work on a clean clone; surviving a restart is not a requirement.
 */
const live: SessionEvent[] = [];

/**
 * Which product each session came from.
 *
 * Held beside the events rather than inside them: attribution is a property of
 * the embed that reported, not of the session itself, and `SessionEvent` lives
 * in the generic core, which knows nothing about products.
 */
const productBySession = new Map<string, string>();

/**
 * Who the host application said was in each session.
 *
 * Same reasoning as the product map: identity comes from the embed, not from
 * the session, and the generic core must not learn about users.
 */
export type SessionIdentity = {
  userId?: string;
  email?: string;
  name?: string;
  createdAt?: string;
  locale?: string;
  companyId?: string;
  companyName?: string;
  meta?: Record<string, string>;
};

const identityBySession = new Map<string, SessionIdentity>();

export function isSessionEvent(value: unknown): value is SessionEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<SessionEvent>;
  return (
    typeof e.sessionId === "string" &&
    typeof e.sequence === "number" &&
    typeof e.at === "string" &&
    typeof e.type === "string"
  );
}

/** Idempotent on (sessionId, sequence), so a re-publish cannot double count. */
export function appendEvents(
  events: SessionEvent[],
  productKey?: string,
  identity?: SessionIdentity
): number {
  for (const event of events) {
    const exists = live.some(
      (e) => e.sessionId === event.sessionId && e.sequence === event.sequence
    );
    if (!exists) live.push(event);
    if (productKey) productBySession.set(event.sessionId, productKey);
    if (identity) identityBySession.set(event.sessionId, identity);
  }
  return live.length;
}

export function allEvents(): SessionEvent[] {
  return [...SEED_EVENTS, ...live];
}

/**
 * Events reported by one product's embed.
 *
 * Seeded fixtures are excluded: they were never produced by an install, and
 * counting them would make an empty product look like it had traffic.
 */
export function eventsForProduct(productKey: string): SessionEvent[] {
  return live.filter((e) => productBySession.get(e.sessionId) === productKey);
}

export function liveCount(): number {
  return live.length;
}

/** Identities for the given sessions, omitting any the host did not identify. */
export function identitiesFor(sessionIds: string[]): Record<string, SessionIdentity> {
  const out: Record<string, SessionIdentity> = {};
  for (const id of sessionIds) {
    const identity = identityBySession.get(id);
    if (identity) out[id] = identity;
  }
  return out;
}
