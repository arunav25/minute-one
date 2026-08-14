import { NextResponse } from "next/server";
import {
  allEvents,
  appendEvents,
  eventsForProduct,
  identitiesFor,
  isSessionEvent,
  type SessionIdentity,
} from "../../../../src/server/event-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The script reports from whatever origin it is embedded on, so this has to
 * answer cross-origin. Reflecting the caller costs nothing here: the endpoint
 * only accepts session events and hands out no credential.
 */
function cors(origin: string | null) {
  return {
    "access-control-allow-origin": origin ?? "*",
    "cache-control": "no-store",
    vary: "origin",
  };
}

/**
 * Session event ingest. The store itself lives in src/server/event-store so the
 * report page reads the same instance these writes land in.
 */
export async function POST(req: Request) {
  const headers = cors(req.headers.get("origin"));

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "malformed json" }, { status: 400, headers });
  }

  const incoming = (body as { events?: unknown }).events;
  if (!Array.isArray(incoming)) {
    return NextResponse.json(
      { error: "events must be an array" },
      { status: 400, headers }
    );
  }

  const valid = incoming.filter(isSessionEvent);
  if (valid.length !== incoming.length) {
    return NextResponse.json(
      { error: "one or more events were malformed" },
      { status: 400, headers }
    );
  }

  const { productKey, identity } = body as {
    productKey?: unknown;
    identity?: unknown;
  };
  const stored = await appendEvents(
    valid,
    typeof productKey === "string" ? productKey : undefined,
    identity && typeof identity === "object"
      ? (identity as SessionIdentity)
      : undefined
  );
  return NextResponse.json({ ok: true, stored }, { headers });
}

export async function GET(req: Request) {
  // `?key=` scopes the log to one product, which is what the console shows.
  const key = new URL(req.url).searchParams.get("key");
  const events = key ? await eventsForProduct(key) : await allEvents();
  return NextResponse.json(
    {
      events,
      identities: await identitiesFor([
        ...new Set(events.map((e) => e.sessionId)),
      ]),
    },
    { headers: cors(req.headers.get("origin")) }
  );
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...cors(req.headers.get("origin")),
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
