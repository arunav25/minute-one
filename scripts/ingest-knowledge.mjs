/**
 * Ingest a folder of help-center markdown articles into a per-product knowledge
 * base the voice agent can search at answer time.
 *
 *   node scripts/ingest-knowledge.mjs <articles-dir-or-zip-root> <productKey>
 *
 * Example:
 *   node scripts/ingest-knowledge.mjs \
 *     ~/Downloads/justcall-help-center-archive mo_pk_9c2b11bbcef62f212c9bafd7
 *
 * What it does, per article (.md with YAML frontmatter + HTML body):
 *   1. Parse the frontmatter (title, description, original_url, article_id).
 *   2. Strip the HTML to clean text.
 *   3. Split into overlapping chunks small enough to embed and to quote back.
 *   4. Embed each chunk (OpenAI text-embedding-3-small by default).
 *   5. Upsert {productKey, articleId, title, url, chunk, text, embedding} into
 *      the NeonDB `knowledge_chunks` table (Postgres + pgvector).
 *
 * The embeddings are NOT training. They are a lookup index: at query time the
 * search endpoint embeds the user's question and returns the nearest chunks for
 * the LLM to ground its answer on. Deepgram/PyAI never see the whole corpus.
 *
 * Requires in the environment (loaded from .env.local automatically):
 *   OPENAI_API_KEY   (or EMBEDDING_API_KEY)  — to embed
 *   DATABASE_URL     — Neon connection string, to store
 *
 * Cost: ~1,185 JustCall articles is roughly 1M tokens ≈ $0.02 on
 * text-embedding-3-small. Re-running replaces that product's rows.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import nextEnv from "@next/env"; // CJS module — no named exports
const { loadEnvConfig } = nextEnv;
import { neon } from "@neondatabase/serverless";

// A bare `node` process does not read .env.local (that is a Next.js behaviour).
// Load it the same way Next does so OPENAI_API_KEY and DATABASE_URL are present.
loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("--"));
const [rawDir, productKey] = argv.filter((a) => !a.startsWith("--"));
if (!rawDir || !productKey) {
  console.error(
    "usage: node scripts/ingest-knowledge.mjs <articles-dir> <productKey> [--include=file] [--match=regex]\n" +
      "  --include=file   only ingest article ids listed in file (one per line, # comments ok)\n" +
      "  --match=regex    only ingest articles whose title matches (case-insensitive)"
  );
  process.exit(1);
}

function flag(name) {
  const hit = flags.find((f) => f === `--${name}` || f.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") || true : undefined;
}

/**
 * Curation. For a demo you rarely want the whole help center — you want a
 * handful of on-topic articles (e.g. onboarding + buying a number) so the agent
 * stays on script for a panel. `--include` names a file of article ids to keep;
 * `--match` keeps articles whose title matches a regex. Neither present means
 * ingest everything, as before.
 */
const includeFile = flag("include");
const includeIds = includeFile
  ? new Set(
      readFileSync(resolve(String(includeFile)), "utf8")
        .split("\n")
        .map((l) => l.replace(/#.*$/, "").trim())
        .filter(Boolean)
    )
  : null;
const matchRe = flag("match") ? new RegExp(String(flag("match")), "i") : null;

const EMBEDDING_URL =
  process.env.EMBEDDING_API_URL || "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const EMBEDDING_KEY = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;

if (!EMBEDDING_KEY) {
  console.error(
    "Set OPENAI_API_KEY (or EMBEDDING_API_KEY) in .env.local. Semantic search\n" +
      "needs an embedding provider — Deepgram and PyAI do not embed."
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error(
    "Set DATABASE_URL in .env.local to your Neon connection string. The\n" +
      "knowledge base is stored in Postgres so Vercel can read it at answer time."
  );
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

/** Find the markdown directory whether given the archive root or the md folder. */
function findMarkdownDir(dir) {
  const d = resolve(dir.replace(/^~/, process.env.HOME ?? "~"));
  // Article folders first: the archive root may hold a stray README.md, which
  // must not win over the actual corpus.
  const candidates = [join(d, "historical", "markdown"), join(d, "markdown"), d];
  for (const c of candidates) {
    if (existsSync(c) && readdirSync(c).some((f) => f.endsWith(".md"))) return c;
  }
  throw new Error(`no .md files found under ${d}`);
}

/** Split "---\n…\n---\nbody" into {front, body}. */
function splitFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { front: {}, body: raw };
  const front = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (kv) front[kv[1]] = kv[2];
  }
  return { front, body: m[2] };
}

/** HTML + markdown → readable plain text. */
function toText(body) {
  return body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(li|p|div|h[1-6]|br|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/^#+\s*/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const CHUNK = 1100;
const OVERLAP = 150;

/** Break text on paragraph/sentence boundaries into ~CHUNK-sized pieces. */
function chunkText(text) {
  if (text.length <= CHUNK) return text ? [text] : [];
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + CHUNK, text.length);
    if (end < text.length) {
      const window = text.slice(i, end);
      const brk = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "));
      if (brk > CHUNK * 0.5) end = i + brk + 1;
    }
    const piece = text.slice(i, end).trim();
    if (piece) chunks.push(piece);
    if (end >= text.length) break;
    i = end - OVERLAP;
  }
  return chunks;
}

async function embedBatch(inputs) {
  const res = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${EMBEDDING_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  });
  if (!res.ok) {
    throw new Error(`embedding request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

const mdDir = findMarkdownDir(rawDir);
let files = readdirSync(mdDir).filter((f) => f.endsWith(".md"));
console.log(`found ${files.length} articles in ${mdDir}`);

if (includeIds) {
  // Filenames are "<id>-<slug>.md"; keep only the curated ids.
  files = files.filter((f) => includeIds.has(f.split("-")[0]));
  console.log(`--include: ${files.length}/${includeIds.size} curated ids matched`);
  const missing = [...includeIds].filter(
    (id) => !files.some((f) => f.split("-")[0] === id)
  );
  if (missing.length) console.warn(`  no file for ids: ${missing.join(", ")}`);
}

// Make sure pgvector and the table exist. Idempotent, so re-running is safe.
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
    embedding   vector(1536) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
// Older tables predate created_at; the console's source list needs it.
await sql`ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
await sql`CREATE INDEX IF NOT EXISTS knowledge_chunks_product_idx ON knowledge_chunks (product_key)`;
// HNSW cosine index for fast nearest-neighbour once the corpus grows. Optional:
// search works without it (sequential scan), so an older pgvector must not block
// ingest.
try {
  await sql`CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)`;
} catch (err) {
  console.warn(`  (skipping HNSW index: ${err?.message ?? err})`);
}

// Collect chunks, then embed in batches to stay well under request limits.
const pending = [];
let articleCount = 0;
for (const file of files) {
  const { front, body } = splitFrontmatter(readFileSync(join(mdDir, file), "utf8"));
  const title = front.title || file.replace(/\.md$/, "");
  if (matchRe && !matchRe.test(title)) continue;
  const text = toText(body);
  const chunks = chunkText(text);
  if (!chunks.length) continue;
  articleCount++;
  chunks.forEach((chunk, index) =>
    pending.push({
      productKey,
      articleId: front.article_id || file.split("-")[0],
      title,
      url: front.original_url || "",
      chunk: index,
      text: chunk,
    })
  );
}
console.log(`${articleCount} articles → ${pending.length} chunks; embedding…`);

// Re-ingest replaces this product's imported rows so stale chunks never linger.
// Notes added in the console are left alone: they carry a `kb_` article id, and
// wiping somebody's hand-written answers because an archive was re-imported is
// not something a re-run should ever do silently.
await sql`DELETE FROM knowledge_chunks
          WHERE product_key = ${productKey} AND article_id NOT LIKE 'kb\\_%'`;

const BATCH = 96;
let done = 0;
for (let i = 0; i < pending.length; i += BATCH) {
  const slice = pending.slice(i, i + BATCH);
  const vectors = await embedBatch(slice.map((s) => s.text));

  // One parameterised INSERT per chunk, sent as a single transaction per batch.
  const inserts = slice.map((s, j) => {
    const vec = `[${vectors[j].join(",")}]`;
    return sql`
      INSERT INTO knowledge_chunks (product_key, article_id, title, url, chunk, text, embedding)
      VALUES (${s.productKey}, ${s.articleId}, ${s.title}, ${s.url}, ${s.chunk}, ${s.text}, ${vec}::vector)`;
  });
  await sql.transaction(inserts);

  done += slice.length;
  if (done % (BATCH * 5) === 0 || done === pending.length) {
    console.log(`  stored ${done}/${pending.length}`);
  }
}
console.log(`stored ${pending.length} chunks for ${productKey} in NeonDB.`);
console.log("no restart needed — the search route reads Neon live.");
