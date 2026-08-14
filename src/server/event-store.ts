import { SEED_EVENTS, type SessionEvent } from "@minute-one/core";
import { dbConfigured, getSql } from "./db";

/**
 * Session events — what the console's Sessions view reads.
 *
 * These were process-local, on the reasoning that a report only had to be
 * truthful about the current run. That assumption broke twice over: a dev
 * restart wiped every session, and on serverless each request is a new process,
 * so a deployed console could never show a session at all. What a customer
 * wants from Sessions is precisely the history — "someone talked to the guide
 * yesterday and got stuck here" — so it has to outlive the process.
 *
 * Neon when DATABASE_URL is set, in-memory otherwise, so tests and offline dev
 * still run with no database. Same split as the product and knowledge stores.
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

let ready: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  if (!ready) {
    const sql = getSql();
    ready = (async () => {
      // (session_id, sequence) as the key makes re-publishing idempotent in the
      // database itself, which is the same guarantee the in-memory path gives.
      await sql`
        CREATE TABLE IF NOT EXISTS session_events (
          session_id  TEXT NOT NULL,
          sequence    INT  NOT NULL,
          product_key TEXT,
          type        TEXT NOT NULL,
          at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          data        JSONB NOT NULL,
          PRIMARY KEY (session_id, sequence)
        )`;
      await sql`CREATE INDEX IF NOT EXISTS session_events_product_idx ON session_events (product_key)`;
      await sql`
        CREATE TABLE IF NOT EXISTS session_identities (
          session_id TEXT PRIMARY KEY,
          data       JSONB NOT NULL
        )`;
    })().catch((err) => {
      // Let the next call retry rather than caching a failure forever.
      ready = null;
      throw err;
    });
  }
  return ready;
}

/** Idempotent on (sessionId, sequence), so a re-publish cannot double count. */
export async function appendEvents(
  events: SessionEvent[],
  productKey?: string,
  identity?: SessionIdentity
): Promise<number> {
  if (dbConfigured()) {
    const sql = getSql();
    await ensureTables();
    const statements = events.map(
      (event) =>
        sql`INSERT INTO session_events (session_id, sequence, product_key, type, at, data)
            VALUES (${event.sessionId}, ${event.sequence}, ${productKey ?? null},
                    ${event.type}, ${event.at}, ${JSON.stringify(event)}::jsonb)
            ON CONFLICT (session_id, sequence) DO NOTHING`
    );
    if (identity) {
      const ids = [...new Set(events.map((e) => e.sessionId))];
      for (const id of ids) {
        statements.push(
          sql`INSERT INTO session_identities (session_id, data)
              VALUES (${id}, ${JSON.stringify(identity)}::jsonb)
              ON CONFLICT (session_id) DO UPDATE SET data = EXCLUDED.data`
        );
      }
    }
    if (statements.length) await sql.transaction(statements);
    const rows = (await sql`SELECT count(*)::int AS n FROM session_events`) as Array<{
      n: number;
    }>;
    return rows[0]?.n ?? 0;
  }

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

async function storedEvents(productKey?: string): Promise<SessionEvent[]> {
  try {
    const sql = getSql();
    await ensureTables();
    const rows = (await (productKey
      ? sql`SELECT data FROM session_events WHERE product_key = ${productKey}
            ORDER BY session_id, sequence`
      : sql`SELECT data FROM session_events ORDER BY session_id, sequence`)) as Array<{
      data: SessionEvent;
    }>;
    return rows.map((r) => r.data);
  } catch {
    // Unreachable database must not blank the console with an error; an empty
    // list reads the same as "no sessions yet", which the panel already states.
    return [];
  }
}

export async function allEvents(): Promise<SessionEvent[]> {
  if (dbConfigured()) return [...SEED_EVENTS, ...(await storedEvents())];
  return [...SEED_EVENTS, ...live];
}

/**
 * Events reported by one product's embed.
 *
 * Seeded fixtures are excluded: they were never produced by an install, and
 * counting them would make an empty product look like it had traffic.
 */
export async function eventsForProduct(productKey: string): Promise<SessionEvent[]> {
  if (dbConfigured()) return storedEvents(productKey);
  return live.filter((e) => productBySession.get(e.sessionId) === productKey);
}

/** Identities for the given sessions, omitting any the host did not identify. */
export async function identitiesFor(
  sessionIds: string[]
): Promise<Record<string, SessionIdentity>> {
  const out: Record<string, SessionIdentity> = {};
  if (dbConfigured()) {
    if (!sessionIds.length) return out;
    try {
      const sql = getSql();
      await ensureTables();
      const rows = (await sql`
        SELECT session_id, data FROM session_identities
        WHERE session_id = ANY(${sessionIds})`) as Array<{
        session_id: string;
        data: SessionIdentity;
      }>;
      for (const r of rows) out[r.session_id] = r.data;
    } catch {
      // As above: no identities is a truthful answer, an exception is not.
    }
    return out;
  }
  for (const id of sessionIds) {
    const identity = identityBySession.get(id);
    if (identity) out[id] = identity;
  }
  return out;
}
