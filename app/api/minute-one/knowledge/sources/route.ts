import { NextResponse } from "next/server";
import { getProduct } from "../../../../../src/server/product-store";
import { listTrainedSources } from "../../../../../src/server/knowledge-store";
import { embeddingConfigured } from "../../../../../src/server/embeddings";
import { dbConfigured } from "../../../../../src/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The console's unified view of a product's data sources.
 *
 * One list, two origins merged:
 *   - Notes added in the console (text, Q&A, uploaded files) live on the
 *     product record. Their `trained` flag says whether their embeddings are in
 *     the index yet.
 *   - Imported help-center articles live only in the index (they were ingested
 *     by the CLI), so they are read back from it.
 *
 * Console-only endpoint: it takes a productId, which the public embed never
 * has, and it is same-origin like the rest of the console API.
 */
export async function GET(req: Request) {
  const productId = new URL(req.url).searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "missing productId" }, { status: 400 });
  }
  const product = await getProduct(productId);
  if (!product) {
    return NextResponse.json({ error: "unknown product" }, { status: 404 });
  }

  const trained = await listTrainedSources(product.key);
  const trainedById = new Map(trained.map((t) => [t.articleId, t]));
  const noteIds = new Set(product.knowledge.map((k) => k.id));

  const notes = product.knowledge.map((k) => {
    const t = trainedById.get(k.id);
    return {
      id: k.id,
      kind: k.kind ?? "text",
      title: k.title,
      bytes: k.body.length,
      updatedAt: k.updatedAt,
      trained: Boolean(t),
      trainedAt: t?.trainedAt ?? null,
      chunks: t?.chunks ?? 0,
    };
  });

  // Whatever is in the index but is not a note came from an archive import.
  const articles = trained
    .filter((t) => !noteIds.has(t.articleId))
    .map((t) => ({
      id: t.articleId,
      kind: "article" as const,
      title: t.title,
      url: t.url,
      bytes: t.bytes,
      updatedAt: t.trainedAt,
      trained: true,
      trainedAt: t.trainedAt,
      chunks: t.chunks,
    }));

  const lastTrainedAt =
    trained
      .map((t) => t.trainedAt)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

  return NextResponse.json({
    sources: [...notes, ...articles],
    lastTrainedAt,
    totalBytes: [...notes, ...articles].reduce((n, s) => n + s.bytes, 0),
    // The panel says exactly why training is unavailable instead of failing.
    canTrain: dbConfigured() && embeddingConfigured(),
  });
}
