import { NextResponse } from "next/server";
import { getProductByKey } from "../../../../../src/server/product-store";
import { embedQuery } from "../../../../../src/server/embeddings";
import { searchKnowledge } from "../../../../../src/server/knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Semantic search over a product's ingested knowledge base.
 *
 * This is what the voice agent calls, through its `search_knowledge` function,
 * when a user asks a question. It embeds the query and returns the nearest
 * article chunks. No knowledge is stuffed into the prompt up front; it is
 * retrieved on demand and only for the product the key belongs to.
 *
 * The script runs on other origins, so this answers cross-origin. It returns
 * only public help-article text — no credential — so reflecting the caller is
 * safe. The embedding key never leaves the server.
 */
function cors(origin: string | null) {
  return {
    "access-control-allow-origin": origin ?? "*",
    "cache-control": "no-store",
    vary: "origin",
  };
}

export async function GET(req: Request) {
  const headers = cors(req.headers.get("origin"));
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const q = url.searchParams.get("q");
  const k = Math.min(Number(url.searchParams.get("k")) || 4, 8);

  if (!key || !q) {
    return NextResponse.json(
      { error: "key and q are required" },
      { status: 400, headers }
    );
  }
  // A product key is public, but scoping search to a real product stops one
  // product's key from reading another's corpus.
  if (!(await getProductByKey(key))) {
    return NextResponse.json({ error: "unknown product key" }, { status: 404, headers });
  }

  try {
    const queryEmbedding = await embedQuery(q);
    const hits = await searchKnowledge(key, queryEmbedding, k);
    return NextResponse.json({ query: q, hits }, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502, headers });
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...cors(req.headers.get("origin")),
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
