import { NextResponse } from "next/server";
import { getProductByKey } from "../../../../src/server/product-store";

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
function authorise(
  key: string | null,
  origin: string | null,
  self: string
): { ok: true } | { ok: false; reason: string } {
  if (!origin || origin === self) return { ok: true };
  if (!key) {
    return {
      ok: false,
      reason: "a product key is required to mint voice from another origin",
    };
  }

  const product = getProductByKey(key);
  if (!product) return { ok: false, reason: "unknown product key" };
  if (product.allowedOrigins.length > 0) {
    return product.allowedOrigins.includes(origin)
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
  const apiKey = process.env.DEEPGRAM_API_KEY;
  const origin = req.headers.get("origin");
  const headers = cors(origin);

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

  const url = new URL(req.url);
  const decision = authorise(url.searchParams.get("key"), origin, url.origin);
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.reason, code: "origin_not_allowed" },
      { status: 403, headers }
    );
  }

  const configuredOrigins = process.env.DEEPGRAM_ALLOWED_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    origin &&
    configuredOrigins &&
    configuredOrigins.length > 0 &&
    !configuredOrigins.includes(origin)
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
