import { NextResponse } from "next/server";
import PyAI from "@pyai/sdk";
import { getProductByKey } from "../../../../src/server/product-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The script runs on other origins, so this responds cross-origin. Minting is
 * the one thing here that costs money, so the caller's origin is echoed only
 * after it has been approved — never `*`.
 */
function cors(origin: string | null) {
  return {
    "access-control-allow-origin": origin ?? "http://localhost:3200",
    "cache-control": "no-store",
    vary: "origin",
  };
}

/** Local development origins, allowed when a product has no explicit list. */
function isLocal(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/**
 * Decide whether this page may mint a voice token.
 *
 * A product key is public — it travels in the host page's script tag — so it
 * cannot be the only check. The origin has to match the allowlist recorded for
 * that product. Reject rather than fall back to a permissive default: the
 * failure mode of getting this wrong is a stranger's page spending the
 * account's voice minutes.
 */
function authorise(
  key: string | null,
  origin: string | null,
  self: string
): { ok: true; origins: string[] } | { ok: false; reason: string } {
  // The console and the demo product call this from Minute One's own pages.
  // They carry no product key, and a same-origin POST does send an Origin
  // header, so recognising this case by the absence of one is not enough.
  if (!origin) return { ok: true, origins: [self] };
  if (origin === self) return { ok: true, origins: [origin] };

  if (!key) {
    return { ok: false, reason: "a product key is required to mint voice from another origin" };
  }

  const product = getProductByKey(key);
  if (!product) return { ok: false, reason: "unknown product key" };

  if (product.allowedOrigins.length > 0) {
    return product.allowedOrigins.includes(origin)
      ? { ok: true, origins: [origin] }
      : { ok: false, reason: `origin ${origin} is not allowed for this product` };
  }

  // No allowlist configured yet. Local pages only, so an unfinished product
  // cannot be picked up and used from the internet.
  return isLocal(origin)
    ? { ok: true, origins: [origin] }
    : {
        ok: false,
        reason: `origin ${origin} has no allowlist entry — add it to this product's allowed origins`,
      };
}

/**
 * Mints a short-lived, origin-locked Omni session token.
 *
 * The secret key stays on the server. The browser receives only this token,
 * which expires in seconds and is bound to an allowed origin, and uses it as
 * the WebSocket subprotocol `pyai-key.<token>`.
 */
export async function POST(req: Request) {
  const apiKey = process.env.PYAI_API_KEY;
  const origin = req.headers.get("origin");
  const headers = cors(origin);

  if (!apiKey) {
    // Explicit and actionable. The client shows this verbatim rather than
    // silently dropping to the mock.
    return NextResponse.json(
      {
        error:
          "PYAI_API_KEY is not set on the server. Real voice is unavailable — set it in .env.local and restart.",
        code: "missing_api_key",
      },
      { status: 503, headers }
    );
  }

  const url = new URL(req.url);
  const decision = authorise(url.searchParams.get("key"), origin, url.origin);
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.reason, code: "origin_not_allowed" },
      { status: 403, headers }
    );
  }

  /*
   * `PYAI_ALLOWED_ORIGINS` narrows which origins may mint at all. It is a gate,
   * not a substitute for the caller's origin: a token has to be locked to the
   * origin the socket will actually come from, and locking it to a configured
   * value instead produces a token that mints happily and is then refused at
   * the WebSocket handshake with a bare 1006 and no diagnostic.
   */
  const configured = process.env.PYAI_ALLOWED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (origin && configured && configured.length > 0 && !configured.includes(origin)) {
    return NextResponse.json(
      {
        error: `origin ${origin} is not in PYAI_ALLOWED_ORIGINS`,
        code: "origin_not_allowed",
      },
      { status: 403, headers }
    );
  }

  // A browser token must be origin-locked; "*" is rejected by PyAI.
  const allowedOrigins = decision.origins;

  try {
    const client = new PyAI({ apiKey });
    const session = await client.omni.createSession({
      allowedOrigins,
      ttlSeconds: Number(process.env.PYAI_TOKEN_TTL_SECONDS ?? 120),
      /*
       * Binding a console-built Voice Agent goes through the session label.
       * Per the SDK typings, an agent profile "applies automatically when
       * connecting with session_label={agent_id}" — that is what supplies the
       * agent's voice and language. (`agentId` is the deprecated alias and is
       * ignored whenever a session label is set.)
       *
       * Minute One keeps sending its own persona and tools in `configure`, so
       * the verification contract does not move into the console: an agent can
       * change how the guide sounds, never what counts as proof.
       */
      sessionLabel: process.env.PYAI_AGENT_ID || "minute-one",
    });

    return NextResponse.json(
      {
        token: session.token,
        url: session.url,
        expiresAt: session.expires_at,
        /*
         * The agent profile is resolved at connect time, not at mint time, so
         * the browser needs the id to put on the connect URL. It is an
         * identifier, not a credential: it selects a profile and authorises
         * nothing. The token is still what lets the socket open.
         */
        agentId: process.env.PYAI_AGENT_ID || null,
      },
      { headers }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[session-token] PyAI createSession failed:", message);
    return NextResponse.json(
      {
        error: `PyAI session could not be created: ${message}`,
        code: "createSession_failed",
      },
      { status: 502, headers }
    );
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...cors(req.headers.get("origin")),
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
