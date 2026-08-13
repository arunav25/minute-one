import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Per-product semantic knowledge base.
 *
 * The ingest script writes `.data/knowledge/<productKey>.ndjson` — one chunk
 * per line, each with its embedding. This loads that file into memory once and
 * answers nearest-neighbour queries by brute-force cosine. A few thousand
 * chunks is well within reach of a linear scan (a query is a handful of
 * milliseconds), so there is no vector database to run for this beta.
 *
 * A missing file is not an error: it just means the product has no ingested
 * corpus, and search returns nothing. The agent's persona already tells it to
 * say it does not know rather than invent.
 */

export type KnowledgeChunk = {
  productKey: string;
  articleId: string;
  title: string;
  url: string;
  chunk: number;
  text: string;
  embedding: number[];
};

export type KnowledgeHit = {
  title: string;
  url: string;
  text: string;
  score: number;
};

const DIR = join(
  process.env.MINUTE_ONE_DATA_DIR ?? join(process.cwd(), ".data"),
  "knowledge"
);

// Loaded corpora, keyed by product. Cleared per-process; the dev server reloads
// on restart, which is when a fresh ingest is picked up.
const cache = new Map<string, KnowledgeChunk[]>();

function load(productKey: string): KnowledgeChunk[] {
  const cached = cache.get(productKey);
  if (cached) return cached;

  const path = join(DIR, `${productKey}.ndjson`);
  let chunks: KnowledgeChunk[] = [];
  if (existsSync(path)) {
    chunks = readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as KnowledgeChunk);
  }
  cache.set(productKey, chunks);
  return chunks;
}

export function hasKnowledgeBase(productKey: string): boolean {
  return load(productKey).length > 0;
}

export function knowledgeBaseSize(productKey: string): number {
  return load(productKey).length;
}

/** Cosine similarity. Vectors are the same length (same embedding model). */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Nearest chunks to a query embedding. De-duplicates by article so one long
 * article cannot fill every slot, which keeps the answer grounded in a spread
 * of sources rather than a single page.
 */
export function searchKnowledge(
  productKey: string,
  queryEmbedding: number[],
  k = 4
): KnowledgeHit[] {
  const chunks = load(productKey);
  if (!chunks.length) return [];

  const scored = chunks
    .map((c) => ({ c, score: cosine(queryEmbedding, c.embedding) }))
    .sort((x, y) => y.score - x.score);

  const hits: KnowledgeHit[] = [];
  const seenArticles = new Set<string>();
  for (const { c, score } of scored) {
    if (seenArticles.has(c.articleId)) continue;
    seenArticles.add(c.articleId);
    hits.push({ title: c.title, url: c.url, text: c.text, score });
    if (hits.length >= k) break;
  }
  return hits;
}
