import { NextResponse } from "next/server";
import { getProductByKey } from "../../../../src/server/product-store";
import { compileProduct } from "../../../../src/server/compile-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the embedded script fetches with its product key.
 *
 * Returns context and journey only. No PyAI credential is ever included here —
 * voice is authorised separately by /api/minute-one/session, which keeps the
 * secret key server-side.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "missing product key" }, { status: 400 });
  }

  const product = await getProductByKey(key);
  if (!product) {
    return NextResponse.json({ error: "unknown product key" }, { status: 404 });
  }

  const origin = req.headers.get("origin");
  if (product.allowedOrigins.length > 0 && origin) {
    if (!product.allowedOrigins.includes(origin)) {
      return NextResponse.json(
        { error: `origin ${origin} is not allowed for this product` },
        { status: 403 }
      );
    }
  }

  const config = await compileProduct(product);

  // The script is loaded onto other origins, so the config has to be readable
  // cross-origin. It contains no secret.
  return NextResponse.json(config, {
    headers: {
      "access-control-allow-origin": origin ?? "*",
      "cache-control": "no-store",
    },
  });
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": req.headers.get("origin") ?? "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
