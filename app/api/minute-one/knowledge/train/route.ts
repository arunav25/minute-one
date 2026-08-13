import { NextResponse } from "next/server";
import { getProduct } from "../../../../../src/server/product-store";
import { chunkText } from "../../../../../src/server/chunk";
import { embedBatch, embeddingConfigured } from "../../../../../src/server/embeddings";
import { replaceSourceChunks } from "../../../../../src/server/knowledge-store";
import { dbConfigured } from "../../../../../src/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Retrain agent": embed every console note (text, Q&A, file) into the
 * semantic index, so the voice agent's search_knowledge tool retrieves them
 * exactly like imported help-center articles.
 *
 * Notes are re-embedded wholesale. A product has a handful of notes at most,
 * so correctness (no stale chunks ever) is worth more than the fraction of a
 * cent saved by diffing. Imported articles are untouched — the CLI owns them.
 *
 * Console-only, same-origin, takes a productId the embed never has.
 */
export async function POST(req: Request) {
  let body: { productId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "malformed json" }, { status: 400 });
  }

  const product = await getProduct(String(body.productId ?? ""));
  if (!product) {
    return NextResponse.json({ error: "unknown product" }, { status: 404 });
  }
  if (!dbConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL is not set — training needs NeonDB" },
      { status: 503 }
    );
  }
  if (!embeddingConfigured()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set — training needs an embedding provider" },
      { status: 503 }
    );
  }

  try {
    let trainedNotes = 0;
    let totalChunks = 0;
    for (const note of product.knowledge) {
      // A Q&A pair is embedded as one passage; the question inside the text is
      // strong retrieval signal for exactly that question being asked.
      const text = `${note.title}\n\n${note.body}`;
      const chunks = chunkText(text);
      if (!chunks.length) continue;
      const embeddings = await embedBatch(chunks);
      await replaceSourceChunks(
        product.key,
        note.id,
        note.title,
        "",
        chunks,
        embeddings
      );
      trainedNotes++;
      totalChunks += chunks.length;
    }
    return NextResponse.json({
      trainedNotes,
      totalChunks,
      trainedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
