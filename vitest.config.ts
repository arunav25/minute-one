import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@minute-one/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
    },
  },
});
