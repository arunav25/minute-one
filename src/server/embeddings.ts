/**
 * Embed a query string, server-side, with the same provider the ingest script
 * used. The key stays on the server; the browser never sees it.
 *
 * Provider is configurable so a different OpenAI-compatible embedding endpoint
 * can be dropped in without touching callers:
 *   EMBEDDING_API_URL   default https://api.openai.com/v1/embeddings
 *   EMBEDDING_MODEL     default text-embedding-3-small
 *   EMBEDDING_API_KEY   falls back to OPENAI_API_KEY
 *
 * The model here MUST match the one used at ingest — vectors from two different
 * models are not comparable, and cosine search would return nonsense.
 */
const URL = process.env.EMBEDDING_API_URL || "https://api.openai.com/v1/embeddings";
const MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

function apiKey(): string | null {
  return process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || null;
}

export function embeddingConfigured(): boolean {
  return Boolean(apiKey());
}

export async function embedQuery(text: string): Promise<number[]> {
  return (await embedBatch([text.slice(0, 8000)]))[0];
}

/** Embed several texts in one request — used when training console notes. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const key = apiKey();
  if (!key) {
    throw new Error(
      "no embedding key: set OPENAI_API_KEY (or EMBEDDING_API_KEY) in .env.local"
    );
  }
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(
      `embedding request failed (${res.status}): ${(await res.text()).slice(0, 200)}`
    );
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}
