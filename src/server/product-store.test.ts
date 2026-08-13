import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test, vi } from "vitest";

/**
 * The store is the only thing standing between an edited journey and an
 * unlocked product key, so the patch semantics are worth pinning down.
 */
async function freshStore(seed?: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "minute-one-store-"));
  if (seed !== undefined) {
    writeFileSync(join(dir, "products.json"), JSON.stringify(seed));
  }
  process.env.MINUTE_ONE_DATA_DIR = dir;
  // Force the file backend regardless of the developer's environment, so these
  // tests never reach for a real database.
  delete process.env.DATABASE_URL;
  vi.resetModules();
  return import("./product-store");
}

beforeEach(() => {
  delete process.env.MINUTE_ONE_DATA_DIR;
});

test("updating one field leaves the others alone", async () => {
  const store = await freshStore();
  const product = await store.createProduct("Acme");
  await store.updateProduct(product.id, { allowedOrigins: ["https://acme.test"] });

  // A journey edit sends `undefined` for every field it does not touch.
  await store.updateProduct(product.id, {
    goal: "Invite your team",
    name: undefined,
    allowedOrigins: undefined,
  } as Parameters<typeof store.updateProduct>[1]);

  const after = (await store.getProduct(product.id))!;
  expect(after.goal).toBe("Invite your team");
  expect(after.allowedOrigins).toEqual(["https://acme.test"]);
  expect(after.name).toBe("Acme");
});

test("a key stays locked to its origins across an update", async () => {
  const store = await freshStore();
  const product = await store.createProduct("Acme");
  await store.updateProduct(product.id, { allowedOrigins: ["https://acme.test"] });
  await store.updateProduct(product.id, { steps: [] });

  expect((await store.getProductByKey(product.key))!.allowedOrigins).toEqual([
    "https://acme.test",
  ]);
});

test("a record missing fields loads with safe defaults", async () => {
  const store = await freshStore([{ id: "prod_x", key: "mo_pk_x" }]);
  const product = (await store.getProductByKey("mo_pk_x"))!;

  // Readers index into these directly; undefined would throw or, for
  // allowedOrigins, read as "any origin may use this key".
  expect(product.allowedOrigins).toEqual([]);
  expect(product.knowledge).toEqual([]);
  expect(product.steps).toEqual([]);
  expect(product.goalPhrases).toEqual([]);
  expect(typeof product.name).toBe("string");
});
