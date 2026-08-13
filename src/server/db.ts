import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * NeonDB connection for the semantic knowledge base.
 *
 * The Neon serverless driver speaks HTTP, so it works the same in a Node script
 * (the ingester) and in a Vercel serverless function (the search route) — no
 * connection pool to manage, no socket that a serverless invocation would leak.
 *
 * The connection string lives only in the environment (DATABASE_URL). It holds
 * a password, so it is never committed and never sent to the browser.
 */

/** text-embedding-3-small produces 1536-dimensional vectors. */
export const EMBEDDING_DIM = 1536;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

let cached: NeonQueryFunction<false, false> | null = null;

export function getSql(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — add your Neon connection string to the environment"
    );
  }
  if (!cached) cached = neon(url);
  return cached;
}

/** Format a JS number[] as a pgvector literal, e.g. "[0.1,0.2,...]". */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
