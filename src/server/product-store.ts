import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dbConfigured, getSql } from "./db";

/**
 * Products and their knowledge bases.
 *
 * A product is what you create inside Minute One: a name, a key, and the
 * context the guide is allowed to know. The key is what the embedded script
 * presents to fetch that context, so one script can serve any number of host
 * applications without a rebuild.
 *
 * Two backends, one code path. When DATABASE_URL is set (Vercel, and any local
 * dev that wants it) products live in NeonDB, which is the only thing that
 * survives on a serverless filesystem. Without it, they fall back to a local
 * JSON file so `npm test` and offline dev still work with no database. The
 * mutation semantics are identical either way — only `readAll`/`writeAll`
 * differ — so there is one place for the rules and one place for the storage.
 */

export type KnowledgeEntry = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
  /** How the source was added: a typed note, a Q&A pair, or an uploaded file. */
  kind?: "text" | "qa" | "file";
};

export type JourneyStepDraft = {
  id: string;
  /** What the user should achieve. */
  objective: string;
  /** Spoken instruction. */
  instruction: string;
  /** Accessible name of the control to point at. Optional. */
  targetName?: string;
  /**
   * CSS selector for the control, when it has no accessible name to match on.
   *
   * Real apps are full of icon-only buttons — the message action on a contact
   * row is one — and without this the guide can talk about them but cannot ring
   * them, which is most of the value. Brittle by nature, so it is the fallback:
   * `targetName` is tried first and a selector only used when that finds
   * nothing.
   */
  targetSelector?: string;
  /** Text that must be visible for the step to count as proven. */
  successText?: string;
  /** Route glob that must match, e.g. "/settings*". Optional. */
  successRoute?: string;
};

/**
 * One authored journey.
 *
 * A product has several: "add a number" and "send a message" are different
 * paths through the same app, chosen by what the user asks for, not by
 * position in a list. The engine already matched a spoken goal against
 * `goalPhrases`; it just had nowhere to choose *between* journeys.
 */
export type Journey = {
  id: string;
  goal: string;
  goalPhrases: string[];
  steps: JourneyStepDraft[];
};

export type Product = {
  id: string;
  key: string;
  name: string;
  /** Host origins allowed to use this key. Empty means any (beta only). */
  allowedOrigins: string[];
  knowledge: KnowledgeEntry[];
  /** Optional authored journey. Without it the guide answers but cannot verify. */
  /** The first journey's fields, kept so older records still load. */
  goal: string;
  goalPhrases: string[];
  steps: JourneyStepDraft[];
  journeys: Journey[];
  createdAt: string;
};

// `MINUTE_ONE_DATA_DIR` exists so tests can write somewhere disposable instead
// of the working copy's `.data`. Only used in the file fallback.
const FILE = join(
  process.env.MINUTE_ONE_DATA_DIR ?? join(process.cwd(), ".data"),
  "products.json"
);

/**
 * Fill in anything a stored record is missing.
 *
 * Records have outlived a couple of shape changes, so one can arrive without
 * every field. Readers must not have to defend themselves — in particular
 * `allowedOrigins`, where a missing value read as "no restriction" would
 * quietly unlock a key.
 */
function normalise(raw: Partial<Product>): Product {
  return {
    id: String(raw.id ?? id("prod")),
    key: String(raw.key ?? `mo_pk_${randomBytes(12).toString("hex")}`),
    name: raw.name ?? "Untitled product",
    allowedOrigins: Array.isArray(raw.allowedOrigins) ? raw.allowedOrigins : [],
    knowledge: Array.isArray(raw.knowledge) ? raw.knowledge : [],
    goal: raw.goal ?? "",
    goalPhrases: Array.isArray(raw.goalPhrases) ? raw.goalPhrases : [],
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    // A record written before journeys existed carries its single journey in
    // the top-level fields; it is lifted into the list rather than migrated in
    // place, so an older Minute One reading the same row still works.
    journeys: Array.isArray(raw.journeys) && raw.journeys.length > 0
      ? raw.journeys
      : Array.isArray(raw.steps) && raw.steps.length > 0
        ? [
            {
              id: "journey-1",
              goal: raw.goal ?? "",
              goalPhrases: Array.isArray(raw.goalPhrases) ? raw.goalPhrases : [],
              steps: raw.steps,
            },
          ]
        : [],
    createdAt: raw.createdAt ?? new Date().toISOString(),
  };
}

async function ensureProductsTable(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id         TEXT PRIMARY KEY,
      key        TEXT UNIQUE NOT NULL,
      data       JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
}

/** The whole product set. The store is small, so read-all/write-all is fine. */
async function readAll(): Promise<Product[]> {
  if (dbConfigured()) {
    try {
      const sql = getSql();
      const rows = (await sql`
        SELECT data FROM products ORDER BY data->>'createdAt'`) as Array<{
        data: Partial<Product>;
      }>;
      return rows.map((r) => normalise(r.data));
    } catch {
      // Table not created yet (nothing written), or DB briefly unreachable.
      return [];
    }
  }
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as Partial<Product>[];
    return Array.isArray(raw) ? raw.map(normalise) : [];
  } catch {
    return [];
  }
}

async function writeAll(products: Product[]): Promise<void> {
  if (dbConfigured()) {
    const sql = getSql();
    await ensureProductsTable();
    // Replace the set atomically. At beta scale the table is tiny, so a full
    // rewrite is simpler and safer than tracking per-row diffs.
    const inserts = products.map(
      (p) =>
        sql`INSERT INTO products (id, key, data)
            VALUES (${p.id}, ${p.key}, ${JSON.stringify(p)}::jsonb)`
    );
    await sql.transaction([sql`DELETE FROM products`, ...inserts]);
    return;
  }
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(products, null, 2));
}

const id = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;

export async function listProducts(): Promise<Product[]> {
  return (await readAll()).map((p) => ({ ...p }));
}

export async function getProduct(productId: string): Promise<Product | undefined> {
  return (await readAll()).find((p) => p.id === productId);
}

export async function getProductByKey(key: string): Promise<Product | undefined> {
  return (await readAll()).find((p) => p.key === key);
}

export async function createProduct(name: string): Promise<Product> {
  const products = await readAll();
  const product: Product = {
    id: id("prod"),
    // `mo_pk_` — public key. Safe in a page: it selects a product's context,
    // it does not authorise voice. The PyAI secret never leaves the server.
    key: `mo_pk_${randomBytes(12).toString("hex")}`,
    name: name.trim() || "Untitled product",
    allowedOrigins: [],
    knowledge: [],
    goal: "",
    goalPhrases: [],
    steps: [],
    journeys: [],
    createdAt: new Date().toISOString(),
  };
  products.push(product);
  await writeAll(products);
  return product;
}

export async function updateProduct(
  productId: string,
  patch: Partial<Omit<Product, "id" | "key" | "createdAt">>
): Promise<Product | undefined> {
  const products = await readAll();
  const product = products.find((p) => p.id === productId);
  if (!product) return undefined;
  // A patch omits what it does not change, and callers build patches with
  // `undefined` for absent fields. `Object.assign` would copy those over the
  // stored values, so an edit to the journey would erase `allowedOrigins` and
  // silently unlock the key. Only defined values are applied.
  for (const [field, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (product as Record<string, unknown>)[field] = value;
    }
  }
  await writeAll(products);
  return product;
}

export async function addKnowledge(
  productId: string,
  title: string,
  body: string,
  kind: KnowledgeEntry["kind"] = "text"
): Promise<Product | undefined> {
  const products = await readAll();
  const product = products.find((p) => p.id === productId);
  if (!product) return undefined;
  product.knowledge.push({
    id: id("kb"),
    title: title.trim() || "Untitled note",
    body: body.trim(),
    updatedAt: new Date().toISOString(),
    kind,
  });
  await writeAll(products);
  return product;
}

export async function removeKnowledge(
  productId: string,
  entryId: string
): Promise<Product | undefined> {
  const products = await readAll();
  const product = products.find((p) => p.id === productId);
  if (!product) return undefined;
  product.knowledge = product.knowledge.filter((k) => k.id !== entryId);
  await writeAll(products);
  return product;
}

export async function deleteProduct(productId: string): Promise<boolean> {
  const products = await readAll();
  const next = products.filter((p) => p.id !== productId);
  if (next.length === products.length) return false;
  await writeAll(next);
  return true;
}
