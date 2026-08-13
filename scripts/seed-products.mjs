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
 * Requires DATABASE_URL in the environment (loaded from .env.local).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import nextEnv from "@next/env"; // CJS module — no named exports
const { loadEnvConfig } = nextEnv;
import { neon } from "@neondatabase/serverless";

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL in .env.local to your Neon connection string.");
  process.exit(1);
}

const file = join(process.cwd(), ".data", "products.json");
let products;
try {
  products = JSON.parse(readFileSync(file, "utf8"));
} catch {
  console.error(`Could not read ${file}. Create products in the console first.`);
  process.exit(1);
}
if (!Array.isArray(products) || products.length === 0) {
  console.error("No products found in .data/products.json.");
  process.exit(1);
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
