import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Products and their knowledge bases.
 *
 * A product is what you create inside Minute One: a name, a key, and the
 * context the guide is allowed to know. The key is what the embedded script
 * presents to fetch that context, so one script can serve any number of host
 * applications without a rebuild.
 *
 * Persisted to a JSON file rather than a database. Beta scope: keys have to
 * survive a dev-server restart, nothing more. Not multi-tenant, no auth — see
 * DISCLOSURE.md.
 */

export type KnowledgeEntry = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

export type JourneyStepDraft = {
  id: string;
  /** What the user should achieve. */
  objective: string;
  /** Spoken instruction. */
  instruction: string;
  /** Accessible name of the control to point at. Optional. */
  targetName?: string;
  /** Text that must be visible for the step to count as proven. */
  successText?: string;
  /** Route glob that must match, e.g. "/settings*". Optional. */
  successRoute?: string;
};

export type Product = {
  id: string;
  key: string;
  name: string;
  /** Host origins allowed to use this key. Empty means any (beta only). */
  allowedOrigins: string[];
  knowledge: KnowledgeEntry[];
  /** Optional authored journey. Without it the guide answers but cannot verify. */
  goal: string;
  goalPhrases: string[];
  steps: JourneyStepDraft[];
  createdAt: string;
};

// `MINUTE_ONE_DATA_DIR` exists so tests can write somewhere disposable instead
// of the working copy's `.data`.
const FILE = join(
  process.env.MINUTE_ONE_DATA_DIR ?? join(process.cwd(), ".data"),
  "products.json"
);

let cache: Product[] | null = null;

/**
 * Fill in anything the stored record is missing.
 *
 * The file is hand-editable and has outlived a couple of shape changes, so a
 * record can arrive without every field. Readers must not have to defend
 * themselves — in particular `allowedOrigins`, where a missing value read as
 * "no restriction" would quietly unlock a key.
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
    createdAt: raw.createdAt ?? new Date().toISOString(),
  };
}

function load(): Product[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as Partial<Product>[];
    cache = Array.isArray(raw) ? raw.map(normalise) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist() {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(cache ?? [], null, 2));
}

const id = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;

export function listProducts(): Product[] {
  return load().map((p) => ({ ...p }));
}

export function getProduct(productId: string): Product | undefined {
  return load().find((p) => p.id === productId);
}

export function getProductByKey(key: string): Product | undefined {
  return load().find((p) => p.key === key);
}

export function createProduct(name: string): Product {
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
    createdAt: new Date().toISOString(),
  };
  load().push(product);
  persist();
  return product;
}

export function updateProduct(
  productId: string,
  patch: Partial<Omit<Product, "id" | "key" | "createdAt">>
): Product | undefined {
  const product = getProduct(productId);
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
  persist();
  return product;
}

export function addKnowledge(
  productId: string,
  title: string,
  body: string
): Product | undefined {
  const product = getProduct(productId);
  if (!product) return undefined;
  product.knowledge.push({
    id: id("kb"),
    title: title.trim() || "Untitled note",
    body: body.trim(),
    updatedAt: new Date().toISOString(),
  });
  persist();
  return product;
}

export function removeKnowledge(
  productId: string,
  entryId: string
): Product | undefined {
  const product = getProduct(productId);
  if (!product) return undefined;
  product.knowledge = product.knowledge.filter((k) => k.id !== entryId);
  persist();
  return product;
}

export function deleteProduct(productId: string): boolean {
  const all = load();
  const index = all.findIndex((p) => p.id === productId);
  if (index === -1) return false;
  all.splice(index, 1);
  persist();
  return true;
}
