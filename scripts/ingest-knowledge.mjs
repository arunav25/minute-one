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
 *   5. Append {productKey, articleId, title, url, chunk, text, embedding} to
 *      .data/knowledge/<productKey>.ndjson — one JSON object per line.
 *
 * The embeddings are NOT training. They are a lookup index: at query time the
 * search endpoint embeds the user's question and returns the nearest chunks for
 * the LLM to ground its answer on. Deepgram/PyAI never see the whole corpus.
 *
 * Cost: ~1,185 JustCall articles is roughly 1M tokens ≈ $0.02 on
 * text-embedding-3-small. Re-running overwrites the product's file.
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { join, resolve } from "node:path";

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
    "Set OPENAI_API_KEY (or EMBEDDING_API_KEY) in the environment. Semantic\n" +
      "search needs an embedding provider — Deepgram and PyAI do not embed."
  );
  process.exit(1);
}

/** Find the markdown directory whether given the archive root or the md folder. */
function findMarkdownDir(dir) {
  const d = resolve(dir.replace(/^~/, process.env.HOME ?? "~"));
  const candidates = [d, join(d, "historical", "markdown"), join(d, "markdown")];
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

const outDir = join(process.cwd(), ".data", "knowledge");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${productKey}.ndjson`);
const out = await open(outPath, "w");

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

const BATCH = 96;
let done = 0;
for (let i = 0; i < pending.length; i += BATCH) {
  const slice = pending.slice(i, i + BATCH);
  const vectors = await embedBatch(slice.map((s) => s.text));
  for (let j = 0; j < slice.length; j++) {
    await out.write(JSON.stringify({ ...slice[j], embedding: vectors[j] }) + "\n");
  }
  done += slice.length;
  if (done % (BATCH * 5) === 0 || done === pending.length) {
    console.log(`  embedded ${done}/${pending.length}`);
  }
}
await out.close();
console.log(`wrote ${outPath} (${pending.length} chunks for ${productKey})`);
console.log("restart the dev server so the knowledge store loads it.");
