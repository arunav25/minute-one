import { NextResponse } from "next/server";
import { getProductByKey } from "../../../../src/server/product-store";
import { originAllowed, parseOrigins } from "../../../../src/server/origins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";


function cors(origin: string | null) {
  return {
    "access-control-allow-origin": origin ?? "http://localhost:3200",
    "cache-control": "no-store",
    vary: "origin",
  };
}

function isLocal(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/** A product key selects config; an origin allowlist authorises voice spend. */
async function authorise(
  key: string | null,
  origin: string | null,
  self: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!origin || origin === self) return { ok: true };
  if (!key) {
    return {
      ok: false,
      reason: "a product key is required to mint voice from another origin",
    };
  }

  const product = await getProductByKey(key);
  if (!product) return { ok: false, reason: "unknown product key" };
  if (product.allowedOrigins.length > 0) {
    return originAllowed(origin, product.allowedOrigins)
      ? { ok: true }
      : { ok: false, reason: `origin ${origin} is not allowed for this product` };
  }

  return isLocal(origin)
    ? { ok: true }
    : {
        ok: false,
        reason: `origin ${origin} has no allowlist entry. Add it to this product's allowed origins`,
      };
}

/**
 * Mints a temporary Deepgram bearer token. The long-lived key is used only in
 * this server-to-server request and is never returned to the browser.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  const url = new URL(req.url);

  /*
   * Which provider this mint is for.
   *
   * The client asks for one by name and falls back to the next if the socket
   * refuses to open, so this route mints for exactly what was asked and does
   * not silently substitute — a session that quietly ran on a different vendor
   * than the caller believed would make the provider proof a lie.
   */
  const provider = url.searchParams.get("provider") === "pyai" ? "pyai" : "deepgram";

  if (provider === "pyai") {
    return mintPyAI(req, url, origin, headers);
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "DEEPGRAM_API_KEY is not set on the server. Real voice is unavailable. Set it in .env.local and restart.",
        code: "missing_api_key",
      },
      { status: 503, headers }
    );
  }

  const decision = await authorise(url.searchParams.get("key"), origin, url.origin);
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.reason, code: "origin_not_allowed" },
      { status: 403, headers }
    );
  }

  const configuredOrigins = parseOrigins(process.env.DEEPGRAM_ALLOWED_ORIGINS);
  if (
    origin &&
    configuredOrigins.length > 0 &&
    !originAllowed(origin, configuredOrigins)
  ) {
    return NextResponse.json(
      {
        error: `origin ${origin} is not in DEEPGRAM_ALLOWED_ORIGINS`,
        code: "origin_not_allowed",
      },
      { status: 403, headers }
    );
  }

  const ttlSeconds = clampTtl(process.env.DEEPGRAM_TOKEN_TTL_SECONDS);

  try {
    const response = await fetch(DEEPGRAM_GRANT_URL, {
      method: "POST",
      headers: {
        authorization: `Token ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: ttlSeconds }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      err_msg?: string;
      message?: string;
    };

    if (!response.ok || !body.access_token) {
      throw new Error(body.err_msg ?? body.message ?? `HTTP ${response.status}`);
    }

    return NextResponse.json(
      {
        token: body.access_token,
        expiresIn: body.expires_in ?? ttlSeconds,
        models: {
          listen: process.env.DEEPGRAM_LISTEN_MODEL || "flux-general-en",
          think: process.env.DEEPGRAM_THINK_MODEL || "gpt-4o-mini",
          speak: process.env.DEEPGRAM_SPEAK_MODEL || "aura-2-thalia-en",
        },
      },
      { headers }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[session-token] Deepgram grant failed:", message);
    return NextResponse.json(
      {
        error: `Deepgram session could not be created: ${message}`,
        code: "create_session_failed",
      },
      { status: 502, headers }
    );
  }
}

/**
 * Mint a short-lived PyAI Omni session token.
 *
 * Same shape of guarantee as the Deepgram path: the long-lived key stays on the
 * server, the browser receives a token that expires, and the calling origin is
 * checked against both the product's allowlist and this server's own spend gate
 * before anything is minted.
 */
async function mintPyAI(
  req: Request,
  url: URL,
  origin: string | null,
  headers: Record<string, string>
) {
  const apiKey = process.env.PYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "PYAI_API_KEY is not set on the server.", code: "missing_api_key" },
      { status: 503, headers }
    );
  }

  const decision = await authorise(url.searchParams.get("key"), origin, url.origin);
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.reason, code: "origin_not_allowed" },
      { status: 403, headers }
    );
  }

  const configuredOrigins = parseOrigins(process.env.PYAI_ALLOWED_ORIGINS);
  if (
    origin &&
    configuredOrigins.length > 0 &&
    !originAllowed(origin, configuredOrigins)
  ) {
    return NextResponse.json(
      { error: `origin ${origin} is not in PYAI_ALLOWED_ORIGINS`, code: "origin_not_allowed" },
      { status: 403, headers }
    );
  }

  const ttlSeconds = clampTtl(process.env.PYAI_TOKEN_TTL_SECONDS);

  /*
   * A minted browser token must be origin-locked, and PyAI rejects `*` — so a
   * request that arrived without an Origin header has nothing safe to lock to.
   * Same-origin callers send none; those get this server's own origin.
   */
  const lockTo = origin ?? url.origin;

  try {
    const { PyAI } = await import("@pyai/sdk");
    const client = new PyAI({ apiKey });
    const session = await client.omni.createSession({
      allowedOrigins: [lockTo],
      ttlSeconds,
      ...(process.env.PYAI_AGENT_ID
        ? { sessionLabel: process.env.PYAI_AGENT_ID }
        : {}),
    });

    return NextResponse.json(
      {
        provider: "pyai",
        token: session.token,
        url: session.url,
        expiresIn: ttlSeconds,
        agentId: process.env.PYAI_AGENT_ID || null,
      },
      { headers }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[session-token] PyAI grant failed:", message);
    return NextResponse.json(
      { error: `PyAI session could not be created: ${message}`, code: "create_session_failed" },
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

function clampTtl(value: string | undefined): number {
  const parsed = Number(value ?? 60);
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(30, Math.min(300, Math.round(parsed)));
}
