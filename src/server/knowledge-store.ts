import { dbConfigured, getSql, toVectorLiteral } from "./db";

/**
 * Per-product semantic knowledge base, backed by NeonDB (Postgres + pgvector).
 *
 * The ingest script embeds every article chunk and writes it to the
 * `knowledge_chunks` table. At answer time the search route embeds the user's
 * question and asks Postgres for the nearest chunks by cosine distance
 * (`embedding <=> query`), scoped to the product's key.
 *
 * A missing DATABASE_URL, an empty table, or a product with no rows is not an
 * error: search returns nothing and the agent's persona tells it to say it does
 * not know rather than invent.
 */

export type KnowledgeHit = {
  title: string;
  url: string;
  text: string;
  score: number;
};

/** One trained source as the console sees it: an article or a note, grouped. */
export type TrainedSource = {
  articleId: string;
  title: string;
  url: string;
  chunks: number;
  bytes: number;
  trainedAt: string | null;
};

// A product's KB presence rarely changes, but it CAN — a fresh ingest adds
// rows while the server is already running. Cache the answer briefly so we do
// not hit the DB on every config fetch, but still pick up a new corpus within
// the TTL without a redeploy.
const PRESENCE_TTL_MS = 60_000;
const presence = new Map<string, { has: boolean; at: number }>();

export async function hasKnowledgeBase(productKey: string): Promise<boolean> {
  if (!dbConfigured()) return false;
  const now = Date.now();
  const cached = presence.get(productKey);
  if (cached && now - cached.at < PRESENCE_TTL_MS) return cached.has;
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT EXISTS(
        SELECT 1 FROM knowledge_chunks WHERE product_key = ${productKey}
      ) AS present`;
    const has = Boolean(rows[0]?.present);
    presence.set(productKey, { has, at: now });
    return has;
  } catch {
    // Table not created yet (nobody has ingested), or DB unreachable. Treat as
    // "no knowledge base" so config still compiles and the guide still answers.
    return false;
  }
}

/**
 * Nearest chunks to a query embedding. Postgres does the ranking; we over-fetch
 * and de-duplicate by article in JS so one long article cannot fill every slot,
 * keeping the answer grounded across a spread of sources.
 */
export async function searchKnowledge(
  productKey: string,
  queryEmbedding: number[],
  k = 4
): Promise<KnowledgeHit[]> {
  if (!dbConfigured()) return [];
  const sql = getSql();
  const vec = toVectorLiteral(queryEmbedding);
  const rows = (await sql`
    SELECT title, url, text, article_id,
           1 - (embedding <=> ${vec}::vector) AS score
    FROM knowledge_chunks
    WHERE product_key = ${productKey}
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${k * 5}`) as Array<{
    title: string;
    url: string;
    text: string;
    article_id: string;
    score: number;
  }>;

  const hits: KnowledgeHit[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.article_id)) continue;
    seen.add(r.article_id);
    hits.push({ title: r.title, url: r.url, text: r.text, score: Number(r.score) });
    if (hits.length >= k) break;
  }
  return hits;
}

/* -------------------------------------------------------------------------- */
/* Source management (console)                                                */
/* -------------------------------------------------------------------------- */

/**
 * Console training writes through these. The table may not exist yet on a
 * fresh database (the CLI ingester normally creates it), so training from the
 * console must be able to create it too.
 */
async function ensureTable(): Promise<void> {
  const sql = getSql();
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id          BIGSERIAL PRIMARY KEY,
      product_key TEXT NOT NULL,
      article_id  TEXT NOT NULL,
      title       TEXT NOT NULL,
      url         TEXT NOT NULL DEFAULT '',
      chunk       INT  NOT NULL DEFAULT 0,
      text        TEXT NOT NULL,
      embedding   vector(1536) NOT NULL
    )`;
  await sql`ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
  await sql`CREATE INDEX IF NOT EXISTS knowledge_chunks_product_idx ON knowledge_chunks (product_key)`;
}

// The CLI ingester may have created the table before created_at existed, and
// reading it would then fail forever. Upgrade once per process, not per read.
let upgraded: Promise<void> | null = null;
function upgradeOnce(): Promise<void> {
  if (!upgraded) {
    const sql = getSql();
    upgraded = sql`ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
      .then(() => undefined)
      .catch(() => undefined); // no table yet — nothing to upgrade
  }
  return upgraded;
}

/** Every trained source for a product, one row per article/note. */
export async function listTrainedSources(
  productKey: string
): Promise<TrainedSource[]> {
  if (!dbConfigured()) return [];
  try {
    const sql = getSql();
    await upgradeOnce();
    const rows = (await sql`
      SELECT article_id,
             max(title)                       AS title,
             max(url)                         AS url,
             count(*)::int                    AS chunks,
             sum(length(text))::int           AS bytes,
             max(created_at)                  AS trained_at
      FROM knowledge_chunks
      WHERE product_key = ${productKey}
      GROUP BY article_id
      ORDER BY max(created_at) DESC`) as Array<{
      article_id: string;
      title: string;
      url: string;
      chunks: number;
      bytes: number;
      trained_at: string | null;
    }>;
    return rows.map((r) => ({
      articleId: r.article_id,
      title: r.title,
      url: r.url,
      chunks: r.chunks,
      bytes: r.bytes,
      trainedAt: r.trained_at ? new Date(r.trained_at).toISOString() : null,
    }));
  } catch {
    // No table yet — nothing has been trained.
    return [];
  }
}

/** Replace one source's chunks (retrain) atomically. */
export async function replaceSourceChunks(
  productKey: string,
  articleId: string,
  title: string,
  url: string,
  chunks: string[],
  embeddings: number[][]
): Promise<void> {
  const sql = getSql();
  await ensureTable();
  const statements = [
    sql`DELETE FROM knowledge_chunks
        WHERE product_key = ${productKey} AND article_id = ${articleId}`,
    ...chunks.map(
      (text, i) =>
        sql`INSERT INTO knowledge_chunks (product_key, article_id, title, url, chunk, text, embedding)
            VALUES (${productKey}, ${articleId}, ${title}, ${url}, ${i}, ${text}, ${toVectorLiteral(embeddings[i])}::vector)`
    ),
  ];
  await sql.transaction(statements);
  presence.delete(productKey);
}

/** Remove one source (an imported article or a trained note) from the index. */
export async function deleteSource(
  productKey: string,
  articleId: string
): Promise<void> {
  if (!dbConfigured()) return;
  try {
    const sql = getSql();
    await sql`DELETE FROM knowledge_chunks
              WHERE product_key = ${productKey} AND article_id = ${articleId}`;
    presence.delete(productKey);
  } catch {
    // No table — nothing to delete.
  }
}
