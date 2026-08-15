/**
 * Seed the NeonDB `products` table from your local `.data/products.json`.
 *
 *   node scripts/seed-products.mjs
 *
 * The product store is file-based locally but Neon-backed wherever DATABASE_URL
 * is set (Vercel has no persistent disk). Run this once after pointing at Neon
 * so the products you built in the console — JustCall, Acme — exist in the
 * database the deployed app reads. Re-running replaces the whole set.
 *
 * With DATABASE_URL set it writes to Neon. Without one it writes the local
 * JSON store instead, so a fresh clone can seed and run with no database and no
 * API key at all — which is the whole point of a five-minute setup.
 *
 * With no local .data/products.json it falls back to examples/sample-products.json,
 * so `git clone && npm install && node scripts/seed-products.mjs` gives you a
 * working product, two journeys and a knowledge base to look at.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import nextEnv from "@next/env"; // CJS module — no named exports
const { loadEnvConfig } = nextEnv;
import { neon } from "@neondatabase/serverless";

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

const local = join(process.cwd(), ".data", "products.json");
const sample = join(process.cwd(), "examples", "sample-products.json");

let products;
let source;
for (const candidate of [local, sample]) {
  try {
    products = JSON.parse(readFileSync(candidate, "utf8"));
    source = candidate;
    break;
  } catch {
    /* try the next one */
  }
}
if (!products) {
  console.error(`No products found in ${local} or ${sample}.`);
  process.exit(1);
}
if (!Array.isArray(products) || products.length === 0) {
  console.error(`No products in ${source}.`);
  process.exit(1);
}
console.log(`reading ${source.replace(process.cwd() + "/", "")}`);

// No database? Seed the local JSON store, which the product store reads when
// DATABASE_URL is unset. A clone then works with no cloud account at all.
if (!process.env.DATABASE_URL) {
  mkdirSync(dirname(local), { recursive: true });
  writeFileSync(local, JSON.stringify(products, null, 2) + "\n");
  console.log(`seeded ${products.length} products into .data/products.json (no DATABASE_URL set)`);
  for (const p of products) {
    console.log(`  ${p.name} (${p.key}) — ${(p.journeys || []).length} journey(s)`);
  }
  process.exit(0);
}

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS products (
    id         TEXT PRIMARY KEY,
    key        TEXT UNIQUE NOT NULL,
    data       JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

// Replace the whole set, matching the store's write-all semantics.
const inserts = products.map(
  (p) =>
    sql`INSERT INTO products (id, key, data)
        VALUES (${p.id}, ${p.key}, ${JSON.stringify(p)}::jsonb)`
);
await sql.transaction([sql`DELETE FROM products`, ...inserts]);

console.log(`seeded ${products.length} products into NeonDB:`);
for (const p of products) {
  console.log(`  ${p.name} (${p.key}) — ${p.allowedOrigins?.length || 0} origin(s)`);
}
